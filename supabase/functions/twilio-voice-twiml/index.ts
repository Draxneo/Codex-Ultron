import { resolveContact } from "../_shared/resolveContact.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.text();
    const params = new URLSearchParams(formData);

    // Desktop JS SDK sends "To" while the native Android service may send lowercase "to"
    const to = params.get("To") || params.get("to") || params.get("phone") || "";
    const jobId = params.get("jobId") || null;
    const explicitCustomerId = params.get("customerId") || null;
    const explicitContactName = params.get("contactName") || null;
    const rawCallerId = Deno.env.get("TWILIO_PHONE_NUMBER") || "";
    // Normalize caller ID to E.164 — Twilio rejects non-E.164 in <Dial callerId>
    const callerDigits = rawCallerId.replace(/\D/g, "");
    const callerId = callerDigits.length === 10 ? `+1${callerDigits}` : callerDigits.length === 11 && callerDigits.startsWith("1") ? `+${callerDigits}` : rawCallerId.startsWith("+") ? rawCallerId : `+${callerDigits}`;
    const callSid = params.get("CallSid") || "";

    if (!to) {
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>No destination number provided.</Say></Response>',
        { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
      );
    }

    // Log the outbound call
            const supabase = getSupabaseAdmin();
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";

    // Resolve contact via shared helper, but PREFER explicit context from the caller
    // (job/estimate detail page) since that's deterministic — phone-only resolution
    // can be wrong (shared phones, ported numbers, multiple records).
    const resolved = await resolveContact(supabase, to);
    const contactName = explicitContactName || resolved.contactName;
    const contactType = explicitCustomerId ? "customer" : resolved.contactType;

    // Upsert call log entry with full deterministic context.
    // Use UPSERT on twilio_sid so racing browser-side updates (e.g. status flip
    // to "in-progress" on accept) cannot lose the deterministic enrichment, and
    // we never insert a duplicate row if the browser writes first.
    if (callSid) {
      const { error: upsertErr } = await supabase
        .from("call_log")
        .upsert(
          {
            direction: "outbound",
            phone_number: to,
            status: "initiated",
            twilio_sid: callSid,
            contact_name: contactName,
            contact_type: contactType,
            ...(jobId ? { related_job_id: jobId } : {}),
            ...(explicitCustomerId ? { related_customer_id: explicitCustomerId } : {}),
          },
          { onConflict: "twilio_sid", ignoreDuplicates: false }
        );
      if (upsertErr) {
        console.error("twilio-voice-twiml: call_log upsert failed:", upsertErr);
      }
    }

    if (jobId || explicitCustomerId) {
      console.log(`TwiML: Linked outbound call → job=${jobId} customer=${explicitCustomerId} name=${contactName}`);
    }

    // Check if live transcription is enabled
    const { data: ltSetting } = await supabase
      .from("company_settings")
      .select("value")
      .eq("key", "live_transcription_enabled")
      .maybeSingle();
    const liveTranscribeEnabled = (ltSetting as any)?.value === "true";

    console.log(`TwiML: Dialing ${to} with caller ID ${callerId} (raw: ${rawCallerId}), SID: ${callSid}, liveTranscribe: ${liveTranscribeEnabled}, rawParamsTo=${params.get("To")}, rawParamsLowerTo=${params.get("to")}`);

    // XML-escape any value interpolated into TwiML attributes/text
    const xmlEscape = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

    const safeTo = xmlEscape(to);
    const safeCallerId = xmlEscape(callerId);

    const streamTwiml = liveTranscribeEnabled
      ? `<Start><Stream url="wss://${supabaseUrl.replace("https://", "")}/functions/v1/live-transcribe" track="both_tracks" /></Start>`
      : "";

    // Direct dial — no conference bridging.
    // - timeLimit raised to 14400s (4h) for long install/diagnostic calls.
    // - AMD (machineDetection) removed: it added 3-5s of silence before the
    //   number rang, hurting UX. Voicemail is still recorded by Twilio.
    // - recordingStatusCallbackEvent now also includes "failed" so we can
    //   detect/log when a recording never materialized.
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${streamTwiml}
  <Dial callerId="${safeCallerId}" timeLimit="14400" hangupOnStar="true" record="record-from-answer-dual" recordingStatusCallback="${supabaseUrl}/functions/v1/voice-status-callback" recordingStatusCallbackEvent="completed failed" statusCallback="${supabaseUrl}/functions/v1/voice-status-callback" statusCallbackEvent="initiated ringing answered completed">
    <Number>${safeTo}</Number>
  </Dial>
</Response>`;

    return new Response(twiml, {
      headers: { ...corsHeaders, "Content-Type": "text/xml" },
      status: 200,
    });
  } catch (error) {
    console.error("twilio-voice-twiml error:", error);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred.</Say></Response>',
      { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
    );
  }
});

