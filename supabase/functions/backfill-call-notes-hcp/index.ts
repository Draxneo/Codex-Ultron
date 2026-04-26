/**
 * backfill-call-notes-hcp — One-time batch function
 * Pushes call transcript summaries as notes to HCP jobs & estimates.
 * Covers the past 7 days. Safe to re-run (idempotent via hcp_note_synced flag).
 */
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

/**
 * Normalize an address string for fuzzy matching.
 * Strips unit/apt info, lowercases, removes punctuation, collapses whitespace.
 */
function normalizeAddress(addr: string): string {
  return addr
    .toLowerCase()
    .replace(/[.,#\-]/g, " ")
    .replace(/\b(apt|suite|ste|unit|bldg|building|fl|floor)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find the best HCP entity (job or estimate) for a given call.
 * Priority: related_job_id → customer's recent job → customer's recent estimate
 *         → phone fallback → address fallback.
 */
async function findHcpTarget(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  call: any,
): Promise<{ hcpId: string; type: string; localId: string } | null> {
  // 1. Direct related_job_id
  if (call.related_job_id) {
    const { data } = await supabase
      .from("jobs")
      .select("id, hcp_id")
      .eq("id", call.related_job_id)
      .maybeSingle();
    if (data?.hcp_id) return { hcpId: data.hcp_id, type: "job", localId: data.id };
  }

  // 2. Customer → most recent job with hcp_id
  if (call.related_customer_id) {
    const { data: job } = await supabase
      .from("jobs")
      .select("id, hcp_id")
      .eq("customer_id", call.related_customer_id)
      .not("hcp_id", "is", null)
      .order("scheduled_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (job?.hcp_id) return { hcpId: job.hcp_id, type: "job", localId: job.id };

    // 3. Customer → most recent estimate with hcp_id
    const { data: est } = await supabase
      .from("estimates")
      .select("id, hcp_id")
      .eq("customer_id", call.related_customer_id)
      .not("hcp_id", "is", null)
      .order("scheduled_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (est?.hcp_id) return { hcpId: est.hcp_id, type: "estimate", localId: est.id };
  }

  // 4. Phone fallback — search ALL jobs by customer_phone (no status filter!)
  // The find_job_by_phone RPC excludes done/invoiced jobs which causes misses.
  const normalized = call.phone_number?.replace(/\D/g, "").slice(-10);
  if (normalized && normalized.length === 10) {
    const { data: allPhoneJobs } = await supabase
      .from("jobs")
      .select("id, hcp_id, customer_phone")
      .not("hcp_id", "is", null)
      .not("customer_phone", "is", null)
      .order("scheduled_date", { ascending: false })
      .limit(500);

    const matchedJob = (allPhoneJobs || []).find((j: any) => {
      if (!j.customer_phone) return false;
      return j.customer_phone.replace(/\D/g, "").slice(-10) === normalized;
    });
    if (matchedJob?.hcp_id) return { hcpId: matchedJob.hcp_id, type: "job", localId: matchedJob.id };

    // 5. Phone fallback — search estimates by customer_phone
    const { data: allPhoneEsts } = await supabase
      .from("estimates")
      .select("id, hcp_id, customer_phone")
      .not("hcp_id", "is", null)
      .not("customer_phone", "is", null)
      .order("scheduled_date", { ascending: false })
      .limit(500);

    const matchedEst = (allPhoneEsts || []).find((e: any) => {
      if (!e.customer_phone) return false;
      return e.customer_phone.replace(/\D/g, "").slice(-10) === normalized;
    });
    if (matchedEst?.hcp_id) return { hcpId: matchedEst.hcp_id, type: "estimate", localId: matchedEst.id };
  }

  // 7. Address fallback — use extracted address from call_extraction
  const extractedAddr = call.call_extraction?.address || call.extracted_data?.address;
  if (extractedAddr && extractedAddr.length > 5) {
    const normAddr = normalizeAddress(extractedAddr);
    console.log(`Call ${call.id}: trying address match → "${normAddr}"`);

    // Search jobs by address
    const { data: addrJobs } = await supabase
      .from("jobs")
      .select("id, hcp_id, address")
      .not("hcp_id", "is", null)
      .not("address", "is", null)
      .order("scheduled_date", { ascending: false })
      .limit(300);

    const addrJobMatch = (addrJobs || []).find((j: any) =>
      j.address && normalizeAddress(j.address).includes(normAddr.slice(0, 15))
    );
    if (addrJobMatch?.hcp_id) {
      console.log(`Call ${call.id}: address matched job ${addrJobMatch.id} → "${addrJobMatch.address}"`);
      return { hcpId: addrJobMatch.hcp_id, type: "job", localId: addrJobMatch.id };
    }

    // Search estimates by address
    const { data: addrEsts } = await supabase
      .from("estimates")
      .select("id, hcp_id, address")
      .not("hcp_id", "is", null)
      .not("address", "is", null)
      .order("scheduled_date", { ascending: false })
      .limit(300);

    const addrEstMatch = (addrEsts || []).find((e: any) =>
      e.address && normalizeAddress(e.address).includes(normAddr.slice(0, 15))
    );
    if (addrEstMatch?.hcp_id) {
      console.log(`Call ${call.id}: address matched estimate ${addrEstMatch.id} → "${addrEstMatch.address}"`);
      return { hcpId: addrEstMatch.hcp_id, type: "estimate", localId: addrEstMatch.id };
    }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseAdmin();
    const hcpApiKey = Deno.env.get("HCP_API_KEY");

    if (!hcpApiKey) {
      return new Response(JSON.stringify({ error: "HCP_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse optional body for date range override
    let daysBack = 7;
    try {
      const body = await req.json();
      if (body?.days_back) daysBack = Math.min(body.days_back, 30);
    } catch { /* no body is fine */ }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);

    // Fetch all calls from the past N days with transcripts, not yet synced
    const { data: calls, error: fetchErr } = await supabase
      .from("call_log")
      .select("id, phone_number, contact_name, contact_type, direction, transcription, ai_summary, related_customer_id, related_job_id, hcp_note_synced, call_extraction, extracted_data, created_at")
      .gte("created_at", cutoff.toISOString())
      .not("transcription", "is", null)
      .eq("hcp_note_synced", false)
      .order("created_at", { ascending: true });

    if (fetchErr) {
      console.error("Failed to fetch calls:", fetchErr);
      return new Response(JSON.stringify({ error: "DB query failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${calls?.length || 0} un-synced calls with transcripts in last ${daysBack} days`);

    const results: any[] = [];

    for (const call of calls || []) {
      // Skip very short transcripts
      if (!call.transcription || call.transcription.trim().length < 20) {
        results.push({ call_id: call.id, status: "skipped", reason: "transcript too short" });
        continue;
      }

      // Skip employee/internal calls
      if (call.contact_type === "employee") {
        results.push({ call_id: call.id, status: "skipped", reason: "employee call" });
        continue;
      }

      // If missing ai_summary, invoke summarize-call first
      if (!call.ai_summary) {
        console.log(`Call ${call.id}: missing summary, invoking summarize-call...`);
        try {
          const sumResp = await fetch(`${supabaseUrl}/functions/v1/summarize-call`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ call_id: call.id }),
          });
          if (sumResp.ok) {
            // Re-fetch the call to get the new summary
            const { data: refreshed } = await supabase
              .from("call_log")
              .select("ai_summary, related_customer_id, related_job_id")
              .eq("id", call.id)
              .maybeSingle();
            if (refreshed?.ai_summary) {
              call.ai_summary = refreshed.ai_summary;
              call.related_customer_id = refreshed.related_customer_id;
              call.related_job_id = refreshed.related_job_id;
            }
          } else {
            console.error(`Call ${call.id}: summarize-call failed (${sumResp.status})`);
          }
        } catch (e) {
          console.error(`Call ${call.id}: summarize-call invocation error:`, e);
        }
      }

      if (!call.ai_summary) {
        results.push({ call_id: call.id, status: "skipped", reason: "no summary available" });
        continue;
      }

      // Find HCP target
      const target = await findHcpTarget(supabase, call);
      if (!target) {
        results.push({ call_id: call.id, contact: call.contact_name, status: "skipped", reason: "no HCP job/estimate found" });
        continue;
      }

      // Build note body
      const callerLabel = call.contact_name || call.phone_number;
      const dirLabel = call.direction === "inbound" ? "Inbound" : "Outbound";
      const dateStr = new Date(call.created_at).toLocaleString("en-US", { timeZone: "America/Chicago" });
      const noteBody = `📞 ${dirLabel} Call Notes (${callerLabel}) — ${dateStr}:\n${call.ai_summary}`;

      // Push to HCP
      try {
        const noteRes = await fetch(
          `https://api.housecallpro.com/jobs/${target.hcpId}/notes`,
          {
            method: "POST",
            headers: {
              "Authorization": `Token ${hcpApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ content: noteBody }),
          },
        );

        if (noteRes.ok) {
          // Mark as synced
          await supabase
            .from("call_log")
            .update({ hcp_note_synced: true })
            .eq("id", call.id);

          console.log(`✅ Call ${call.id} (${callerLabel}) → HCP ${target.type} ${target.hcpId}`);
          results.push({
            call_id: call.id,
            contact: callerLabel,
            status: "synced",
            hcp_id: target.hcpId,
            hcp_type: target.type,
          });
        } else {
          const errText = await noteRes.text();
          console.error(`❌ Call ${call.id}: HCP note push failed (${noteRes.status}):`, errText);
          results.push({ call_id: call.id, contact: callerLabel, status: "error", error: `HCP ${noteRes.status}` });
        }
      } catch (pushErr) {
        console.error(`❌ Call ${call.id}: HCP push error:`, pushErr);
        results.push({ call_id: call.id, status: "error", error: String(pushErr) });
      }
    }

    const synced = results.filter(r => r.status === "synced").length;
    const skipped = results.filter(r => r.status === "skipped").length;
    const errors = results.filter(r => r.status === "error").length;

    console.log(`\n=== BACKFILL COMPLETE: ${synced} synced, ${skipped} skipped, ${errors} errors ===`);

    return new Response(JSON.stringify({ ok: true, synced, skipped, errors, details: results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("backfill-call-notes-hcp error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
