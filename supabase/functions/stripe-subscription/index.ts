import { createClient } from "https://esm.sh/@supabase/supabase-js@2";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



async function stripePost(path: string, params: URLSearchParams, apiKey: string) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  return res.json();
}

async function stripeGet(path: string, apiKey: string) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "Stripe not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { agreement_id, success_url, cancel_url } = await req.json();

    const supabase = getSupabaseAdmin();

    // Get agreement + customer info
    const { data: agreement, error: agErr } = await supabase
      .from("service_agreements")
      .select("*")
      .eq("id", agreement_id)
      .single();
    if (agErr || !agreement) throw new Error("Agreement not found");

    const { data: customer } = await supabase
      .from("customers")
      .select("first_name, last_name, email, phone")
      .eq("id", (agreement as any).customer_id)
      .single();

    const custName = customer
      ? [customer.first_name, customer.last_name].filter(Boolean).join(" ")
      : "Customer";
    const custEmail = customer?.email;

    // Determine billing interval
    const freq = (agreement as any).frequency || "annual";
    let interval = "year";
    let intervalCount = 1;
    if (freq === "biannual") { interval = "month"; intervalCount = 6; }
    else if (freq === "quarterly") { interval = "month"; intervalCount = 3; }
    else if (freq === "monthly") { interval = "month"; intervalCount = 1; }

    // Find or create Stripe customer
    let stripeCustomerId = (agreement as any).stripe_customer_id;
    if (!stripeCustomerId && custEmail) {
      // Search for existing customer by email
      const searchRes = await stripeGet(`/customers?email=${encodeURIComponent(custEmail)}&limit=1`, STRIPE_SECRET_KEY);
      if (searchRes.data?.length > 0) {
        stripeCustomerId = searchRes.data[0].id;
      }
    }
    if (!stripeCustomerId) {
      const custParams = new URLSearchParams();
      custParams.append("name", custName);
      if (custEmail) custParams.append("email", custEmail);
      if (customer?.phone) custParams.append("phone", customer.phone);
      const newCust = await stripePost("/customers", custParams, STRIPE_SECRET_KEY);
      stripeCustomerId = newCust.id;
    }

    // Save stripe_customer_id
    await supabase.from("service_agreements").update({
      stripe_customer_id: stripeCustomerId,
    } as any).eq("id", agreement_id);

    // Create Stripe Checkout Session for subscription
    const price = Number((agreement as any).price) || 0;
    const planName = (agreement as any).plan_name || "Maintenance Agreement";

    const params = new URLSearchParams();
    params.append("mode", "subscription");
    params.append("customer", stripeCustomerId);
    params.append("line_items[0][price_data][currency]", "usd");
    params.append("line_items[0][price_data][product_data][name]", planName);
    params.append("line_items[0][price_data][unit_amount]", String(Math.round(price * 100)));
    params.append("line_items[0][price_data][recurring][interval]", interval);
    if (intervalCount > 1) {
      params.append("line_items[0][price_data][recurring][interval_count]", String(intervalCount));
    }
    params.append("line_items[0][quantity]", "1");
    params.append("success_url", success_url || "https://example.com/subscription-success");
    params.append("cancel_url", cancel_url || "https://example.com/subscription-cancelled");
    params.append("metadata[type]", "subscription");
    params.append("metadata[agreement_id]", agreement_id);

    const session = await stripePost("/checkout/sessions", params, STRIPE_SECRET_KEY);

    if (session.error) {
      return new Response(JSON.stringify({ error: session.error.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
