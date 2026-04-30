import { corsHeaders } from "../_shared/cors.ts";
import { requireStaffOrInternal } from "../_shared/functionAuth.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

function normalize10(value: string | null | undefined): string {
  return (value || "").replace(/\D/g, "").slice(-10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseAdmin();
    const auth = await requireStaffOrInternal(req, supabase);
    if (!auth.ok) {
      return new Response(
        JSON.stringify({ error: auth.error }),
        { status: auth.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const prompt = String(body.prompt || "").trim();
    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "Missing prompt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: ownerSetting } = await supabase
      .from("company_settings")
      .select("value")
      .eq("key", "owner_input_phone")
      .maybeSingle();

    const ownerPhone = String(ownerSetting?.value || Deno.env.get("OWNER_INPUT_PHONE") || "").trim();
    const ownerPhoneLast10 = normalize10(ownerPhone);
    if (ownerPhoneLast10.length !== 10) {
      return new Response(
        JSON.stringify({ error: "Owner input phone is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: requestRow, error: insertError } = await supabase
      .from("owner_input_requests")
      .insert({
        prompt,
        owner_phone_last10: ownerPhoneLast10,
        requested_by: body.requested_by || null,
        requested_by_name: body.requested_by_name || null,
        source_context: body.source_context || {},
      })
      .select("id")
      .single();
    if (insertError || !requestRow) throw insertError || new Error("Could not create owner input request");

    const smsBody =
      `Codex needs your input:\n${prompt}\n\nReply to this text. Your reply will be logged for review and will not execute code automatically. Ref: ${String(requestRow.id).slice(0, 8)}`;

    const smsResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-sms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "x-source-function": "owner_input_request",
        "x-hitl-approved": "true",
      },
      body: JSON.stringify({
        to: ownerPhone,
        body: smsBody,
        internal: true,
        source: "owner_input_request",
      }),
    });

    if (!smsResp.ok) {
      const text = await smsResp.text();
      await supabase
        .from("owner_input_requests")
        .update({ status: "failed", source_context: { ...(body.source_context || {}), send_error: text } })
        .eq("id", requestRow.id);
      return new Response(
        JSON.stringify({ error: "Could not text owner", details: text, request_id: requestRow.id }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, request_id: requestRow.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[request-owner-input]", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
