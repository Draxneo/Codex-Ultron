import { corsHeaders } from "../_shared/cors.ts";

const HCP_API = "https://api.housecallpro.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { hcp_job_id, hcp_invoice_id, hcp_pay_url, to, customer_name, job_id } = await req.json();

    if (!to) {
      return new Response(JSON.stringify({ error: "Missing 'to' phone number" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!hcp_job_id && !hcp_invoice_id) {
      return new Response(JSON.stringify({ error: "Provide hcp_job_id or hcp_invoice_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hcpKey = Deno.env.get("HCP_API_KEY");
    if (!hcpKey) {
      return new Response(JSON.stringify({ error: "HCP_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve invoice id: if not provided, fetch the most recent unpaid one for the job
    let invoiceId: string | null = hcp_invoice_id || null;
    let invoiceNumber: string | null = null;
    let invoiceTotalCents: number | null = null;
    let dueAmountCents: number | null = null;
    let payUrl: string | null = hcp_pay_url || null;

    if (!invoiceId && hcp_job_id) {
      const r = await fetch(`${HCP_API}/jobs/${hcp_job_id}/invoices`, {
        headers: { Authorization: `Token ${hcpKey}`, Accept: "application/json" },
      });
      if (!r.ok) {
        const txt = await r.text();
        return new Response(
          JSON.stringify({ error: `HCP invoice lookup failed (${r.status})`, detail: txt.slice(0, 200) }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const data = await r.json();
      const invoices = data?.invoices || [];
      // Prefer unpaid; fall back to most recent
      const unpaid = invoices.filter((i: any) => i.status !== "paid" && i.status !== "voided" && i.status !== "canceled");
      const chosen = unpaid[0] || invoices[0];
      if (!chosen) {
        return new Response(JSON.stringify({ error: "No invoices found for this job in HCP" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      invoiceId = chosen.id;
      invoiceNumber = chosen.invoice_number;
      invoiceTotalCents = chosen.amount;
      dueAmountCents = chosen.due_amount;
      payUrl = [
        chosen.pay_url,
        chosen.payment_url,
        chosen.public_url,
        chosen.share_url,
        chosen.client_url,
        chosen.invoice_url,
        chosen.hosted_invoice_url,
        chosen.customer_url,
        chosen.url,
        chosen.links?.client_url,
        chosen.links?.pay_url,
        chosen.links?.public_url,
        chosen.links?.share_url,
      ].find((value: unknown) => typeof value === "string" && value.startsWith("http")) as string | null;
    }

    const cleanInvoiceId = (invoiceId || "")
      .replace(/^(invoice_|inv_)/i, "")
      .replace(/-/g, "");
    payUrl = payUrl || `https://client.housecallpro.com/invoices/${cleanInvoiceId}`;
    const firstName = (customer_name || "").trim().split(/\s+/)[0] || "there";

    const amountStr =
      typeof dueAmountCents === "number" && dueAmountCents > 0
        ? ` Balance due: $${(dueAmountCents / 100).toFixed(2)}.`
        : typeof invoiceTotalCents === "number" && invoiceTotalCents > 0
        ? ` Total: $${(invoiceTotalCents / 100).toFixed(2)}.`
        : "";

    const numberStr = invoiceNumber ? ` #${invoiceNumber}` : "";
    const body = `Hi ${firstName}, here is your invoice${numberStr}.${amountStr} Tap to view & pay: ${payUrl}`;

    // Route through centralized send-sms (HITL bypass since this is a manual user-triggered send)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const smsResp = await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        "x-source-function": "manual",
        "x-hitl-approved": "true",
      },
      body: JSON.stringify({ to, body, job_id: job_id || null }),
    });

    const smsData = await smsResp.json().catch(() => ({}));
    if (!smsResp.ok) {
      return new Response(
        JSON.stringify({ error: smsData?.error || "send-sms failed", pay_url: payUrl }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        invoice_id: invoiceId,
        invoice_number: invoiceNumber,
        pay_url: payUrl,
        sid: smsData?.sid,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("hcp-text-invoice error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
