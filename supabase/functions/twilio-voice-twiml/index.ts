import { resolveContact } from "../_shared/resolveContact.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { validateTwilioSignature } from "../_shared/twilioSignature.ts";
import { logSystemTrace } from "../_shared/systemTrace.ts";
import { getTwilioCallerId, maskPhone, normalizeNorthAmericaOutbound } from "../_shared/phoneSafety.ts";
import { getDefaultBusinessUnit, normalizeE164Phone, resolveBusinessUnitById, type BusinessUnit } from "../_shared/businessUnits.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.text();
    const params = new URLSearchParams(formData);
    const sigValid = await validateTwilioSignature(req, formData);
    if (!sigValid) {
      console.warn("Rejecting twilio-voice-twiml: invalid Twilio signature");
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 403 },
      );
    }

    // Desktop JS SDK sends "To" while the native Android service may send lowercase "to".
    const rawTo = params.get("To") || params.get("to") || params.get("phone") || "";
    const to = normalizeNorthAmericaOutbound(rawTo);
    const jobId = params.get("jobId") || null;
    const explicitCustomerId = params.get("customerId") || null;
    const explicitContactName = params.get("contactName") || null;
    const callSid = params.get("CallSid") || "";
    const supabase = getSupabaseAdmin();
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";

    if (!to) {
      await logSystemTrace({
        sourceType: "voice",
        sourceName: "twilio-voice-twiml",
        eventKind: "outbound_twiml_rejected",
        summary: "Outbound softphone call rejected: invalid destination",
        reason: "invalid_destination",
        severity: "warning",
        traceGroup: callSid || null,
        entityType: "call",
        entityId: callSid || null,
        callSid: callSid || null,
        metadata: { to_masked: maskPhone(rawTo), job_id: jobId, customer_id: explicitCustomerId },
      });
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>The destination number is not allowed.</Say></Response>',
        { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 },
      );
    }

    await logSystemTrace({
      sourceType: "voice",
      sourceName: "twilio-voice-twiml",
      eventKind: "outbound_twiml_requested",
      summary: "Outbound softphone call requested",
      reason: "dial_number",
      severity: "info",
      traceGroup: callSid || null,
      entityType: "call",
      entityId: callSid || null,
      callSid: callSid || null,
      metadata: {
        signature_accepted_by: "twilio_signature",
        to_last4: to.replace(/\D/g, "").slice(-4),
        job_id: jobId,
        customer_id: explicitCustomerId,
        has_contact_name: Boolean(explicitContactName),
      },
    });

    // Resolve contact via shared helper, but prefer explicit context from job/estimate pages.
    const resolved = await resolveContact(supabase, to);
    const contactName = explicitContactName || resolved.contactName;
    const contactType = explicitCustomerId ? "customer" : resolved.contactType;

    let businessUnit: BusinessUnit | null = null;
    let customerIdForBusinessUnit = explicitCustomerId;
    if (!customerIdForBusinessUnit && jobId) {
      const { data: jobRow } = await supabase
        .from("jobs")
        .select("customer_id")
        .eq("id", jobId)
        .maybeSingle();
      customerIdForBusinessUnit = (jobRow as any)?.customer_id || null;
    }
    if (customerIdForBusinessUnit) {
      const { data: customerRow } = await supabase
        .from("customers")
        .select("primary_business_unit_id")
        .eq("id", customerIdForBusinessUnit)
        .maybeSingle();
      businessUnit = await resolveBusinessUnitById(supabase, (customerRow as any)?.primary_business_unit_id || null);
    }
    if (!businessUnit) businessUnit = await getDefaultBusinessUnit(supabase);

    const callerId = normalizeE164Phone(businessUnit?.primary_phone_number) || getTwilioCallerId();

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
            called_number: callerId,
            business_unit_id: businessUnit?.id || null,
            ...(jobId ? { related_job_id: jobId } : {}),
            ...(explicitCustomerId ? { related_customer_id: explicitCustomerId } : {}),
          },
          { onConflict: "twilio_sid", ignoreDuplicates: false },
        );
      if (upsertErr) {
        console.error("twilio-voice-twiml: call_log upsert failed:", upsertErr);
      }
    }

    if (jobId || explicitCustomerId) {
      console.log(`TwiML: Linked outbound call -> job=${jobId} customer=${explicitCustomerId} name=${contactName}`);
    }

    const { data: ltSetting } = await supabase
      .from("company_settings")
      .select("value")
      .eq("key", "live_transcription_enabled")
      .maybeSingle();
    const liveTranscribeEnabled = (ltSetting as any)?.value === "true";

    console.log(
      `TwiML: Dialing ${maskPhone(to)} with company caller ID ${maskPhone(callerId)}, SID: ${callSid}, liveTranscribe: ${liveTranscribeEnabled}`,
    );

    const xmlEscape = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

    const safeTo = xmlEscape(to);
    const safeCallerId = xmlEscape(callerId);

    const streamTwiml = liveTranscribeEnabled
      ? `<Start><Stream url="wss://${supabaseUrl.replace("https://", "")}/functions/v1/live-transcribe" track="both_tracks" /></Start>`
      : "";

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${streamTwiml}
  <Dial callerId="${safeCallerId}" timeLimit="14400" hangupOnStar="true" answerOnBridge="true" record="record-from-answer-dual" recordingStatusCallback="${supabaseUrl}/functions/v1/voice-status-callback" recordingStatusCallbackEvent="completed failed" statusCallback="${supabaseUrl}/functions/v1/voice-status-callback" statusCallbackEvent="initiated ringing answered completed">
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
      { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 },
    );
  }
});
