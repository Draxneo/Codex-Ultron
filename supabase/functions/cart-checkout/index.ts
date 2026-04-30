import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";

async function logQuoteCartEvent(supabase: any, event: Record<string, unknown>) {
  const { error } = await supabase.from("quote_cart_events").insert(event);
  if (error) console.warn("quote_cart_events insert failed:", error.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { cart_token, payment_method, success_url, cancel_url } = await req.json();

    if (!cart_token || !payment_method) {
      return new Response(JSON.stringify({ error: "Missing cart_token or payment_method" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getSupabaseAdmin();

    // Load cart + items
    let { data: cart, error: cartErr } = await supabase
      .from("job_carts")
      .select("*")
      .eq("public_token", cart_token)
      .maybeSingle();

    if (cartErr || !cart) {
      return new Response(JSON.stringify({ error: "Cart not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (cart.status === "paid") {
      return new Response(JSON.stringify({ error: "Already paid", message: "This cart has already been paid." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.rpc("refresh_job_cart_pricing", { p_cart_id: cart.id });
    const { data: refreshedCart, error: refreshErr } = await supabase
      .from("job_carts")
      .select("*")
      .eq("id", cart.id)
      .maybeSingle();
    if (refreshErr || !refreshedCart) {
      return new Response(JSON.stringify({ error: "Could not refresh cart pricing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    cart = refreshedCart;

    const { data: items } = await supabase
      .from("job_cart_items")
      .select("*")
      .eq("cart_id", cart.id);

    const total = Number(cart.total);
    if (payment_method === "contact" || payment_method === "decline") {
      if (payment_method === "decline") {
        await supabase.from("job_carts").update({
          status: "declined",
        }).eq("id", cart.id);

        await supabase.from("activity_log").insert({
          job_id: cart.job_id,
          action: "cart_declined",
          details: `Customer declined cart. Total: $${total.toFixed(2)}`,
        });

        await logQuoteCartEvent(supabase, {
          event_type: "customer_declined",
          actor_type: "customer",
          cart_id: cart.id,
          job_id: cart.job_id,
          presentation_id: cart.source_presentation_id,
          metadata: { source: "cart-checkout", total },
        });

        return new Response(JSON.stringify({ success: true, payment_method, message: "Estimate declined. We'll note this for the office." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("activity_log").insert({
        job_id: cart.job_id,
        action: "cart_contact_requested",
        details: `Customer requested contact about cart. Total: $${total.toFixed(2)}`,
      });

      await logQuoteCartEvent(supabase, {
        event_type: "customer_contact_requested",
        actor_type: "customer",
        cart_id: cart.id,
        job_id: cart.job_id,
        presentation_id: cart.source_presentation_id,
        metadata: { source: "cart-checkout", total },
      });

      return new Response(JSON.stringify({ success: true, payment_method, message: "Thanks. We'll reach out shortly." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (total <= 0) {
      return new Response(JSON.stringify({ error: "Invalid total" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Non-stripe paths: just mark approved
    if (payment_method === "cash" || payment_method === "financing" || payment_method === "approve") {
      const paymentTiming = payment_method === "financing"
        ? "financing"
        : payment_method === "cash"
          ? "cash"
          : "approve_only";
      await supabase.from("job_carts").update({
        status: "approved",
        approved_at: new Date().toISOString(),
        payment_method,
        payment_timing: paymentTiming,
        approved_scope_snapshot: {
          source: "cart-checkout",
          payment_method,
          pricing_summary: cart.pricing_summary || null,
        },
      }).eq("id", cart.id);

      // Log activity
      const cashTotal = Number(cart.final_cash_total || total);
      await supabase.from("activity_log").insert({
        job_id: cart.job_id,
        action: "cart_approved",
        details: `Customer approved cart via ${payment_method}. Total: $${(payment_method === "cash" ? cashTotal : total).toFixed(2)}`,
      });

      await logQuoteCartEvent(supabase, {
        event_type: "customer_approved",
        actor_type: "customer",
        cart_id: cart.id,
        job_id: cart.job_id,
        presentation_id: cart.source_presentation_id,
        metadata: {
          source: "cart-checkout",
          payment_method,
          payment_timing: paymentTiming,
          total,
          cash_total: cashTotal,
        },
      });

      const messages: Record<string, string> = {
        cash: "Your tech will collect cash/check at the visit.",
        financing: "We'll send a financing application shortly.",
        approve: "Scope approved. Payment to be arranged separately.",
      };

      return new Response(JSON.stringify({ success: true, payment_method, message: messages[payment_method] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Stripe path
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "Stripe is not configured." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build Stripe Checkout session with one consolidated line item
    const params = new URLSearchParams();
    params.append("mode", "payment");
    const itemCount = (items || []).length;
    const productName = `${itemCount} item${itemCount !== 1 ? "s" : ""} — Job Cart`;
    params.append("line_items[0][price_data][currency]", "usd");
    params.append("line_items[0][price_data][product_data][name]", productName);
    params.append("line_items[0][price_data][unit_amount]", String(Math.round(total * 100)));
    params.append("line_items[0][quantity]", "1");
    params.append("success_url", success_url || `${req.headers.get("origin") || ""}/cart/${cart_token}?paid=true`);
    params.append("cancel_url", cancel_url || `${req.headers.get("origin") || ""}/cart/${cart_token}`);
    params.append("metadata[type]", "job_cart");
    params.append("metadata[cart_id]", cart.id);
    params.append("metadata[job_id]", cart.job_id);
    params.append("metadata[cart_token]", cart_token);
    params.append("metadata[server_total]", total.toFixed(2));

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

    await supabase.from("job_carts").update({
      stripe_checkout_url: session.url,
      stripe_payment_intent_id: session.id,
      payment_method: "stripe",
    }).eq("id", cart.id);

    await logQuoteCartEvent(supabase, {
      event_type: "payment_started",
      actor_type: "customer",
      cart_id: cart.id,
      job_id: cart.job_id,
      presentation_id: cart.source_presentation_id,
      metadata: {
        source: "cart-checkout",
        payment_method: "stripe",
        total,
        stripe_session_id: session.id,
      },
    });

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
