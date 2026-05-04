import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { getTaskModel } from "../_shared/getTaskModel.ts";
import { requireStaffOrInternal } from "../_shared/functionAuth.ts";

/**
 * draft-sms-reply
 *
 * Generates a short, friendly SMS reply for a thread_attention action_item on demand.
 * The draft is cached into the action_item's metadata.suggested_reply so the dispatcher
 * sees it on the existing card. NO SMS is sent here — the actual send goes through
 * send-sms with its own auth + opt-out gate.
 *
 * SYSTEM CONNECTIONS: writes to public.action_items (metadata only).
 * SITS ON: dispatcher UI buttons that call this function via supabase.functions.invoke.
 *
 * Auth contract: must be invoked by an authenticated staff user OR a service-role
 * caller. Without this gate the function would let anyone spam OpenAI calls by guessing
 * action_item_ids — costly and noisy. We do NOT route through the jarvis-action-gateway
 * approval loop because this isn't an autonomous mutation: it's a dispatcher-initiated
 * draft that lands on an EXISTING card the dispatcher will already review before sending.
 *
 * Input: { action_item_id }
 * Returns: { reply: string }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Initialize Supabase admin client first — needed by both the auth check below
    // (which reads roles) AND the action_items read/update further down.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Auth gate: only authenticated staff or service-role internal callers may invoke.
    // Prevents anonymous OpenAI cost abuse via guessed action_item_ids.
    const auth = await requireStaffOrInternal(req, supabase);
    if (!auth.ok) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action_item_id } = await req.json();
    if (!action_item_id) {
      return new Response(JSON.stringify({ error: "action_item_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

    const { data: item, error: itemErr } = await supabase
      .from("action_items").select("*").eq("id", action_item_id).single();
    if (itemErr || !item) throw new Error("action_item not found");

    const meta = (item.metadata as any) || {};
    const inbound = meta.inbound_message || meta.thread_snippet || "";
    const customerName = meta.customer_name || "the customer";
    const jobRef = meta.job_ref ? ` (job ${meta.job_ref})` : "";
    const jobType = meta.job_type ? `, ${meta.job_type}` : "";
    const jobAddr = meta.job_address ? `, address: ${meta.job_address}` : "";
    const jobWhen = meta.job_scheduled ? `, scheduled ${meta.job_scheduled}` : "";

    const prompt = `Draft a short, friendly SMS reply (1-2 sentences, no greeting, no signature) for an HVAC company's dispatcher to send to a customer.

Customer: ${customerName}${jobRef}${jobType}${jobAddr}${jobWhen}
Customer's message: "${inbound}"
Dispatcher's intent: ${item.suggested_action || item.description || "respond appropriately"}

Rules:
- Plain text only, no quotes around the reply
- Sound like a real person, not a bot
- Confirm what you can confirm, ask for what you need
- Do NOT promise specific times unless they were given in the dispatcher's intent`;

    const model = await getTaskModel(supabase, "sms_auto_reply").catch(() => "gpt-5-mini");

    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
    });
    if (!aiResp.ok) {
      const txt = await aiResp.text();
      throw new Error(`AI gateway error ${aiResp.status}: ${txt.slice(0, 200)}`);
    }
    const data = await aiResp.json();
    const reply = (data.choices?.[0]?.message?.content || "").trim().replace(/^["']|["']$/g, "");

    // Cache the draft back into metadata so it persists if the user reloads
    await supabase.from("action_items")
      .update({ metadata: { ...meta, suggested_reply: reply } })
      .eq("id", action_item_id);

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("draft-sms-reply error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
