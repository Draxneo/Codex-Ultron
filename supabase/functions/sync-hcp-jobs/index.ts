import { formatName, formatAddress, formatCity, formatState, formatEmail, formatPhone } from "../_shared/formatters.ts";
import {
  mapHcpJobToFields,
  mapHcpEstimateToFields,
  mapHcpJobStatus,
  mapHcpEstimateStatus,
  extractAssignedTo,
  parseBrand,
  parseTonnage,
  parseAhriNumber,
  diffJobFields,
} from "../_shared/hcp-mapper.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";


// --- HCP API helpers ---

async function fetchHcpJobsPage(hcpApiKey: string, url: string) {
  console.log("Calling HCP API:", url);
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Token ${hcpApiKey}`,
      "Accept": "application/json",
    },
  });
  console.log("HCP response status:", res.status);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HCP API error: ${res.status} — ${errText.substring(0, 200)}`);
  }
  return await res.json();
}

async function fetchHcpJobs(hcpApiKey: string, url: string, maxPages = 1) {
  const allJobs: any[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const separator = url.includes("?") ? "&" : "?";
    const pagedUrl = `${url}${separator}page=${page}&page_size=200`;
    const data = await fetchHcpJobsPage(hcpApiKey, pagedUrl);
    const jobs = data.jobs || [];
    allJobs.push(...jobs);
    if (jobs.length < 200 || page >= (data.total_pages || 1)) break;
  }
  return allJobs;
}

type QueryResult = PromiseLike<{ data: unknown | null; error?: unknown }>;
type SupabaseChain = QueryResult & {
  select: (...args: unknown[]) => SupabaseChain;
  eq: (...args: unknown[]) => SupabaseChain;
  maybeSingle: () => Promise<{ data: unknown | null; error?: unknown }>;
  update: (...args: unknown[]) => SupabaseChain;
  insert: (...args: unknown[]) => SupabaseChain;
  in: (...args: unknown[]) => SupabaseChain;
  limit: (...args: unknown[]) => SupabaseChain;
};
type SupabaseClientLike = {
  from: (table: string) => SupabaseChain;
  rpc: (fn: string, args?: Record<string, unknown>) => SupabaseChain;
};

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function asInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function startOfCentralDate(dateText: string) {
  return new Date(`${dateText}T00:00:00-05:00`).toISOString();
}

async function upsertEstimateCustomers(supabase: SupabaseClientLike, estimates: Array<Record<string, unknown>>) {
  const customerMap = new Map<string, Record<string, unknown>>();
  for (const est of estimates) {
    const cust = (est.customer || {}) as Record<string, unknown>;
    const address = (est.address || {}) as Record<string, unknown>;
    const custAddress = (cust.address || {}) as Record<string, unknown>;
    const hcpCustomerId = optionalText(cust.id);
    if (!hcpCustomerId || customerMap.has(hcpCustomerId)) continue;

    const rawCustName = `${optionalText(cust.first_name) || ""} ${optionalText(cust.last_name) || ""}`.trim();
    const nameParts = rawCustName.split(" ").filter(Boolean);
    customerMap.set(hcpCustomerId, {
      hcp_customer_id: hcpCustomerId,
      first_name: formatName(optionalText(cust.first_name) || nameParts[0] || null),
      last_name: formatName(optionalText(cust.last_name) || nameParts.slice(1).join(" ") || null),
      email: formatEmail(optionalText(cust.email)),
      phone: formatPhone(optionalText(cust.mobile_number) || optionalText(cust.home_number) || optionalText(cust.work_number) || optionalText(cust.phone_number)),
      mobile_phone: formatPhone(optionalText(cust.mobile_number)),
      address: formatAddress(optionalText(address.street) || optionalText(custAddress.street)),
      city: formatCity(optionalText(address.city) || optionalText(custAddress.city)),
      state: formatState(optionalText(address.state) || optionalText(custAddress.state)),
      zip: optionalText(address.zip) || optionalText(custAddress.zip),
      company: optionalText(cust.company),
    });
  }

  if (customerMap.size === 0) return new Map<string, string>();

  for (const customerRow of customerMap.values()) {
    const { hcp_customer_id, ...rawFields } = customerRow;
    const fields: Record<string, any> = {};
    for (const [key, value] of Object.entries(rawFields)) {
      if (value !== null && value !== undefined && value !== "") fields[key] = value;
    }

    const { data: existing } = await supabase
      .from("customers")
      .select("id")
      .eq("hcp_customer_id", hcp_customer_id)
      .maybeSingle();

    const existingCustomer = existing as { id: string } | null;
    if (existingCustomer) {
      if (Object.keys(fields).length > 0) {
        await supabase.from("customers").update(fields).eq("id", existingCustomer.id);
      }
      continue;
    }

    let phoneMatch: { id: string } | null = null;
    const phoneDigits = String(fields.phone || fields.mobile_phone || "").replace(/\D/g, "").slice(-10);
    if (phoneDigits.length === 10) {
      const { data: matched } = await supabase
        .rpc("find_customer_by_phone", { digits: phoneDigits })
        .limit(1)
        .maybeSingle();
      phoneMatch = matched as { id: string } | null;
    }

    if (phoneMatch) {
      await supabase
        .from("customers")
        .update({ ...fields, hcp_customer_id })
        .eq("id", phoneMatch.id);
      console.log(`Linked estimate HCP customer ${hcp_customer_id} to existing phone match ${phoneMatch.id}`);
    } else {
      await supabase.from("customers").insert({ hcp_customer_id, ...fields });
    }
  }

  const hcpCustomerIds = Array.from(customerMap.keys());
  const { data: resolvedCustomers } = await supabase
    .from("customers")
    .select("id, hcp_customer_id")
    .in("hcp_customer_id", hcpCustomerIds);

  return new Map(
    ((resolvedCustomers || []) as Array<{ hcp_customer_id: string; id: string }>)
      .map((c) => [c.hcp_customer_id, c.id])
  );
}

// --- Main handler ---

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const hcpApiKey = Deno.env.get("HCP_API_KEY");

    if (!hcpApiKey) {
      return new Response(JSON.stringify({ error: "HCP_API_KEY not configured." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getSupabaseAdmin();

    // Parse body
    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }

    // Debug mode
    if (body.debug_job) {
      const debugUrl = `https://api.housecallpro.com/jobs?page_size=200`;
      const allJobs = await fetchHcpJobs(hcpApiKey, debugUrl);
      const match = allJobs.find((j: any) => j.invoice_number === body.debug_job);
      if (match) {
        return new Response(JSON.stringify({
          found: true,
          invoice_number: match.invoice_number,
          work_status: match.work_status,
          assigned_employees: match.assigned_employees,
          dispatched_employees: match.dispatched_employees,
          schedule: match.schedule,
          id: match.id,
          description: match.description,
          note: match.note,
          parsed_ahri: parseAhriNumber(`${match.description || ""}\n${match.note || ""}`),
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ found: false, total_searched: allJobs.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Determine sync mode ──
    // Cron trigger: lightweight sync (last 3 hours only, no line items, no attachments)
    // Manual trigger: full 4-week sync with all side effects
    const isCron = body.source === "cron";
    const isBridge = body.source === "bridge" || body.source === "bridge-cron";
    const now = new Date();

    let scheduledUrl: string;
    let maxJobPages: number;
    let syncLineItems: boolean;
    let syncAttachments: boolean;
    let syncEstimates: boolean;
    let autoCloseStale: boolean;

    let bridgeStartIso = "";
    let bridgeEndIso = "";

    if (isBridge) {
      const startDate = typeof body.start_date === "string" && body.start_date
        ? body.start_date
        : "2026-04-27";
      const daysAhead = asInteger(body.days_ahead, 90, 1, 365);
      bridgeStartIso = typeof body.scheduled_start_min === "string" && body.scheduled_start_min
        ? new Date(body.scheduled_start_min).toISOString()
        : startOfCentralDate(startDate);
      bridgeEndIso = typeof body.scheduled_start_max === "string" && body.scheduled_start_max
        ? new Date(body.scheduled_start_max).toISOString()
        : new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

      scheduledUrl = `https://api.housecallpro.com/jobs?scheduled_start_min=${bridgeStartIso}&scheduled_start_max=${bridgeEndIso}`;
      maxJobPages = asInteger(body.max_pages, body.source === "bridge-cron" ? 4 : 10, 1, 25);
      syncLineItems = asBoolean(body.sync_line_items, false);
      syncAttachments = asBoolean(body.sync_attachments, false);
      syncEstimates = asBoolean(body.sync_estimates, true);
      autoCloseStale = false;
      console.log(`[HCP_BRIDGE] Scheduled sync from ${bridgeStartIso} to ${bridgeEndIso}; no stale auto-close`);
    } else if (isCron) {
      // Lightweight: only last 3 hours of changes — but DO sync estimates so they stay fresh
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
      scheduledUrl = `https://api.housecallpro.com/jobs?sort_direction=desc&sort_by=updated_at&page_size=200`;
      maxJobPages = 2;
      syncLineItems = false;
      syncAttachments = false;
      syncEstimates = true;  // ← FIX: estimates now sync every 15 min via cron
      autoCloseStale = false;
      console.log("[CRON] Lightweight sync — jobs (3h) + estimates (recent)");
    } else {
      // Full sync: 4-week window with everything
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const twoWeeksAhead = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
      scheduledUrl = `https://api.housecallpro.com/jobs?scheduled_start_min=${twoWeeksAgo}&scheduled_start_max=${twoWeeksAhead}`;
      maxJobPages = 5;
      syncLineItems = true;
      syncAttachments = true;
      syncEstimates = true;
      autoCloseStale = true;
      console.log("[FULL] Complete sync — 4-week window with line items, estimates, attachments");
    }

    // 1. Fetch jobs
    const allHcpJobs = await fetchHcpJobs(hcpApiKey, scheduledUrl, maxJobPages);

    // 1b. Also pull unscheduled / needs-scheduling jobs (only on full sync)
    if (!isCron && !isBridge) {
      try {
        const unschedUrl = `https://api.housecallpro.com/jobs?work_status[]=needs%20scheduling&work_status[]=scheduled`;
        const unschedJobs = await fetchHcpJobs(hcpApiKey, unschedUrl, 3);
        const existingIds = new Set(allHcpJobs.map((j: any) => j.id));
        for (const j of unschedJobs) {
          if (!existingIds.has(j.id)) {
            allHcpJobs.push(j);
            existingIds.add(j.id);
          }
        }
        console.log(`Added ${unschedJobs.length} unscheduled/needs-scheduling jobs (deduped into ${allHcpJobs.length} total)`);
      } catch (e: any) {
        console.log("Unscheduled job fetch failed (non-fatal):", e.message);
      }
    }

    // Filter out csr_ IDs
    const realHcpJobs = allHcpJobs.filter((j: any) => !String(j.id || "").startsWith("csr_"));
    if (realHcpJobs.length < allHcpJobs.length) {
      console.log(`Filtered out ${allHcpJobs.length - realHcpJobs.length} csr_ estimate records`);
    }

    // Map all jobs using shared mapper — drop any without a valid hcp_id
    const mappedJobs = realHcpJobs.map(mapHcpJobToFields).filter(j => j.hcp_id);
    
    // Get all existing jobs by hcp_id in one query — include fields for diffing
    const hcpIds = mappedJobs.map(j => j.hcp_id);
    
    if (hcpIds.length === 0) {
      console.log("No HCP jobs found to sync");
      return new Response(JSON.stringify({ synced: 0, mode: isCron ? "cron" : "full" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existingJobs } = await supabase
      .from("jobs")
      .select("id, hcp_id, job_type, assigned_to, hcp_status, scheduled_date, arrival_start, arrival_end, address, customer_name, customer_phone, customer_email, description, hcp_note, tonnage, system_type, brand, ahri_number, hcp_job_number, job_number, locally_modified_at")
      .in("hcp_id", hcpIds);

    const existingMap = new Map((existingJobs || []).map((j: any) => [j.hcp_id, j]));

    let toInsert = mappedJobs.filter(j => !existingMap.has(j.hcp_id));
    const toUpdateRaw = mappedJobs.filter(j => existingMap.has(j.hcp_id));

    // ── Smart diff: only update jobs where fields actually changed ──
    let skippedUnchanged = 0;
    let skippedLocallyModified = 0;
    let actualUpdates = 0;

    // 2026-05-03 fix: jobs touched by the user inside our app within the
    // last 15 minutes are protected from being clobbered by HCP. Without
    // this guard, the cron's every-minute sync would silently revert local
    // reschedules that hadn't yet propagated back to HCP. The trigger
    // stamp_locally_modified_at sets locally_modified_at on local writes
    // (it skips its own sync writes by checking synced_at). After 15 min
    // we resume normal sync — gives the user a window to ensure HCP has
    // the new value, but doesn't permanently desync. A future commit will
    // add a push-to-HCP path so this protection isn't needed at all.
    const LOCAL_PROTECTION_MS = 15 * 60 * 1000;
    const protectionCutoff = Date.now() - LOCAL_PROTECTION_MS;

    for (const incoming of toUpdateRaw) {
      const existing: any = existingMap.get(incoming.hcp_id)!;

      // Skip if user just edited this job locally
      if (existing.locally_modified_at) {
        const lmTs = new Date(existing.locally_modified_at).getTime();
        if (Number.isFinite(lmTs) && lmTs > protectionCutoff) {
          skippedLocallyModified++;
          console.log(`Skipping HCP sync for job ${existing.id} (hcp=${existing.hcp_id}): locally modified at ${existing.locally_modified_at}`);
          continue;
        }
      }

      const diff = diffJobFields(incoming, existing);

      if (!diff) {
        skippedUnchanged++;
        continue;
      }

      // Auto-map HCP lifecycle statuses
      const ws = (incoming.hcp_status || "").toLowerCase();
      if (ws.includes("complete")) diff.status = "done";
      else if (ws.includes("cancel") || ws.includes("pro canceled")) diff.status = "canceled";

      const { error } = await supabase
        .from("jobs")
        .update(diff)
        .eq("id", existing.id);
      if (error) console.log(`Update error for ${existing.id}:`, error.message);
      else actualUpdates++;
    }

    console.log(`Smart sync: ${actualUpdates} updated, ${skippedUnchanged} unchanged, ${skippedLocallyModified} locally protected`);

    // ── Orphan matching ──
    if (toInsert.length > 0) {
      const orphanLinked: string[] = [];
      const remainingInserts: typeof toInsert = [];

      for (const hcpJob of toInsert) {
        if (!hcpJob.customer_phone || !hcpJob.scheduled_date) {
          remainingInserts.push(hcpJob);
          continue;
        }
        const phoneDigits = hcpJob.customer_phone.replace(/\D/g, "").slice(-10);
        if (phoneDigits.length < 10) {
          remainingInserts.push(hcpJob);
          continue;
        }

        const { data: orphan } = await supabase
          .from("jobs")
          .select("id")
          .is("hcp_id", null)
          .eq("scheduled_date", hcpJob.scheduled_date)
          .or(`customer_phone.ilike.%${phoneDigits}%`)
          .limit(1)
          .maybeSingle();

        if (orphan) {
          const linkUpdate: any = {
            hcp_id: hcpJob.hcp_id,
            hcp_job_number: hcpJob.hcp_job_number,
            job_number: hcpJob.job_number,
            hcp_customer_id: hcpJob.hcp_customer_id,
            hcp_status: hcpJob.hcp_status,
            synced_at: hcpJob.synced_at,
          };
          await supabase.from("jobs").update(linkUpdate).eq("id", orphan.id);
          orphanLinked.push(orphan.id);
          console.log(`Linked orphan job ${orphan.id} to HCP ${hcpJob.hcp_id}`);
        } else {
          remainingInserts.push(hcpJob);
        }
      }

      if (orphanLinked.length > 0) {
        console.log(`Linked ${orphanLinked.length} orphan jobs to HCP records`);
      }
      toInsert = remainingInserts;
    }

    // For NEW jobs, add initial status
    for (const job of toInsert) {
      job.status = mapHcpJobStatus(job.hcp_status, job.scheduled_date);
    }

    // Batch insert new jobs
    const CHUNK_SIZE = 200;
    let insertErrors = 0;
    if (toInsert.length > 0) {
      for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
        const chunk = toInsert.slice(i, i + CHUNK_SIZE);
        const { error: chunkErr } = await supabase
          .from("jobs")
          .upsert(chunk, { onConflict: "hcp_id" });
        if (chunkErr) { insertErrors++; console.log(`Insert chunk error:`, chunkErr.message); }
      }
    }
    
    if (insertErrors > 0) console.log(`Total insert chunk errors: ${insertErrors}`);
    console.log(`Synced ${toInsert.length} new + ${actualUpdates} changed jobs (${skippedUnchanged} unchanged)`);

    // --- Line Items (full sync only) ---
    let lineItemsSynced = 0;
    const installUpgrades: string[] = [];
    if (syncLineItems) {
      try {
        const { data: allLocalJobs } = await supabase
          .from("jobs")
          .select("id, hcp_id, job_type")
          .in("hcp_id", hcpIds);
        const localJobMap = new Map((allLocalJobs || []).map((j: any) => [j.hcp_id, j]));

        for (const hcpJob of allHcpJobs) {
          const localJob: any = localJobMap.get(hcpJob.id);
          if (!localJob) continue;
          try {
            const liRes = await fetch(
              `https://api.housecallpro.com/jobs/${hcpJob.id}/line_items`,
              { headers: { "Authorization": `Token ${hcpApiKey}`, "Accept": "application/json" } }
            );
            if (!liRes.ok) continue;
            const liData = await liRes.json();
            const lineItems = liData.line_items || liData || [];
            if (!Array.isArray(lineItems) || lineItems.length === 0) continue;

            const liRows = lineItems.map((li: any) => ({
              job_id: localJob.id,
              hcp_line_item_id: li.id,
              name: li.name || "Unnamed",
              description: li.description || null,
              quantity: li.quantity ?? 1,
              unit_price: li.unit_cost ?? li.unit_price ?? 0,
              total_price: (li.quantity ?? 1) * (li.unit_cost ?? li.unit_price ?? 0),
              kind: li.kind || null,
            }));

            const { error: liErr } = await supabase
              .from("job_line_items")
              .upsert(liRows, { onConflict: "hcp_line_item_id", ignoreDuplicates: false });
            if (liErr) {
              console.log(`Line item upsert error for job ${localJob.id}:`, liErr.message);
            } else {
              lineItemsSynced += liRows.length;
            }

            if (localJob.job_type === "service") {
              const repairPartWords = /compressor|motor|capacitor|contactor|coil|relay|valve|thermostat|fuse|refrigerant|recharge|freon|leak|diagnostic/i;
              const installSignals = lineItems.some((li: any) => {
                const txt = `${li.name || ""} ${li.description || ""}`.toLowerCase();
                if (repairPartWords.test(txt)) return false;
                const hasBrandInLI = parseBrand(txt) !== null;
                const hasTonnageInLI = parseTonnage(txt) !== null;
                const hasInstallKeyword = /value series|comfort series|performance series|infinity series|heatpump|heat pump|changeout|change out|new system|split system|package unit/i.test(txt);
                const highValue = ((li.quantity ?? 1) * (li.unit_cost ?? li.unit_price ?? 0)) > 3000;
                return (hasBrandInLI && hasTonnageInLI && hasInstallKeyword) || (hasInstallKeyword && highValue);
              });
              if (installSignals) {
                const { error: upErr } = await supabase
                  .from("jobs")
                  .update({ job_type: "install" })
                  .eq("id", localJob.id);
                if (!upErr) installUpgrades.push(localJob.id);
                console.log(`Upgraded job ${localJob.id} to install based on line items`);
              }
            }
          } catch (liError: any) {
            // Non-fatal
          }
        }
        console.log(`Synced ${lineItemsSynced} line items, upgraded ${installUpgrades.length} jobs to install`);
      } catch (lineItemError: any) {
        console.log("Line item sync failed (non-fatal):", lineItemError.message);
      }
    }

    // --- Customer linking (both modes, but cron only for new jobs) ---
    const jobsForCustomerSync = isCron ? realHcpJobs.filter((j: any) => !existingMap.has(j.id)) : allHcpJobs;
    const customerMap = new Map<string, any>();
    for (const hcpJob of jobsForCustomerSync) {
      const cust = hcpJob.customer;
      if (!cust?.id) continue;
      if (customerMap.has(cust.id)) continue;
      customerMap.set(cust.id, {
        hcp_customer_id: cust.id,
        first_name: formatName(cust.first_name || null),
        last_name: formatName(cust.last_name || null),
        email: formatEmail(cust.email || null),
        phone: formatPhone(cust.phone_number || null),
        mobile_phone: formatPhone(cust.mobile_number || null),
        address: formatAddress(cust.address?.street || null),
        city: formatCity(cust.address?.city || null),
        state: formatState(cust.address?.state || null),
        zip: cust.address?.zip || null,
        company: cust.company || null,
      });
    }

    if (customerMap.size > 0) {
      const custRows = Array.from(customerMap.values());
      const cleanedRows = custRows.map((row: any) => {
        const cleaned: Record<string, any> = { hcp_customer_id: row.hcp_customer_id };
        for (const [key, value] of Object.entries(row)) {
          if (key === "hcp_customer_id") continue;
          if (value !== null && value !== undefined && value !== "") {
            cleaned[key] = value;
          }
        }
        return cleaned;
      });

      for (const custRow of cleanedRows) {
        const { hcp_customer_id, ...fields } = custRow;
        const { data: existing } = await supabase
          .from("customers")
          .select("id")
          .eq("hcp_customer_id", hcp_customer_id)
          .maybeSingle();

        if (existing) {
          if (Object.keys(fields).length > 0) {
            await supabase.from("customers").update(fields).eq("id", existing.id);
          }
        } else {
          const phoneDigits = (fields.phone || fields.mobile_phone || "").replace(/\D/g, "").slice(-10);
          let phoneMatch: any = null;
          if (phoneDigits.length === 10) {
            const { data: matched } = await supabase
              .rpc("find_customer_by_phone", { digits: phoneDigits })
              .limit(1)
              .maybeSingle();
            phoneMatch = matched;
          }

          if (phoneMatch) {
            const backfill: Record<string, any> = { hcp_customer_id };
            for (const [k, v] of Object.entries(fields)) {
              if (v != null && v !== "") backfill[k] = v;
            }
            await supabase.from("customers")
              .update(backfill)
              .eq("id", phoneMatch.id)
              .is("hcp_customer_id", null);
            await supabase.from("customers")
              .update({ hcp_customer_id })
              .eq("id", phoneMatch.id);
            console.log(`Linked HCP customer ${hcp_customer_id} to existing phone match ${phoneMatch.id}`);
          } else {
            await supabase.from("customers").insert({ hcp_customer_id, ...fields });
          }
        }
      }
      console.log(`Synced ${cleanedRows.length} customers (preserving existing data)`);

      const hcpCustIds = Array.from(customerMap.keys());
      const { data: resolvedCusts } = await supabase
        .from("customers")
        .select("id, hcp_customer_id")
        .in("hcp_customer_id", hcpCustIds);

      if (resolvedCusts && resolvedCusts.length > 0) {
        const custIdMap = new Map(resolvedCusts.map((c: any) => [c.hcp_customer_id, c.id]));
        for (const [hcpCustId, localCustId] of custIdMap.entries()) {
          await supabase
            .from("jobs")
            .update({ customer_id: localCustId })
            .eq("hcp_customer_id", hcpCustId)
            .is("customer_id", null);
        }
        console.log(`Linked customer_id for ${custIdMap.size} HCP customers`);
      }
    }
    
    // --- Estimate Sync ---
    // Cron mode: fast 1-page pull of recently-updated estimates so the board stays fresh every 15 min
    // Full mode: deep 4-week scheduled window + unscheduled queue
    let estimatesSynced = 0;
    if (syncEstimates) {
      try {
        const allEstimates: any[] = [];

        if (isBridge) {
          const estScheduledUrl = `https://api.housecallpro.com/estimates?sort_direction=desc&page_size=200&scheduled_start_min=${bridgeStartIso}&scheduled_start_max=${bridgeEndIso}`;
          const maxEstimatePages = asInteger(body.max_estimate_pages, body.source === "bridge-cron" ? 4 : 10, 1, 25);
          for (let page = 1; page <= maxEstimatePages; page++) {
            const res = await fetch(`${estScheduledUrl}&page=${page}`, {
              headers: { "Authorization": `Token ${hcpApiKey}`, "Accept": "application/json" },
            });
            if (!res.ok) { console.log("[HCP_BRIDGE] Estimate sync error:", res.status); break; }
            const data = await res.json();
            const ests = data.estimates || [];
            allEstimates.push(...ests);
            if (ests.length < 200 || page >= (data.total_pages || 1)) break;
          }
          console.log(`[HCP_BRIDGE] Pulled ${allEstimates.length} scheduled estimates`);
        } else if (isCron) {
          // Fast path: just the most recently updated estimates (catches new + edited)
          const recentUrl = `https://api.housecallpro.com/estimates?sort_direction=desc&sort_by=updated_at&page_size=100&page=1`;
          const res = await fetch(recentUrl, {
            headers: { "Authorization": `Token ${hcpApiKey}`, "Accept": "application/json" },
          });
          if (res.ok) {
            const data = await res.json();
            allEstimates.push(...(data.estimates || []));
            console.log(`[CRON] Pulled ${allEstimates.length} recently-updated estimates`);
          } else {
            console.log("[CRON] Estimate sync error:", res.status);
          }
        } else {
          const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
          const twoWeeksAhead = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
          const estScheduledUrl = `https://api.housecallpro.com/estimates?sort_direction=desc&page_size=200&scheduled_start_min=${twoWeeksAgo}&scheduled_start_max=${twoWeeksAhead}`;
          for (let page = 1; page <= 5; page++) {
            const res = await fetch(`${estScheduledUrl}&page=${page}`, {
              headers: { "Authorization": `Token ${hcpApiKey}`, "Accept": "application/json" },
            });
            if (!res.ok) { console.log("Estimate sync error:", res.status); break; }
            const data = await res.json();
            const ests = data.estimates || [];
            allEstimates.push(...ests);
            if (ests.length < 200 || page >= (data.total_pages || 1)) break;
          }

          try {
            const unschedEstUrl = `https://api.housecallpro.com/estimates?sort_direction=desc&page_size=200&work_status[]=unscheduled&work_status[]=scheduled`;
            for (let page = 1; page <= 3; page++) {
              const res = await fetch(`${unschedEstUrl}&page=${page}`, {
                headers: { "Authorization": `Token ${hcpApiKey}`, "Accept": "application/json" },
              });
              if (!res.ok) break;
              const data = await res.json();
              const ests = data.estimates || [];
              allEstimates.push(...ests);
              if (ests.length < 200 || page >= (data.total_pages || 1)) break;
            }
            console.log(`Total estimates after unscheduled pull: ${allEstimates.length}`);
          } catch (e: any) {
            console.log("Unscheduled estimate fetch failed (non-fatal):", e.message);
          }
        }

        const estMap = new Map<string, any>();
        for (const est of allEstimates) estMap.set(est.id, est);
        const uniqueEstimates = Array.from(estMap.values());

        if (uniqueEstimates.length > 0) {
          const estimateCustomerIds = await upsertEstimateCustomers(supabase, uniqueEstimates);
          const mappedEstimates = uniqueEstimates.map((est: any) => {
            const fields = mapHcpEstimateToFields(est);
            fields.work_status = mapHcpEstimateStatus(est.work_status);
            if (fields.hcp_customer_id && estimateCustomerIds.has(fields.hcp_customer_id)) {
              fields.customer_id = estimateCustomerIds.get(fields.hcp_customer_id);
            }
            return fields;
          });

          const estHcpIds = mappedEstimates.map((e: any) => e.hcp_id);
          const { data: existingEsts } = await supabase
            .from("estimates")
            .select("hcp_id, work_status")
            .in("hcp_id", estHcpIds);
          const protectedStatuses = new Set(["won", "lost"]);
          const protectedHcpIds = new Set(
            (existingEsts || [])
              .filter((e: any) => protectedStatuses.has(e.work_status))
              .map((e: any) => e.hcp_id)
          );
          for (const est of mappedEstimates) {
            if (protectedHcpIds.has(est.hcp_id)) {
              delete est.work_status;
            }
          }

          const { error: estErr } = await supabase
            .from("estimates")
            .upsert(mappedEstimates, { onConflict: "hcp_id" });
          if (estErr) console.log("Estimate upsert error:", estErr.message);
          else {
            estimatesSynced = mappedEstimates.length;
            for (const [hcpCustId, localCustId] of estimateCustomerIds.entries()) {
              await supabase
                .from("estimates")
                .update({ customer_id: localCustId })
                .eq("hcp_customer_id", hcpCustId)
                .is("customer_id", null);
            }
          }
          console.log(`Synced ${estimatesSynced} estimates from HCP`);
        }
      } catch (estError: any) {
        console.log("Estimate sync failed (non-fatal):", estError.message);
      }
    }

    // --- Attachment Sync (full sync only) ---
    let attachmentsSynced = 0;
    if (syncAttachments) {
      try {
        const jobsToCheck = allHcpJobs.slice(0, 50);
        const jobHcpIds = jobsToCheck.map((j: any) => j.id);
        
        const { data: localJobsForAttach } = await supabase
          .from("jobs")
          .select("id, hcp_id")
          .in("hcp_id", jobHcpIds);

        if (localJobsForAttach && localJobsForAttach.length > 0) {
          const localJobIds = localJobsForAttach.map((j: any) => j.id);
          const { data: existingAttachments } = await supabase
            .from("job_attachments")
            .select("job_id")
            .in("job_id", localJobIds);
          
          const jobsWithAttachments = new Set((existingAttachments || []).map((a: any) => a.job_id));
          const jobsNeedingAttachments = localJobsForAttach.filter((j: any) => !jobsWithAttachments.has(j.id));

          for (const job of jobsNeedingAttachments) {
            try {
              const attResp = await fetch(
                `https://api.housecallpro.com/jobs/${job.hcp_id}?expand[]=attachments`,
                { headers: { "Authorization": `Token ${hcpApiKey}` } }
              );
              if (!attResp.ok) {
                if (attResp.status === 429) {
                  console.log("HCP rate limit hit during attachment sync, stopping");
                  break;
                }
                continue;
              }
              const hcpJob = await attResp.json();
              const attachments = hcpJob.attachments || [];
              if (attachments.length === 0) continue;

              for (const att of attachments) {
                if (!att.url) continue;
                try {
                  const fileResp = await fetch(att.url);
                  if (!fileResp.ok) continue;
                  const fileBlob = await fileResp.blob();
                  const ext = (att.file_name || "photo.jpg").split(".").pop() || "jpg";
                  const storagePath = `${job.id}/${att.id}.${ext}`;

                  const { error: uploadErr } = await supabase.storage
                    .from("job-photos")
                    .upload(storagePath, fileBlob, {
                      contentType: att.file_type || att.content_type || "image/jpeg",
                      upsert: true,
                    });
                  if (uploadErr) continue;

                  await supabase.from("job_attachments").upsert({
                    job_id: job.id,
                    hcp_attachment_id: att.id,
                    file_name: att.file_name || att.filename || "attachment",
                    file_path: storagePath,
                    file_type: att.file_type || att.content_type || "image/jpeg",
                  }, { onConflict: "hcp_attachment_id" });
                  attachmentsSynced++;
                } catch { /* skip individual file errors */ }
              }
              await new Promise(r => setTimeout(r, 200));
            } catch { /* skip job-level errors */ }
          }
        }
        if (attachmentsSynced > 0) console.log(`Auto-synced ${attachmentsSynced} attachments from HCP`);
      } catch (attError: any) {
        console.log("Attachment sync failed (non-fatal):", attError.message);
      }
    }

    // Auto-close stale jobs (full sync only)
    if (autoCloseStale) {
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const { data: staleClose } = await supabase
        .from("jobs")
        .update({ status: "done", completed_at: new Date().toISOString() })
        .not("status", "in", '("done","invoiced","canceled")')
        .lt("scheduled_date", fourteenDaysAgo)
        .not("scheduled_date", "is", null)
        .select("id");
      
      const closedJobIds = (staleClose || []).map((j: any) => j.id);
      if (closedJobIds.length > 0) {
        await supabase
          .from("chat_channels")
          .delete()
          .in("job_id", closedJobIds)
          .eq("is_special", false);
        
        console.log(`Auto-closed ${closedJobIds.length} stale jobs`);
      }
    }

    return new Response(JSON.stringify({ 
      mode: isBridge ? body.source : isCron ? "cron" : "full",
      window_start: bridgeStartIso || null,
      window_end: bridgeEndIso || null,
      synced: allHcpJobs.length, 
      new_jobs: toInsert.length,
      updated_jobs: actualUpdates,
      skipped_unchanged: skippedUnchanged,
      estimates_synced: estimatesSynced,
      line_items_synced: lineItemsSynced,
      install_upgrades: installUpgrades.length,
      attachments_synced: attachmentsSynced,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
