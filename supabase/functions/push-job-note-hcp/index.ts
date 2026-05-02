/**
 * push-job-note-hcp
 * Pushes a note to a Housecall Pro job (or estimate) AND mirrors it
 * into our local jobs.hcp_note column for the in-app timeline.
 *
 * Body: {
 *   job_id?: string,
 *   customer_id?: string,
 *   note: string,
 *   source?: string,
 *   hcp_line_items?: Array<{ name: string, description?: string, unit_price?: number, quantity?: number, kind?: string }>
 * }
 *
 * Resolution order:
 *  1) If job_id given → use that job
 *  2) Else if customer_id → most recent open job (not done/canceled/invoiced)
 *  3) Else → 400
 *
 * If the resolved job has hcp_id → POST to HCP /jobs/{hcp_id}/notes.
 * Always appends to local jobs.hcp_note. Logs an activity_log entry so the
 * workflow cleanup can clear matching action cards.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function toHcpLineItem(item: any) {
  const quantity = Number(item.quantity || 1);
  const unitPrice = Number(item.unit_price || item.unitPrice || 0);
  const unitPriceCents = unitPrice > 0 && unitPrice < 10000 ? Math.round(unitPrice * 100) : Math.round(unitPrice);
  return {
    name: String(item.name || "Custom line item").slice(0, 160),
    description: String(item.description || "").slice(0, 1000),
    unit_price: unitPriceCents,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    kind: item.kind || "labor",
    taxable: item.taxable === true,
  };
}

async function pushLineItemsToHcpJob(hcpJobId: string, hcpApiKey: string, items: any[]) {
  const results: any[] = [];
  for (const rawItem of items) {
    const lineItem = toHcpLineItem(rawItem);
    try {
      const res = await fetch(`https://api.housecallpro.com/jobs/${hcpJobId}/line_items`, {
        method: "POST",
        headers: {
          Authorization: `Token ${hcpApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(lineItem),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        results.push({ ok: true, id: data.id ?? null, name: lineItem.name });
      } else {
        const text = await res.text();
        results.push({ ok: false, name: lineItem.name, error: `HCP ${res.status}: ${text.slice(0, 500)}` });
      }
    } catch (e) {
      results.push({ ok: false, name: lineItem.name, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const hcpApiKey = Deno.env.get("HCP_API_KEY");
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => ({}));
    const note: string = (body.note || "").toString().trim();
    let job_id: string | null = body.job_id ?? null;
    const estimate_id: string | null = body.estimate_id ?? null;
    const customer_id: string | null = body.customer_id ?? null;
    const source: string = body.source || "JARVIS";
    const hcpLineItems: any[] = Array.isArray(body.hcp_line_items) ? body.hcp_line_items : [];

    if (!note) {
      return new Response(JSON.stringify({ error: "Missing note" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stamp0 = new Date().toLocaleString("en-US", {
      timeZone: "America/Chicago",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const stampedNote0 = `[${stamp0} — ${source}] ${note}`;

    // ── ESTIMATE branch ──
    if (estimate_id) {
      const { data: est } = await supabase
        .from("estimates")
        .select("id, hcp_id")
        .eq("id", estimate_id)
        .maybeSingle();
      if (!est) {
        return new Response(JSON.stringify({ error: "Estimate not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      let hcpPushed = false;
      let hcpError: string | null = null;
      if (est.hcp_id && hcpApiKey) {
        try {
          const res = await fetch(
            `https://api.housecallpro.com/estimates/${est.hcp_id}/notes`,
            {
              method: "POST",
              headers: {
                Authorization: `Token ${hcpApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ content: stampedNote0 }),
            },
          );
          if (res.ok) hcpPushed = true;
          else hcpError = `HCP ${res.status}: ${await res.text()}`;
        } catch (e) {
          hcpError = e instanceof Error ? e.message : String(e);
        }
      }
      return new Response(
        JSON.stringify({ ok: true, target: "estimate", estimate_id: est.id, hcp_pushed: hcpPushed, hcp_error: hcpError }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!job_id && customer_id) {
      const { data: job } = await supabase
        .from("jobs")
        .select("id")
        .eq("customer_id", customer_id)
        .not("status", "in", "(done,invoiced,canceled)")
        .order("scheduled_date", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (job?.id) job_id = job.id;
    }

    if (!job_id) {
      // Last-resort: append to customer notes only
      if (customer_id) {
        const { data: cust } = await supabase
          .from("customers")
          .select("notes")
          .eq("id", customer_id)
          .maybeSingle();
        const existing = cust?.notes || "";
        const sep = existing ? "\n\n" : "";
        const stamp = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
        await supabase
          .from("customers")
          .update({ notes: `${existing}${sep}[${stamp} — ${source}] ${note}` })
          .eq("id", customer_id);
        return new Response(
          JSON.stringify({ ok: true, target: "customer", hcp_pushed: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "No job or customer to attach note to" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load job
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id, hcp_id, hcp_note")
      .eq("id", job_id)
      .single();

    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stamp = new Date().toLocaleString("en-US", {
      timeZone: "America/Chicago",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const stampedNote = `[${stamp} — ${source}] ${note}`;

    // 1) Push to HCP if possible
    let hcpPushed = false;
    let hcpError: string | null = null;
    let hcpLineItemResults: any[] = [];
    if (job.hcp_id && hcpApiKey) {
      try {
        const res = await fetch(
          `https://api.housecallpro.com/jobs/${job.hcp_id}/notes`,
          {
            method: "POST",
            headers: {
              Authorization: `Token ${hcpApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ content: stampedNote }),
          },
        );
        if (res.ok) {
          hcpPushed = true;
        } else {
          hcpError = `HCP ${res.status}: ${await res.text()}`;
          console.error("HCP note push failed:", hcpError);
        }
      } catch (e) {
        hcpError = e instanceof Error ? e.message : String(e);
        console.error("HCP note push exception:", hcpError);
      }

      if (hcpLineItems.length > 0) {
        hcpLineItemResults = await pushLineItemsToHcpJob(job.hcp_id, hcpApiKey, hcpLineItems);
      }
    }

    // 2) Mirror into local jobs.hcp_note (always)
    const existing = job.hcp_note || "";
    const sep = existing ? "\n\n" : "";
    await supabase
      .from("jobs")
      .update({ hcp_note: `${existing}${sep}${stampedNote}` })
      .eq("id", job.id);

    // 3) Activity log → supports workflow cleanup
    await supabase.from("activity_log").insert({
      job_id: job.id,
      action: hcpLineItems.length > 0 ? "hcp_backup_pushed" : "note_added",
      details: stampedNote.slice(0, 500),
      performed_by: source,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        target: "job",
        job_id: job.id,
        hcp_pushed: hcpPushed,
        hcp_error: hcpError,
        hcp_line_items: hcpLineItemResults,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("push-job-note-hcp error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
