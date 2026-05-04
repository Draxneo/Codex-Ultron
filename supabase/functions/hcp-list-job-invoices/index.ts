import { corsHeaders } from "../_shared/cors.ts";

const cleanInvoiceId = (value: string | null | undefined) =>
  (value || "").replace(/^(invoice_|inv_)/i, "").replace(/-/g, "");

const buildFallbackPayUrl = (invoiceId: string | null | undefined) => {
  const cleaned = cleanInvoiceId(invoiceId);
  return cleaned ? `https://client.housecallpro.com/invoices/${cleaned}` : null;
};

const pickInvoicePayUrl = (invoice: Record<string, any>) => {
  const directUrl = [
    invoice.pay_url,
    invoice.payment_url,
    invoice.public_url,
    invoice.share_url,
    invoice.client_url,
    invoice.invoice_url,
    invoice.hosted_invoice_url,
    invoice.customer_url,
    invoice.url,
    invoice.links?.client_url,
    invoice.links?.pay_url,
    invoice.links?.public_url,
    invoice.links?.share_url,
  ].find((value) => typeof value === "string" && value.startsWith("http"));

  return directUrl || buildFallbackPayUrl(invoice.token || invoice.id);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { hcp_job_id } = await req.json();
    if (!hcp_job_id) {
      return new Response(JSON.stringify({ error: "Missing hcp_job_id" }), {
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

    const r = await fetch(`https://api.housecallpro.com/jobs/${hcp_job_id}/invoices`, {
      headers: { Authorization: `Token ${hcpKey}`, Accept: "application/json" },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return new Response(
        JSON.stringify({ error: `HCP error (${r.status})`, detail: data }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Slim payload — only fields the UI needs
    const invoices = (data?.invoices || []).map((i: any) => ({
      id: i.id,
      token: i.token ?? null,
      invoice_number: i.invoice_number,
      status: i.status,
      amount: i.amount,
      due_amount: i.due_amount,
      paid_at: i.paid_at,
      sent_at: i.sent_at,
      invoice_date: i.invoice_date,
      pay_url: pickInvoicePayUrl(i),
    }));

    return new Response(JSON.stringify({ invoices }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
