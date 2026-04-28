import { createClient } from "https://esm.sh/@supabase/supabase-js@2";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "Stripe is not configured. Add your STRIPE_SECRET_KEY in Cloud secrets." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { type, invoice_id, job_id, amount, customer_name, customer_email, customer_phone, description, success_url, cancel_url, payment_plan_count, payment_plan_interval } = await req.json();
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return new Response(JSON.stringify({ error: "Payment amount must be greater than zero." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getSupabaseAdmin();

    let lineItemName = "Payment";
    const metadata: Record<string, string> = { type };

    if (type === "invoice" && invoice_id) {
      const { data: invoice } = await supabase
        .from("customer_invoices")
        .select("invoice_number, total, job_id")
        .eq("id", invoice_id)
        .single();
      if (!invoice) throw new Error("Invoice not found");
      lineItemName = `Invoice ${invoice.invoice_number || ""}`;
      metadata.invoice_id = invoice_id;
      metadata.job_id = invoice.job_id;
    } else if (type === "deposit" && job_id) {
      const { data: job } = await supabase
        .from("jobs")
        .select("job_number, customer_name, customer_email")
        .eq("id", job_id)
        .single();
      lineItemName = `Deposit – Job ${job?.job_number || ""}`;
      metadata.job_id = job_id;
      metadata.customer_email = job?.customer_email || customer_email || "";
    }

    // Determine if this is a payment plan (installments)
    const installments = payment_plan_count && payment_plan_count > 1;

    if (installments) {
      // Create a subscription-based checkout for installments
      const installmentAmount = Math.round((numericAmount / payment_plan_count) * 100);
      const interval = payment_plan_interval || "month";

      metadata.payment_plan_count = String(payment_plan_count);
      metadata.payment_plan_interval = interval;

      const params = new URLSearchParams();
      params.append("mode", "subscription");
      params.append("line_items[0][price_data][currency]", "usd");
      params.append("line_items[0][price_data][product_data][name]", `${lineItemName} (${payment_plan_count} payments)`);
      params.append("line_items[0][price_data][unit_amount]", String(installmentAmount));
      params.append("line_items[0][price_data][recurring][interval]", interval);
      params.append("line_items[0][quantity]", "1");
      params.append("subscription_data[metadata][cancel_after]", String(payment_plan_count));
      params.append("success_url", success_url || "https://example.com/payment-success");
      params.append("cancel_url", cancel_url || "https://example.com/payment-cancelled");
      if (customer_email) params.append("customer_email", customer_email);
      Object.entries(metadata).forEach(([k, v]) => {
        params.append(`metadata[${k}]`, v as string);
        params.append(`subscription_data[metadata][${k}]`, v as string);
      });

      const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });
      const session = await stripeRes.json();

      if (session.error) {
        return new Response(JSON.stringify({ error: session.error.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update invoice with payment plan info
      if (type === "invoice" && invoice_id) {
        await supabase.from("customer_invoices").update({
          stripe_checkout_url: session.url,
          payment_method: "stripe",
          payment_plan_count,
          payment_plan_interval: interval,
        } as any).eq("id", invoice_id);
      }

      return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Standard one-time payment
    const params = new URLSearchParams();
    params.append("mode", "payment");
    params.append("line_items[0][price_data][currency]", "usd");
    params.append("line_items[0][price_data][product_data][name]", lineItemName);
    params.append("line_items[0][price_data][unit_amount]", String(Math.round(numericAmount * 100)));
    params.append("line_items[0][quantity]", "1");
    params.append("success_url", success_url || "https://example.com/payment-success");
    params.append("cancel_url", cancel_url || "https://example.com/payment-cancelled");
    if (customer_email) params.append("customer_email", customer_email);
    Object.entries(metadata).forEach(([k, v]) => {
      params.append(`metadata[${k}]`, v as string);
    });

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const session = await stripeRes.json();

    if (session.error) {
      return new Response(JSON.stringify({ error: session.error.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save checkout URL back to the relevant table
    if (type === "invoice" && invoice_id) {
      await supabase.from("customer_invoices").update({
        stripe_checkout_url: session.url,
        payment_method: "stripe",
      } as any).eq("id", invoice_id);
    } else if (type === "deposit" && job_id) {
      await supabase.from("jobs").update({
        stripe_deposit_session_id: session.id,
        deposit_amount: numericAmount,
      } as any).eq("id", job_id);
    }

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
