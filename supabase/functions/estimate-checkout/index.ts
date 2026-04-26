import { createClient } from "https://esm.sh/@supabase/supabase-js@2";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "Stripe is not configured." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { presentation_id, selected_option_key, payment_method, customer_email, success_url, cancel_url } = await req.json();

    if (!presentation_id || !selected_option_key) {
      return new Response(JSON.stringify({ error: "Missing presentation_id or selected_option_key" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getSupabaseAdmin();

    // Fetch the presentation
    const { data: pres, error: presErr } = await supabase
      .from("estimate_presentations")
      .select("*")
      .eq("id", presentation_id)
      .single();

    if (presErr || !pres) {
      return new Response(JSON.stringify({ error: "Presentation not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const snapshot = pres.pricing_snapshot as any;
    if (!snapshot) {
      return new Response(JSON.stringify({ error: "No pricing data" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate total based on cart type and selected option
    let totalAmount = 0;
    let lineItemName = "Estimate Payment";

    if (snapshot.cart_type === "new_system") {
      const option = snapshot.system_options?.[selected_option_key];
      if (!option) {
        return new Response(JSON.stringify({ error: "Invalid option selected" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      totalAmount = option.price || 0;
      lineItemName = `${option.brand || ""} ${option.label || "System"} — ${selected_option_key.charAt(0).toUpperCase() + selected_option_key.slice(1)} Tier`;
    } else if (snapshot.cart_type === "repair") {
      const tierItems = snapshot.repair_tiers?.[selected_option_key];
      if (!tierItems || !Array.isArray(tierItems)) {
        return new Response(JSON.stringify({ error: "Invalid repair tier selected" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      totalAmount = tierItems.reduce((sum: number, item: any) => sum + (item.price || 0), 0);
      lineItemName = `Repair — ${selected_option_key.charAt(0).toUpperCase() + selected_option_key.slice(1)}`;
    }

    if (totalAmount <= 0) {
      return new Response(JSON.stringify({ error: "Invalid amount" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update presentation with customer selection
    await supabase.from("estimate_presentations").update({
      status: "approved",
      selected_option_key,
      payment_method: payment_method || "stripe",
      approved_at: new Date().toISOString(),
      total_amount: totalAmount,
    }).eq("id", presentation_id);

    // If payment method is not stripe (cash/financing), skip Stripe checkout
    if (payment_method === "cash" || payment_method === "financing") {
      // Submit estimate response
      await supabase.from("estimate_responses").insert({
        estimate_id: pres.estimate_id,
        presentation_id,
        action: "approved",
        selected_tier: selected_option_key,
        payment_preference: payment_method,
      });

      return new Response(JSON.stringify({ 
        success: true, 
        payment_method,
        message: payment_method === "financing" 
          ? "Financing application will be sent separately" 
          : "Your technician will collect payment on site"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create Stripe checkout session
    const params = new URLSearchParams();
    params.append("mode", "payment");
    params.append("line_items[0][price_data][currency]", "usd");
    params.append("line_items[0][price_data][product_data][name]", lineItemName);
    params.append("line_items[0][price_data][unit_amount]", String(Math.round(totalAmount * 100)));
    params.append("line_items[0][quantity]", "1");
    params.append("success_url", success_url || `${req.headers.get("origin") || "https://example.com"}/presentation/${pres.token}?paid=true`);
    params.append("cancel_url", cancel_url || `${req.headers.get("origin") || "https://example.com"}/presentation/${pres.token}`);
    if (customer_email) params.append("customer_email", customer_email);
    
    params.append("metadata[type]", "estimate");
    params.append("metadata[presentation_id]", presentation_id);
    params.append("metadata[estimate_id]", pres.estimate_id);
    params.append("metadata[selected_option]", selected_option_key);

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

    // Update presentation with stripe session
    await supabase.from("estimate_presentations").update({
      stripe_payment_intent_id: session.id,
    }).eq("id", presentation_id);

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
