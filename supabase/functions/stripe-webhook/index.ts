import { createClient } from "https://esm.sh/@supabase/supabase-js@2";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { logSystemError, pageOnCall } from "../_shared/resilience.ts";



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
      return new Response("Stripe not configured", { status: 500, headers: corsHeaders });
    }

    const body = await req.text();
    const sig = req.headers.get("stripe-signature");

    let event: any;

    if (sig) {
      const encoder = new TextEncoder();
      const parts = sig.split(",");
      const timestamp = parts.find((p: string) => p.startsWith("t="))?.split("=")[1];
      const signatures = parts.filter((p: string) => p.startsWith("v1=")).map((p: string) => p.split("=")[1]);

      if (!timestamp || signatures.length === 0) {
        return new Response("Invalid signature", { status: 400, headers: corsHeaders });
      }

      const payload = `${timestamp}.${body}`;
      const key = await crypto.subtle.importKey(
        "raw", encoder.encode(STRIPE_WEBHOOK_SECRET),
        { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );
      const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
      const computedSig = Array.from(new Uint8Array(signatureBuffer))
        .map((b) => b.toString(16).padStart(2, "0")).join("");

      if (!signatures.includes(computedSig)) {
        return new Response("Signature mismatch", { status: 400, headers: corsHeaders });
      }
      event = JSON.parse(body);
    } else {
      return new Response("Missing Stripe signature", { status: 400, headers: corsHeaders });
    }

    const supabase = getSupabaseAdmin();

    const type = event.type;
    const data = event.data?.object;
    const meta = data?.metadata || {};

    // Determine amount, email, description for logging
    const amount = (data?.amount ?? data?.amount_total ?? data?.total ?? 0) / 100;
    const currency = data?.currency || "usd";
    const customerEmail = data?.customer_email || data?.receipt_email || meta?.customer_email || null;
    const jobId = meta?.job_id || null;
    const invoiceId = meta?.invoice_id || null;

    // Determine status for logging
    let eventStatus = "succeeded";
    if (type.includes("failed")) eventStatus = "failed";
    else if (type.includes("refund")) eventStatus = "refunded";
    else if (type.includes("dispute")) eventStatus = "disputed";
    else if (type.includes("deleted") || type.includes("cancelled")) eventStatus = "cancelled";

    // Build description
    let description = type;
    if (meta?.type === "invoice") description = `Invoice payment`;
    else if (meta?.type === "deposit") description = `Deposit payment`;
    else if (meta?.type === "subscription") description = `Subscription payment`;
    else if (type === "charge.failed") description = `Payment failed`;
    else if (type === "charge.refunded") description = `Payment refunded`;
    else if (type === "charge.dispute.created") description = `Payment disputed`;
    else if (type === "invoice.payment_failed") description = `Subscription payment failed`;

    if (event.id) {
      const { data: existingEvent } = await supabase
        .from("stripe_events")
        .select("id")
        .eq("stripe_event_id", event.id)
        .maybeSingle();

      if (existingEvent) {
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Log every event to stripe_events before side effects so retries are idempotent.
    await supabase.from("stripe_events").insert({
      stripe_event_id: event.id,
      event_type: type,
      amount,
      currency,
      customer_email: customerEmail,
      description,
      metadata: { stripe_data: data, original_metadata: meta },
      status: eventStatus,
      job_id: jobId,
      invoice_id: invoiceId,
    });

    // --- Handle specific event types ---

    if (type === "checkout.session.completed") {
      if (meta.type === "invoice" && meta.invoice_id) {
        // Mark the customer_invoice as paid
        await supabase.from("customer_invoices").update({
          status: "paid",
          paid_at: new Date().toISOString(),
          stripe_payment_intent_id: data.payment_intent,
          payment_method: "stripe",
        } as any).eq("id", meta.invoice_id);
        console.log(`Invoice ${meta.invoice_id} marked paid via Stripe`);
        // Stamp payment_collected_at on the parent job so expected items auto-close.
        if (meta.job_id) {
          await supabase.from("jobs").update({
            payment_collected_at: new Date().toISOString(),
            last_payment_error: null,
            last_payment_error_at: null,
          } as any).eq("id", meta.job_id);

          // Auto-close job payment state when payment is received.
          await supabase.from("jobs").update({
            status: "invoiced",
          } as any).eq("id", meta.job_id);

          // Log to activity_log
          await supabase.from("activity_log").insert({
            job_id: meta.job_id,
            action: "payment_received",
            performed_by: "Stripe",
            details: `Payment of $${amount.toFixed(2)} received via Stripe for invoice ${meta.invoice_id}`,
          });
          console.log(`Job ${meta.job_id} payment_collected_at stamped, status → invoiced`);

          // Release held paysheet entries
          const { data: heldEntries } = await supabase
            .from("paysheet_entries")
            .select("id, rate_type, pay_category, employee_id")
            .eq("job_id", meta.job_id)
            .eq("status", "held");

          let totalLaborCost = 0;
          if (heldEntries && heldEntries.length > 0) {
            for (const entry of heldEntries as any[]) {
              const updates: any = { status: "pending" };
              if (entry.rate_type === "percentage" && amount > 0) {
                // Look up employee rate to recalculate
                const { data: empRate } = await supabase
                  .from("employee_pay_rates")
                  .select("rate")
                  .eq("employee_id", entry.employee_id)
                  .eq("job_type", entry.pay_category || "service")
                  .single();
                if (empRate?.rate) {
                  updates.amount = (empRate.rate / 100) * amount;
                }
              }
              await supabase.from("paysheet_entries").update(updates).eq("id", entry.id);
            }
            console.log(`Released ${heldEntries.length} held paysheet entries for job ${meta.job_id}`);
          }

          // Compute and cache job profitability
          const { data: allEntries } = await supabase
            .from("paysheet_entries")
            .select("amount")
            .eq("job_id", meta.job_id)
            .in("status", ["pending", "approved", "paid"]);
          totalLaborCost = (allEntries || []).reduce((s: number, e: any) => s + (e.amount || 0), 0);

          const { data: jobInvoices } = await supabase
            .from("job_invoices")
            .select("total_amount")
            .eq("job_id", meta.job_id);
          const partsCost = (jobInvoices || []).reduce((s: number, i: any) => s + (i.total_amount || 0), 0);

          const revenue = amount;
          const totalCost = partsCost + totalLaborCost;
          const profit = revenue - totalCost;
          const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0;

          await supabase.from("jobs").update({
            parts_cost: partsCost,
            labor_cost: totalLaborCost,
            total_cost: totalCost,
            profit: Math.round(profit * 100) / 100,
            margin_pct: Math.round(marginPct * 10) / 10,
          } as any).eq("id", meta.job_id);
          console.log(`Job ${meta.job_id} profitability cached: revenue=$${revenue}, profit=$${profit.toFixed(2)}, margin=${marginPct.toFixed(1)}%`);
        }
      }

      if (meta.type === "deposit" && meta.job_id) {
        await supabase.from("jobs").update({
          deposit_paid_at: new Date().toISOString(),
          last_payment_error: null,
          last_payment_error_at: null,
        } as any).eq("id", meta.job_id);

        // Log to activity_log
        await supabase.from("activity_log").insert({
          job_id: meta.job_id,
          action: "deposit_received",
          performed_by: "Stripe",
          details: `Deposit of $${amount.toFixed(2)} received via Stripe`,
        });
        console.log(`Deposit for job ${meta.job_id} marked paid via Stripe`);
      }

      if (meta.type === "subscription" && meta.agreement_id) {
        await supabase.from("service_agreements").update({
          stripe_subscription_id: data.subscription,
        } as any).eq("id", meta.agreement_id);
        console.log(`Agreement ${meta.agreement_id} subscription activated`);
      }

      // ── Handle Job Cart payments ──
      if (meta.type === "job_cart" && meta.cart_id) {
        const cartId = meta.cart_id as string;
        const jobIdLocal = meta.job_id as string | undefined;

        // Mark cart as paid
        await supabase.from("job_carts").update({
          status: "paid",
          paid_at: new Date().toISOString(),
          payment_method: "stripe",
          stripe_payment_intent_id: data.payment_intent || data.id,
        } as any).eq("id", cartId);

        if (jobIdLocal) {
          // Pull cart + items to build the invoice
          const { data: cart } = await supabase
            .from("job_carts").select("*").eq("id", cartId).maybeSingle();
          const { data: cartItems } = await supabase
            .from("job_cart_items").select("*").eq("cart_id", cartId)
            .order("sort_order", { ascending: true });

          // Create customer_invoice (snapshot)
          const { data: inv, error: invErr } = await supabase
            .from("customer_invoices")
            .insert({
              job_id: jobIdLocal,
              status: "paid",
              paid_at: new Date().toISOString(),
              payment_method: "stripe",
              stripe_payment_intent_id: data.payment_intent || data.id,
              subtotal: cart?.subtotal ?? 0,
              tax_rate: cart?.tax_rate ?? 0,
              tax_amount: cart?.tax_amount ?? 0,
              total: cart?.total ?? amount,
              notes: `Auto-generated from Job Cart ${cartId}`,
            } as any)
            .select()
            .single();

          if (!invErr && inv && cartItems?.length) {
            const rows = (cartItems as any[]).map((it, idx) => ({
              invoice_id: inv.id,
              description: it.name + (it.description ? ` — ${it.description}` : ""),
              quantity: Number(it.quantity || 1),
              unit_price: Number(it.unit_price || 0),
              total: Number(it.total_price || 0),
              sort_order: idx,
            }));
            await supabase.from("customer_invoice_items").insert(rows);
          }

          // Stamp job + log activity
          await supabase.from("jobs").update({
            payment_collected_at: new Date().toISOString(),
            status: "invoiced",
          } as any).eq("id", jobIdLocal);

          await supabase.from("activity_log").insert({
            job_id: jobIdLocal,
            action: "cart_paid",
            performed_by: "Stripe",
            details: `Customer paid Job Cart via Stripe — $${amount.toFixed(2)}`,
          });

          // Fire finalize-job (best-effort)
          try {
            await supabase.functions.invoke("finalize-job", { body: { job_id: jobIdLocal, source: "cart_payment" } });
          } catch (e) {
            console.error("finalize-job invoke failed:", e);
          }

          // Auto-send branded receipt + warranty card (best-effort)
          try {
            await supabase.functions.invoke("cart-send-receipt", { body: { cart_id: cartId } });
          } catch (e) {
            console.error("cart-send-receipt invoke failed:", e);
          }

          console.log(`Job Cart ${cartId} paid → invoice created, job ${jobIdLocal} finalized`);
        }
      }

      // ── Handle estimate cart payments ──
      if (meta.type === "estimate" && meta.presentation_id) {
        await supabase.from("estimate_presentations").update({
          status: "paid",
          paid_at: new Date().toISOString(),
          stripe_payment_intent_id: data.payment_intent,
        } as any).eq("id", meta.presentation_id);

        // Submit estimate response
        await supabase.from("estimate_responses").insert({
          estimate_id: meta.estimate_id || meta.presentation_id,
          presentation_id: meta.presentation_id,
          action: "approved",
          selected_tier: meta.selected_option || null,
          payment_preference: "stripe",
        } as any);

        // Log activity
        if (meta.estimate_id) {
          await supabase.from("activity_log").insert({
            action: "estimate_paid",
            performed_by: "Stripe",
            details: `Estimate payment of $${amount.toFixed(2)} received via Stripe (${meta.selected_option || "unknown"} tier)`,
          });
        }
        console.log(`Estimate presentation ${meta.presentation_id} marked paid via Stripe`);
      }

    }

    // ── FIX: Handle payment failures ──
    if (type === "checkout.session.expired" || type === "checkout.session.async_payment_failed") {
      if (meta.job_id) {
        const errorMsg = type === "checkout.session.expired"
          ? "Payment link expired — customer did not complete checkout"
          : "Payment failed — bank declined or processing error";

        await supabase.from("jobs").update({
          last_payment_error: errorMsg,
          last_payment_error_at: new Date().toISOString(),
        } as any).eq("id", meta.job_id);

        await supabase.from("activity_log").insert({
          job_id: meta.job_id,
          action: "payment_failed",
          performed_by: "Stripe",
          details: `${errorMsg} (${meta.type || "payment"}, $${amount.toFixed(2)})`,
        });
        console.log(`Job ${meta.job_id} payment failure recorded: ${errorMsg}`);
      }
    }

    if (type === "charge.failed") {
      console.log(`Charge failed: ${data.id} - ${data.failure_message}`);
      // Record failure on the job if we can identify it
      if (jobId) {
        await supabase.from("jobs").update({
          last_payment_error: data.failure_message || "Payment declined",
          last_payment_error_at: new Date().toISOString(),
        } as any).eq("id", jobId);

        await supabase.from("activity_log").insert({
          job_id: jobId,
          action: "payment_failed",
          performed_by: "Stripe",
          details: `Charge failed: ${data.failure_message || "Unknown reason"} ($${amount.toFixed(2)})`,
        });
      }
    }

    if (type === "invoice.paid") {
      const subscriptionId = data.subscription;
      if (subscriptionId) {
        console.log(`Subscription ${subscriptionId} payment received`);
      }
    }

    if (type === "customer.subscription.deleted") {
      const subscriptionId = data.id;
      await supabase.from("service_agreements").update({
        status: "cancelled",
      } as any).eq("stripe_subscription_id", subscriptionId);
      console.log(`Subscription ${subscriptionId} cancelled`);
    }

    if (type === "charge.refunded") {
      console.log(`Charge refunded: ${data.id} - amount: ${data.amount_refunded}`);
    }

    if (type === "charge.dispute.created") {
      console.log(`Dispute created: ${data.id} - amount: ${data.amount}`);
    }

    if (type === "invoice.payment_failed") {
      console.log(`Invoice payment failed: ${data.id}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Webhook error:", err);
    // Critical: Stripe webhooks failing means lost revenue events. Page admin.
    try {
      const supabase = getSupabaseAdmin();
      const errId = await (async () => {
        try {
          const { data } = await supabase.rpc("log_system_error", {
            p_source_type: "edge_function",
            p_source_name: "stripe-webhook",
            p_error_message: err.message ?? String(err),
            p_severity: "critical",
            p_stack_trace: err.stack ?? null,
            p_context: {},
            p_http_status: 500,
          });
          return data as string | null;
        } catch { return null; }
      })();
      await pageOnCall(supabase, {
        service: "stripe-webhook",
        summary: "Stripe webhook 500",
        body: (err.message ?? String(err)).slice(0, 200),
        severity: "critical",
        related_error_id: errId,
      });
    } catch (e) {
      console.error("pageOnCall failed:", e);
    }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
