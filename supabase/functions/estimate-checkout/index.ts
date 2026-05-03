import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";

type CartLine = {
  kind: "equipment" | "repair" | "part" | "custom";
  source_id?: string | null;
  name: string;
  description?: string | null;
  image_url?: string | null;
  quantity: number;
  unit_price: number;
  tier?: string | null;
  metadata?: Record<string, unknown>;
};

const APP_BASE_URL =
  Deno.env.get("PUBLIC_BASE_URL") ||
  Deno.env.get("APP_BASE_URL") ||
  "https://codex-ultron.onrender.com";

async function logQuoteCartEvent(supabase: any, event: Record<string, unknown>) {
  const { error } = await supabase.from("quote_cart_events").insert(event);
  if (error) console.warn("quote_cart_events insert failed:", error.message);
}

function isUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function paymentTiming(method?: string | null) {
  if (method === "stripe") return "pay_now";
  if (method === "financing" || method === "financing_36mo" || method === "financing_120mo") return "financing";
  if (method === "pay_after_completion" || method === "pay_later" || method === "factory_rebate") return "pay_after_completion";
  if (method === "cash") return "cash";
  if (method === "approve") return "approve_only";
  return "unspecified";
}

function statusForTiming(timing: string) {
  return timing === "pay_now" ? "sent" : "approved";
}

function labelForOption(key: string) {
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");
}

function buildSelection(snapshot: any, selectedOptionKey: string): { total: number; title: string; lines: CartLine[]; selectedSnapshot: any } {
  const addons = Array.isArray(snapshot?.addons) ? snapshot.addons : [];
  const addonLines: CartLine[] = addons.map((addon: any) => ({
    kind: "custom",
    source_id: isUuid(addon.id) ? addon.id : null,
    name: addon.name || "Add-on",
    description: addon.description || null,
    quantity: 1,
    unit_price: Number(addon.price || 0),
    tier: selectedOptionKey,
    metadata: {
      source: "proposal_addon",
      original_price: addon.original_price ?? null,
    },
  })).filter((line) => line.unit_price > 0);

  if (snapshot?.cart_type === "new_system") {
    const option = snapshot.system_options?.[selectedOptionKey];
    if (!option) throw new Error("Invalid option selected");
    const systemPrice = Number(option.price || 0);
    const title = `${option.brand || ""} ${option.label || "System"} - ${labelForOption(selectedOptionKey)} Tier`.trim();
    const systemLine: CartLine = {
      kind: "equipment",
      source_id: isUuid(option.equipment_id) ? option.equipment_id : null,
      name: title,
      description: option.description || null,
      image_url: option.image_url || null,
      quantity: 1,
      unit_price: systemPrice,
      tier: selectedOptionKey,
      metadata: {
        source: "proposal_option",
        cart_type: "new_system",
        selected_option_key: selectedOptionKey,
        seer2: option.seer2 ?? null,
        tonnage: option.tonnage ?? null,
        monthly_payment: option.monthly_payment ?? null,
        features_benefits: option.features_benefits ?? [],
      },
    };
    return {
      total: systemPrice + addonLines.reduce((sum, line) => sum + line.unit_price, 0),
      title,
      lines: [systemLine, ...addonLines],
      selectedSnapshot: { cart_type: "new_system", option, addons },
    };
  }

  if (snapshot?.cart_type === "repair") {
    const tierItems = snapshot.repair_tiers?.[selectedOptionKey];
    if (!tierItems || !Array.isArray(tierItems)) throw new Error("Invalid repair tier selected");
    const repairLines: CartLine[] = tierItems.map((item: any, index: number) => ({
      kind: "repair",
      source_id: isUuid(item.id) ? item.id : (isUuid(item.equipment_id) ? item.equipment_id : null),
      name: item.item || item.label || `Repair item ${index + 1}`,
      description: item.description || null,
      quantity: Number(item.quantity || 1),
      unit_price: Number(item.price || item.unit_price || 0),
      tier: selectedOptionKey,
      metadata: {
        source: "proposal_option",
        cart_type: "repair",
        selected_option_key: selectedOptionKey,
      },
    })).filter((line) => line.unit_price > 0);
    const title = `Repair - ${labelForOption(selectedOptionKey)}`;
    return {
      total: [...repairLines, ...addonLines].reduce((sum, line) => sum + (line.quantity * line.unit_price), 0),
      title,
      lines: [...repairLines, ...addonLines],
      selectedSnapshot: { cart_type: "repair", items: tierItems, addons },
    };
  }

  throw new Error("Unsupported proposal type");
}

async function resolveJobId(supabase: any, presentation: any) {
  if (!presentation?.estimate_id) return null;

  const { data: jobDirect } = await supabase
    .from("jobs")
    .select("id")
    .eq("id", presentation.estimate_id)
    .maybeSingle();
  if (jobDirect?.id) return jobDirect.id;

  const { data: estimate } = await supabase
    .from("estimates")
    .select("id, source_job_id")
    .eq("id", presentation.estimate_id)
    .maybeSingle();
  return estimate?.source_job_id || null;
}

async function upsertRememberedCart(
  supabase: any,
  presentation: any,
  jobId: string,
  selectedOptionKey: string,
  timing: string,
  paymentMethod: string | null,
  lines: CartLine[],
  selectedSnapshot: any
) {
  const rememberedPaymentMethod = timing === "pay_now" ? "stripe" : paymentMethod || timing;
  const { data: existing } = await supabase
    .from("job_carts")
    .select("id")
    .eq("job_id", jobId)
    .not("status", "in", '("canceled","declined","paid")')
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let cartId = existing?.id;
  if (!cartId) {
    const { data: created, error: createErr } = await supabase
      .from("job_carts")
      .insert({
        job_id: jobId,
        status: statusForTiming(timing),
        created_by: "proposal_approval",
        source_presentation_id: presentation.id,
        selected_option_key: selectedOptionKey,
        payment_timing: timing,
        payment_method: rememberedPaymentMethod,
        approved_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
        approved_scope_snapshot: selectedSnapshot,
      })
      .select("id")
      .single();
    if (createErr) throw createErr;
    cartId = created.id;
  } else {
    const { error: updateErr } = await supabase
      .from("job_carts")
      .update({
        status: statusForTiming(timing),
        source_presentation_id: presentation.id,
        selected_option_key: selectedOptionKey,
        payment_timing: timing,
        payment_method: rememberedPaymentMethod,
        approved_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
        approved_scope_snapshot: selectedSnapshot,
      })
      .eq("id", cartId);
    if (updateErr) throw updateErr;
    await supabase.from("job_cart_items").delete().eq("cart_id", cartId);
  }

  const rows = lines.map((line, index) => ({
    cart_id: cartId,
    kind: line.kind,
    source_id: line.source_id || null,
    name: line.name,
    description: line.description || null,
    image_url: line.image_url || null,
    quantity: line.quantity,
    unit_price: line.unit_price,
    total_price: line.quantity * line.unit_price,
    tier: line.tier || selectedOptionKey,
    metadata: line.metadata || {},
    sort_order: index,
  }));

  if (rows.length > 0) {
    const { error: itemErr } = await supabase.from("job_cart_items").insert(rows);
    if (itemErr) throw itemErr;
  }

  return cartId;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    const { presentation_id, selected_option_key, payment_method, customer_email, success_url, cancel_url } = await req.json();

    if (!presentation_id || !selected_option_key) {
      return new Response(JSON.stringify({ error: "Missing presentation_id or selected_option_key" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getSupabaseAdmin();
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

    const selected = buildSelection(snapshot, selected_option_key);
    if (selected.total <= 0) {
      return new Response(JSON.stringify({ error: "Invalid amount" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const timing = paymentTiming(payment_method || "stripe");
    const jobId = await resolveJobId(supabase, pres);
    let cartId: string | null = null;
    let cartToken: string | null = null;
    let checkoutTotal = selected.total;
    let pricingSummary: Record<string, unknown> | null = null;

    await supabase.from("estimate_presentations").update({
      status: "approved",
      selected_option_key,
      payment_method: payment_method || "stripe",
      approved_at: new Date().toISOString(),
      total_amount: selected.total,
    }).eq("id", presentation_id);

    if (jobId) {
      cartId = await upsertRememberedCart(supabase, pres, jobId, selected_option_key, timing, payment_method || null, selected.lines, selected.selectedSnapshot);
      await supabase.rpc("refresh_job_cart_pricing", { p_cart_id: cartId });
      const { data: cart } = await supabase
        .from("job_carts")
        .select("public_token,total,pricing_summary")
        .eq("id", cartId)
        .maybeSingle();
      cartToken = cart?.public_token || null;
      checkoutTotal = Number(cart?.total || selected.total);
      pricingSummary = cart?.pricing_summary || null;
      await supabase.from("estimate_presentations").update({
        total_amount: checkoutTotal,
      }).eq("id", presentation_id);
      await supabase.from("activity_log").insert({
        job_id: jobId,
        action: "proposal_option_approved",
        details: `Customer approved ${selected.title} (${payment_method || "stripe"}). Cart remembered for $${checkoutTotal.toFixed(2)}.`,
      });
    }

    await supabase.from("estimate_responses").insert({
      estimate_id: pres.estimate_id,
      presentation_id,
      action: "approved",
      selected_tier: selected_option_key,
      payment_preference: payment_method || "stripe",
    });

    const { error: approvalEventError } = await supabase.rpc("record_estimate_approval_event", {
      p_estimate_id: pres.estimate_id,
      p_approval_method: "digital",
      p_approval_status: "approved",
      p_selected_option_key: selected_option_key,
      p_payment_method: payment_method || "stripe",
      p_note: null,
      p_recorded_by_name: null,
      p_actor_type: "customer",
      p_presentation_id: presentation_id,
      p_job_cart_id: cartId,
      p_scope_snapshot: selected.selectedSnapshot || {},
      p_metadata: {
        source: "estimate-checkout",
        payment_timing: timing,
        total: checkoutTotal,
      },
    });
    if (approvalEventError) {
      console.warn("estimate approval custody event failed:", approvalEventError.message);
    }

    // ── Auto-trigger downstream job creation handoff ────────────────────────
    // When a customer approves digitally (this path), the frontend hook that
    // normally auto-creates an install job from a "won" estimate doesn't fire —
    // because the dispatcher never clicked "Won". Without this, approved estimates
    // sit in limbo until office staff notices and manually converts.
    //
    // Per "JARVIS prepares, humans approve" principle: we create an action card so
    // dispatch sees the approval immediately and can convert with one click. This
    // is INTENTIONALLY not auto-creating the job here — install-job creation has
    // side effects (scheduling, equipment ordering, permit lookup) that benefit
    // from a dispatcher reviewing details first.
    try {
      const { data: estDetails } = await supabase
        .from("estimates")
        .select("id, customer_id, customer_phone, customer_name, address, total_amount, estimate_number, work_status")
        .eq("id", pres.estimate_id)
        .maybeSingle();
      const ed = estDetails as any;
      if (ed && ed.work_status !== "won") {
        const customerLabel = ed.customer_name || "customer";
        const totalLabel = ed.total_amount ? ` ($${Number(ed.total_amount).toFixed(2)})` : "";
        const refLabel = ed.estimate_number ? ` ${ed.estimate_number}` : "";
        await supabase.from("action_items").insert({
          title: `Approved estimate${refLabel} — convert to install job`,
          description: `${customerLabel} just approved their estimate digitally${totalLabel}. Review and convert to an install job so it gets scheduled.`,
          category: "estimate_approved_convert",
          priority: "high",
          source: "estimate-checkout",
          status: "pending",
          customer_phone: ed.customer_phone || null,
          suggested_action: "Open the estimate, mark Won to auto-create the install job, and confirm it appears on Dispatch HQ.",
          metadata: {
            living_card: true,
            owner_type: "office_queue",
            owner_queue: "dispatch",
            owner_label: "Dispatch queue",
            owner_required: true,
            estimate_id: ed.id,
            customer_id: ed.customer_id || null,
            payment_method: payment_method || "stripe",
            selected_option_key,
            total: checkoutTotal,
            address: ed.address || null,
            triggered_by: "customer_digital_approval",
          },
        });
      }
    } catch (handoffErr: any) {
      // Non-fatal: failing to create the handoff card shouldn't break checkout.
      // The approval event is still recorded; dispatcher can find approved estimates manually.
      console.warn("estimate-checkout: convert-to-job handoff card failed:", handoffErr?.message);
    }

    await logQuoteCartEvent(supabase, {
      event_type: "customer_approved",
      actor_type: "customer",
      cart_id: cartId,
      job_id: jobId,
      estimate_id: pres.estimate_id,
      presentation_id,
      metadata: {
        source: "estimate-checkout",
        selected_option_key,
        payment_method: payment_method || "stripe",
        payment_timing: timing,
        total: checkoutTotal,
      },
    });

    if (timing !== "pay_now") {
      return new Response(JSON.stringify({
        success: true,
        cart_id: cartId,
        cart_url: cartToken ? `${APP_BASE_URL}/cart/${cartToken}` : null,
        payment_method,
        payment_timing: timing,
        pricing: pricingSummary,
        message: timing === "financing"
          ? "Financing selected. The approved cart is saved while financing is completed."
          : "Approved. The cart is saved and can be paid after the work is complete.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "Stripe is not configured." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const params = new URLSearchParams();
    params.append("mode", "payment");
    params.append("line_items[0][price_data][currency]", "usd");
    params.append("line_items[0][price_data][product_data][name]", selected.title);
    params.append("line_items[0][price_data][unit_amount]", String(Math.round(checkoutTotal * 100)));
    params.append("line_items[0][quantity]", "1");
    params.append("success_url", success_url || `${APP_BASE_URL}/presentation/${pres.token}?paid=true`);
    params.append("cancel_url", cancel_url || `${APP_BASE_URL}/presentation/${pres.token}`);
    if (customer_email) params.append("customer_email", customer_email);
    params.append("metadata[type]", cartId ? "job_cart" : "estimate");
    params.append("metadata[presentation_id]", presentation_id);
    params.append("metadata[estimate_id]", pres.estimate_id);
    params.append("metadata[selected_option]", selected_option_key);
    params.append("metadata[server_total]", checkoutTotal.toFixed(2));
    if (cartId) params.append("metadata[cart_id]", cartId);
    if (jobId) params.append("metadata[job_id]", jobId);
    if (cartToken) params.append("metadata[cart_token]", cartToken);

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

    await supabase.from("estimate_presentations").update({
      stripe_payment_intent_id: session.id,
    }).eq("id", presentation_id);

    if (cartId) {
      await supabase.from("job_carts").update({
        stripe_checkout_url: session.url,
        stripe_payment_intent_id: session.id,
      }).eq("id", cartId);
    }

    await logQuoteCartEvent(supabase, {
      event_type: "payment_started",
      actor_type: "customer",
      cart_id: cartId,
      job_id: jobId,
      estimate_id: pres.estimate_id,
      presentation_id,
      metadata: {
        source: "estimate-checkout",
        payment_method: "stripe",
        selected_option_key,
        total: checkoutTotal,
        stripe_session_id: session.id,
      },
    });

    return new Response(JSON.stringify({
      url: session.url,
      session_id: session.id,
      cart_id: cartId,
      cart_url: cartToken ? `${APP_BASE_URL}/cart/${cartToken}` : null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
