/**
 * quick-quote-auto-create
 *
 * Called immediately after a customer approves a Quick Quote (option A/B/C).
 * Smart routing based on the source the quote was attached to:
 *   • job_id present     → append line items + payment-method note to existing HCP job
 *   • estimate_id present → mark estimate accepted + create install job in HCP
 *   • neither            → create a fresh install job in HCP
 *
 * After mutation, fires a centralized SMS to the dispatcher so they know
 * the customer signed off without anyone having to refresh a page.
 *
 * Body: { token: string }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const HCP_API_KEY = Deno.env.get("HCP_SYNC_ENABLED") === "true" ? (Deno.env.get("HCP_API_KEY") ?? "") : "";

const PAYMENT_LABEL: Record<string, string> = {
  A: "Option A — 0% APR · 36 mo (financed)",
  B: "Option B — 9.99% APR · 120 mo (financed)",
  C: "Option C — Instant Factory Rebate (cash/check/card)",
};

function buildLineItems(matchup: any, rendered: any, option: "A" | "B" | "C") {
  const brand = matchup?.brand || "System";
  const tonnage = matchup?.tonnage ? `${matchup.tonnage}T` : "";
  const sysType = matchup?.system_type || "";
  const tier = matchup?.tier ? ` (${matchup.tier})` : "";
  const name = `${brand} ${tonnage} ${sysType}${tier}`.replace(/\s+/g, " ").trim();

  const financed = Number(rendered?.financedPrice ?? matchup?.total_price ?? 0);
  const rebate = Number(matchup?.factory_rebate_price ?? financed);
  const unitPrice = option === "C" ? rebate : financed;

  const condenser = matchup?.condenser_model ? `Condenser: ${matchup.condenser_model}` : "";
  const coil = matchup?.coil_model ? `Coil: ${matchup.coil_model}` : "";
  const furnace = matchup?.furnace_model ? `Furnace: ${matchup.furnace_model}` : "";
  const ahri = matchup?.ahri_number ? `AHRI ${matchup.ahri_number}` : "";
  const seer = matchup?.seer2 ? `SEER2 ${matchup.seer2}` : "";
  const description = [condenser, coil, furnace, ahri, seer].filter(Boolean).join(" · ") || "Equipment installation";

  return [
    {
      name: `Install — ${name}`,
      description,
      unit_price: Math.round(unitPrice * 100), // cents
      quantity: 1,
      kind: "labor",
    },
  ];
}

async function pushLineItemsToHcpJob(hcpJobId: string, items: any[]) {
  const results: any[] = [];
  for (const item of items) {
    const res = await fetch(`https://api.housecallpro.com/jobs/${hcpJobId}/line_items`, {
      method: "POST",
      headers: { "Authorization": `Token ${HCP_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`HCP line item push failed: ${res.status}`, errText);
      results.push({ ok: false, error: `${res.status}: ${errText.slice(0, 200)}` });
    } else {
      const data = await res.json();
      results.push({ ok: true, id: data.id });
    }
  }
  return results;
}

async function pushHcpJobNote(hcpJobId: string, note: string) {
  const res = await fetch(`https://api.housecallpro.com/jobs/${hcpJobId}/notes`, {
    method: "POST",
    headers: { "Authorization": `Token ${HCP_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: note }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.warn("HCP note push failed:", res.status, errText);
    return false;
  }
  return true;
}

async function notifyDispatcher(supabase: any, link: any, option: "A" | "B" | "C", outcomeLine: string) {
  try {
    const customerLine = link.customer_name || link.customer_phone || "Customer";
    const body = `[QUICK QUOTE APPROVED] ${customerLine} chose ${PAYMENT_LABEL[option]}.\n${outcomeLine}`;

    // Resolve dispatcher number from settings
    const { data: dispatcherRow } = await supabase
      .from("company_settings")
      .select("value")
      .eq("key", "dispatcher_phone")
      .maybeSingle();

    const dispatcherPhone = (dispatcherRow as any)?.value;
    if (!dispatcherPhone) {
      console.warn("No dispatcher_phone configured — skipping notify");
      return;
    }

    await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE}`,
        "x-source-function": "quick-quote-auto-create",
        "x-hitl-approved": "true",
      },
      body: JSON.stringify({
        to: dispatcherPhone,
        body,
        source: "quick_quote_approval",
      }),
    });
  } catch (err) {
    console.warn("notifyDispatcher failed:", err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const { token } = await req.json();
    if (!token) throw new Error("Missing token");

    // 1. Load the approved quick-quote link
    const { data: link, error } = await supabase
      .from("quick_quote_links")
      .select("*")
      .eq("token", token)
      .maybeSingle();
    if (error) throw error;
    if (!link) throw new Error("Link not found");
    if (!link.selected_payment) throw new Error("Quote not yet approved");

    const option = link.selected_payment as "A" | "B" | "C";
    const matchup = link.matchup_snapshot || {};
    const rendered = link.rendered_snapshot || {};
    const lineItems = buildLineItems(matchup, rendered, option);
    const paymentNote = `Customer approved ${PAYMENT_LABEL[option]} via Quick Quote. Equipment: ${matchup.brand || "?"} ${matchup.tonnage || "?"}T ${matchup.system_type || ""}.`;

    let outcomeLine = "";
    let resultPayload: any = { mode: "unknown" };

    // 2. SMART ROUTING

    // a) Source job → update existing HCP job
    if (link.job_id) {
      const { data: srcJob } = await supabase
        .from("jobs")
        .select("id, hcp_id, customer_id, customer_name")
        .eq("id", link.job_id)
        .maybeSingle();

      if (srcJob?.hcp_id && HCP_API_KEY) {
        const lineRes = await pushLineItemsToHcpJob(srcJob.hcp_id, lineItems);
        await pushHcpJobNote(srcJob.hcp_id, paymentNote);
        outcomeLine = `Updated existing HCP job — ${lineItems.length} line item(s) added.`;
        resultPayload = { mode: "update_existing_job", hcp_job_id: srcJob.hcp_id, line_items: lineRes };
      } else {
        outcomeLine = `Source job ${link.job_id} not in HCP yet — manual handoff needed.`;
        resultPayload = { mode: "update_existing_job", error: "no_hcp_id" };
      }

      await supabase
        .from("quick_quote_links")
        .update({
          auto_create_status: resultPayload.error ? "needs_review" : "updated",
          auto_create_result: resultPayload,
          hcp_job_id: srcJob?.hcp_id || null,
        })
        .eq("token", token);
    }

    // b) Source estimate → create install job + mark estimate accepted
    else if (link.estimate_id) {
      const { data: est } = await supabase
        .from("estimates")
        .select("*")
        .eq("id", link.estimate_id)
        .maybeSingle();

      // Mark estimate accepted locally
      if (est) {
        await supabase
          .from("estimates")
          .update({ status: "approved", customer_approved_at: new Date().toISOString() })
          .eq("id", link.estimate_id);
      }

      // Create the install job via existing edge function
      const createRes = await fetch(`${SUPABASE_URL}/functions/v1/create-hcp-job`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SERVICE_ROLE}`,
        },
        body: JSON.stringify({
          customer_name: link.customer_name || est?.customer_name,
          customer_phone: link.customer_phone || est?.customer_phone,
          customer_email: link.customer_email || est?.customer_email,
          customer_id: est?.customer_id,
          address: est?.address,
          description: `Install (Quick Quote approval): ${matchup.brand || ""} ${matchup.tonnage || ""}T ${matchup.system_type || ""}\n\n${paymentNote}`,
          job_type: "install",
          source_estimate_id: link.estimate_id,
          created_by: "quick_quote_approval",
        }),
      });

      const createData = await createRes.json().catch(() => ({}));
      const newHcpId = createData?.hcp_id || createData?.results?.hcp_id || null;

      if (newHcpId) {
        await pushLineItemsToHcpJob(newHcpId, lineItems);
        await pushHcpJobNote(newHcpId, paymentNote);
        outcomeLine = `Created new HCP install job + added ${lineItems.length} line item(s).`;
        resultPayload = { mode: "from_estimate", hcp_job_id: newHcpId, create_response: createData };
      } else {
        outcomeLine = `HCP job creation returned no ID — review needed.`;
        resultPayload = { mode: "from_estimate", error: "no_hcp_id_returned", create_response: createData };
      }

      await supabase
        .from("quick_quote_links")
        .update({
          auto_create_status: newHcpId ? "created" : "needs_review",
          auto_create_result: resultPayload,
          hcp_job_id: newHcpId,
        })
        .eq("token", token);
    }

    // c) Standalone → create fresh install job
    else {
      const createRes = await fetch(`${SUPABASE_URL}/functions/v1/create-hcp-job`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SERVICE_ROLE}`,
        },
        body: JSON.stringify({
          customer_name: link.customer_name,
          customer_phone: link.customer_phone,
          customer_email: link.customer_email,
          description: `Install (Quick Quote approval): ${matchup.brand || ""} ${matchup.tonnage || ""}T ${matchup.system_type || ""}\n\n${paymentNote}`,
          job_type: "install",
          created_by: "quick_quote_approval",
        }),
      });
      const createData = await createRes.json().catch(() => ({}));
      const newHcpId = createData?.hcp_id || createData?.results?.hcp_id || null;
      if (newHcpId) {
        await pushLineItemsToHcpJob(newHcpId, lineItems);
        await pushHcpJobNote(newHcpId, paymentNote);
        outcomeLine = `Created new HCP install job from standalone quote.`;
        resultPayload = { mode: "standalone", hcp_job_id: newHcpId, create_response: createData };
      } else {
        outcomeLine = `Standalone HCP job creation failed — review needed.`;
        resultPayload = { mode: "standalone", error: "no_hcp_id_returned", create_response: createData };
      }

      await supabase
        .from("quick_quote_links")
        .update({
          auto_create_status: newHcpId ? "created" : "needs_review",
          auto_create_result: resultPayload,
          hcp_job_id: newHcpId,
        })
        .eq("token", token);
    }

    // 3. Notify dispatcher
    await notifyDispatcher(supabase, link, option, outcomeLine);

    return new Response(JSON.stringify({ ok: true, outcome: outcomeLine, ...resultPayload }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("quick-quote-auto-create error:", err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
