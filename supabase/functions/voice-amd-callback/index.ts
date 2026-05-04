import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { validateTwilioSignature } from "../_shared/twilioSignature.ts";

// AMD (Answering Machine Detection) callback handler.
//
// SECURITY: this endpoint mutates call_log.answered_by based on caller-supplied
// data. Without a Twilio signature check, an attacker who can guess any active
// CallSid could corrupt our "human vs bot" attribution on real customer calls
// (and trigger downstream side effects like SMS skipping). All Twilio webhook
// handlers in this codebase validate the X-Twilio-Signature header before
// processing — voice-amd-callback was the only one missing the check.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.text();

    // Reject unsigned/forged callbacks. Same pattern as voice-status-callback.
    const sigValid = await validateTwilioSignature(req, formData);
    if (!sigValid) {
      console.warn("Rejecting voice-amd-callback: invalid Twilio signature");
      return new Response(
        JSON.stringify({ error: "Invalid Twilio signature" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const params = new URLSearchParams(formData);

    const callSid = params.get("CallSid") || "";
    const answeredBy = params.get("AnsweredBy") || ""; // human, machine_start, machine_end_beep, machine_end_silence, machine_end_other, fax, unknown

    console.log(`AMD callback: CallSid=${callSid}, AnsweredBy=${answeredBy}`);

    if (!callSid || !answeredBy) {
      return new Response("ok", { headers: corsHeaders, status: 200 });
    }

    const supabase = getSupabaseAdmin();

    // Don't overwrite answered_by on calls that already reached terminal state —
    // a late AMD callback after a call already completed/voicemail'd shouldn't
    // re-attribute the call. Mirrors the terminal-state guard pattern in
    // voice-status-callback.
    const { data: existing } = await supabase
      .from("call_log")
      .select("status, answered_by")
      .eq("twilio_sid", callSid)
      .maybeSingle();

    const TERMINAL = new Set([
      "completed", "no-answer", "busy", "failed", "canceled", "cancelled",
      "voicemail", "missed", "missed-while-busy", "suspected-bot", "unknown",
    ]);
    if (existing && existing.status && TERMINAL.has(existing.status)) {
      console.log(
        `[amd-guard] skipping AMD update for terminal call ${callSid} (status=${existing.status})`
      );
      return new Response("ok", { headers: corsHeaders, status: 200 });
    }

    // Update call_log row with detection result
    await supabase
      .from("call_log")
      .update({ answered_by: answeredBy })
      .eq("twilio_sid", callSid);

    // Broadcast via realtime channel so UI can react instantly
    const channel = supabase.channel(`call-amd-${callSid}`);
    await channel.send({
      type: "broadcast",
      event: "amd",
      payload: { callSid, answeredBy },
    });

    return new Response("ok", { headers: corsHeaders, status: 200 });
  } catch (error) {
    console.error("voice-amd-callback error:", error);
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }
});
