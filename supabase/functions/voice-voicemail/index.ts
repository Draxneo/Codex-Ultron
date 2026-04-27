import { sendIvrSms } from "../_shared/smsHelper.ts";
import { resolveSmsTemplateBody } from "../_shared/smsTemplates.ts";
import { fetchRecordingWithAuth } from "../_shared/twilioRecording.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { buildKeytermParams } from "../_shared/deepgramKeyterms.ts";
import { logSystemTrace } from "../_shared/systemTrace.ts";
import { validateTwilioSignature } from "../_shared/twilioSignature.ts";
import { getTwilioCallerId } from "../_shared/phoneSafety.ts";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeE164Phone(phone: string | null | undefined): string {
  const value = (phone || "").trim();
  if (value.startsWith("+")) return value;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return value;
}

function buildQueueTwiml({
  holdMusicUrl,
  waitSeconds,
  redirectUrl,
  reason,
}: {
  holdMusicUrl: string | null | undefined;
  waitSeconds: number;
  redirectUrl: string;
  reason?: "busy" | "no_answer";
}): string {
  const safeWait = Math.max(5, waitSeconds);
  const fallbackPrompt = reason === "no_answer"
    ? "One moment while we try the next available team member."
    : "All team members are helping other callers. Please stay on the line while we hold your place in queue.";
  const holdPrompt = holdMusicUrl
    ? `<Play loop="${Math.max(1, Math.ceil(safeWait / 5))}">${
      escapeXml(holdMusicUrl)
    }</Play>`
    : `<Say voice="Polly.Joanna">${escapeXml(fallbackPrompt)}</Say><Pause length="${safeWait}"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${holdPrompt}
  <Redirect method="POST">${escapeXml(redirectUrl)}</Redirect>
</Response>`;
}

async function transcribeRecording(
  recordingUrl: string,
): Promise<string | null> {
  const DEEPGRAM_API_KEY = Deno.env.get("DEEPGRAM_API_KEY");
  if (!DEEPGRAM_API_KEY || !recordingUrl) return null;

  try {
    const audioBytes = await fetchRecordingWithAuth(recordingUrl);
    if (!audioBytes) {
      console.error(
        "Failed to fetch recording for transcription (auth or network error)",
      );
      return null;
    }

    const sb = getSupabaseAdmin();
    const keyterms = await buildKeytermParams(sb);
    const dgResp = await fetch(
      `https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&language=en${keyterms}`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${DEEPGRAM_API_KEY}`,
          "Content-Type": "audio/mpeg",
        },
        body: audioBytes,
      },
    );

    if (!dgResp.ok) {
      console.error("Deepgram API error:", dgResp.status, await dgResp.text());
      return null;
    }

    const dgData = await dgResp.json();
    return dgData?.results?.channels?.[0]?.alternatives?.[0]?.transcript
      ?.trim() || null;
  } catch (err) {
    console.error("Transcription error:", err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const callSid = url.searchParams.get("CallSid") || "";
    const from = url.searchParams.get("From") || "";
    const contactName = url.searchParams.get("ContactName") || "";
    const contactType = url.searchParams.get("ContactType") || "unknown";
    const digit = url.searchParams.get("Digit") || "";
    const queueRetry = url.searchParams.get("QueueRetry") === "1";

    const formData = await req.text();
    const params = new URLSearchParams(formData);
    const sigValid = await validateTwilioSignature(req, formData);
    if (!sigValid) {
      console.warn("Rejecting voice-voicemail: invalid Twilio signature");
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 403 },
      );
    }

    const recordingUrl = params.get("RecordingUrl") || "";
    const recordingSid = params.get("RecordingSid") || "";
    const recordingDuration = parseInt(params.get("RecordingDuration") || "0");
    const recordingStatus = params.get("RecordingStatus") || "";
    const dialCallStatus = params.get("DialCallStatus") || "";
    const dialCallDuration = parseInt(params.get("DialCallDuration") || "0", 10);

    const supabase = getSupabaseAdmin();
    const { data: smsTestModeRow } = await supabase
      .from("company_settings")
      .select("value")
      .eq("key", "sms_test_mode")
      .maybeSingle();
    const allowEmployeeTestSms = smsTestModeRow?.value === "true";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    // ── PHASE 1: Dial action callback (no recording yet) ──
    // Twilio hits this URL when the <Dial> ends.
    // If the call was answered and completed normally, just hang up — no voicemail needed.
    if (!recordingUrl && !recordingStatus) {
      console.log(
        `Voicemail check: DialCallStatus=${dialCallStatus}, from=${from}, contact=${
          contactName || "unknown"
        }`,
      );
      await logSystemTrace({
        sourceType: "voice",
        sourceName: "voice-voicemail",
        eventKind: "dial_completed",
        summary: `Dial leg ended for ${contactName || from}`,
        reason: dialCallStatus || "unknown",
        severity: dialCallStatus === "completed" ? "info" : "warning",
        traceGroup: callSid,
        entityType: "call",
        entityId: callSid,
        callSid,
        metadata: {
          from,
          contact_name: contactName,
          contact_type: contactType,
        },
      });

      // Call was answered and completed — clean hangup, no voicemail
      const cleanlyAnsweredDial =
        dialCallStatus === "completed" ||
        dialCallStatus === "answered" ||
        dialCallDuration > 0;

      if (cleanlyAnsweredDial) {
        return new Response(
          '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup /></Response>',
          {
            headers: { ...corsHeaders, "Content-Type": "text/xml" },
            status: 200,
          },
        );
      }

      // ── BOT GUARD: never overflow suspected bots to the answering service ──
      try {
        const { data: botCheck } = await supabase
          .from("call_log")
          .select("status")
          .eq("twilio_sid", callSid)
          .maybeSingle();
        if (botCheck?.status === "suspected-bot") {
          console.log(
            `🤖 Suspected bot — skipping overflow + voicemail, hanging up. CallSid=${callSid}`,
          );
          await logSystemTrace({
            sourceType: "voice",
            sourceName: "voice-voicemail",
            eventKind: "route_decision",
            summary: "Voicemail and overflow skipped for suspected bot",
            reason: "suspected_bot",
            severity: "warning",
            traceGroup: callSid,
            entityType: "call",
            entityId: callSid,
            callSid,
            metadata: { dial_call_status: dialCallStatus },
          });
          return new Response(
            '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup /></Response>',
            {
              headers: { ...corsHeaders, "Content-Type": "text/xml" },
              status: 200,
            },
          );
        }
      } catch (e) {
        console.error("Bot guard check failed:", e);
      }

      // ── 24/7 ANSWERING SERVICE OVERFLOW ──
      // If overflow is enabled and the call wasn't answered, route to live answering service
      // BEFORE going to voicemail.
      const digit = url.searchParams.get("Digit") || "";
      const { data: ivrCfg } = await supabase.from("ivr_config").select("*")
        .limit(1).maybeSingle();
      const overflowEnabled = ivrCfg?.answering_service_enabled === true;
      const overflowNumber = ivrCfg?.answering_service_number || "";
      const overflowOnBusy = ivrCfg?.overflow_on_busy !== false;
      const overflowOnNoAnswer = ivrCfg?.overflow_on_no_answer !== false;
      const overflowLabel = ivrCfg?.answering_service_label ||
        "Answering Service";
      const queueWaitSeconds = Math.max(
        5,
        ivrCfg?.overflow_ring_seconds_before_handoff || 15,
      );
      const queueRedirectUrl = digit
        ? `${supabaseUrl}/functions/v1/voice-ivr-handler?CallSid=${
          encodeURIComponent(callSid)
        }&From=${encodeURIComponent(from)}&ContactName=${
          encodeURIComponent(contactName)
        }&ContactType=${encodeURIComponent(contactType)}&Digit=${
          encodeURIComponent(digit)
        }&QueueRetry=1`
        : `${supabaseUrl}/functions/v1/voice-webhook?CallSid=${
          encodeURIComponent(callSid)
        }&From=${encodeURIComponent(from)}&QueueRetry=1`;

      const isBusy = dialCallStatus === "busy";
      // FAIL-SAFE: treat ANYTHING that isn't a clean "completed" answer as a missed call.
      // Twilio sometimes returns "answered" / blank / unexpected statuses when a softphone
      // briefly grabs and drops the call — those used to fall straight through to voicemail.
      // Now they overflow to the answering service first.
      const isNoAnswer = !cleanlyAnsweredDial && !isBusy;

      const shouldOverflow = overflowEnabled && overflowNumber &&
        ((isBusy && overflowOnBusy) || (isNoAnswer && overflowOnNoAnswer));

      if (!queueRetry && !shouldOverflow && (isBusy || isNoAnswer)) {
        console.log(
          `⏳ QUEUE BEFORE OVERFLOW: ${dialCallStatus} → holding caller for ${queueWaitSeconds}s before retry`,
        );
        await logSystemTrace({
          sourceType: "voice",
          sourceName: "voice-voicemail",
          eventKind: "queue_entered",
          summary: "Caller queued after unanswered dial leg",
          reason: dialCallStatus || (isBusy ? "busy" : "no_answer"),
          severity: "info",
          traceGroup: callSid,
          entityType: "call",
          entityId: callSid,
          callSid,
          metadata: {
            dial_call_status: dialCallStatus,
            queue_wait_seconds: queueWaitSeconds,
            hold_music_audio_url: ivrCfg?.hold_music_audio_url || null,
            digit: digit || null,
          },
        });
        return new Response(
          buildQueueTwiml({
            holdMusicUrl: ivrCfg?.hold_music_audio_url,
            waitSeconds: queueWaitSeconds,
            redirectUrl: queueRedirectUrl,
            reason: isBusy ? "busy" : "no_answer",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "text/xml" },
            status: 200,
          },
        );
      }

      if (shouldOverflow) {
        console.log(
          `📞 OVERFLOW: ${dialCallStatus} → routing to ${overflowLabel} at ${overflowNumber}`,
        );
        await logSystemTrace({
          sourceType: "voice",
          sourceName: "voice-voicemail",
          eventKind: "route_selected",
          summary: `Overflow to ${overflowLabel}`,
          reason: dialCallStatus || (isBusy ? "busy" : "no_answer"),
          severity: "warning",
          traceGroup: callSid,
          entityType: "call",
          entityId: callSid,
          callSid,
          metadata: {
            overflow_number: overflowNumber,
            dial_call_status: dialCallStatus,
          },
        });

        // Tag call_log so dispatchers can see this was overflow-handled
        try {
          const { data: callRow } = await supabase
            .from("call_log")
            .select("id, extracted_data")
            .eq("twilio_sid", callSid)
            .maybeSingle();
          if (callRow) {
            const existing =
              (callRow.extracted_data as Record<string, unknown>) || {};
            await supabase.from("call_log").update({
              extracted_data: {
                ...existing,
                overflow_to: overflowLabel,
                overflow_reason: dialCallStatus,
              },
            }).eq("id", callRow.id);
          }
        } catch (e) {
          console.error("Failed to tag overflow on call_log:", e);
        }

        const twilioNumber = getTwilioCallerId() || from;
        const overflowStatusCallback =
          `${supabaseUrl}/functions/v1/voice-status-callback`;
        console.log(
          `🎙️ VM-OVERFLOW TwiML generated: callback=${overflowStatusCallback}, recording=record-from-answer-dual`,
        );
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="30" answerOnBridge="true" callerId="${
            escapeXml(twilioNumber)
          }" record="record-from-answer-dual" recordingStatusCallback="${
            escapeXml(overflowStatusCallback)
          }" recordingStatusCallbackEvent="completed" statusCallback="${
            escapeXml(overflowStatusCallback)
          }" statusCallbackEvent="initiated ringing answered completed">
    <Number>${escapeXml(overflowNumber)}</Number>
  </Dial>
</Response>`,
          {
            headers: { ...corsHeaders, "Content-Type": "text/xml" },
            status: 200,
          },
        );
      }

      await logSystemTrace({
        sourceType: "voice",
        sourceName: "voice-voicemail",
        eventKind: "route_selected",
        summary: "Call sent to voicemail recording",
        reason: dialCallStatus || "no_answer",
        severity: "info",
        traceGroup: callSid,
        entityType: "call",
        entityId: callSid,
        callSid,
        metadata: { contact_name: contactName, contact_type: contactType },
      });

      // ── Per-department override SMS (only if explicitly set) ──
      // The universal missed-call SMS is now handled by voice-status-callback,
      // which fires on ALL unanswered inbound calls (not just IVR-routed ones).
      // We only send here if the department has a custom override template.
      // (digit declared earlier in this branch)
      if (digit) {
        const { data: option } = await supabase
          .from("ivr_menu_options")
          .select(
            "dept_missed_call_sms, dept_missed_call_sms_enabled, dept_missed_call_sms_template_key",
          )
          .eq("digit", digit)
          .maybeSingle();
        // Send the dept-specific message immediately so caller gets it during the VM prompt
        if (
          option?.dept_missed_call_sms_enabled !== false &&
          (option?.dept_missed_call_sms ||
            option?.dept_missed_call_sms_template_key)
        ) {
          const resolvedSms = await resolveSmsTemplateBody({
            supabase,
            templateKey: option?.dept_missed_call_sms_template_key,
            fallbackBody: option?.dept_missed_call_sms,
            extraVars: { customer_name: contactName || "" },
          });
          await sendIvrSms({
            to: from,
            body: resolvedSms.body,
            contactName: contactName || null,
            contactType,
            supabase,
            skipEmployeeFilter: allowEmployeeTestSms,
            sourceFunction: "voice-voicemail",
            templateKey: resolvedSms.templateKey,
          });
          console.log(
            `Per-dept missed-call SMS sent for digit ${digit} to ${from}`,
          );
        } else {
          console.log(
            `No dept override for digit ${digit} — universal handler will fire`,
          );
        }
      }

      // Now prompt for voicemail
      const selfUrl = `${supabaseUrl}/functions/v1/voice-voicemail?CallSid=${
        encodeURIComponent(callSid)
      }&From=${encodeURIComponent(from)}&ContactName=${
        encodeURIComponent(contactName)
      }&ContactType=${encodeURIComponent(contactType)}&Digit=${
        encodeURIComponent(digit)
      }`;

      // Look up per-department during-hours voicemail greeting
      let vmGreetingTwiml =
        `<Say voice="Polly.Joanna">Sorry we missed your call. Please leave a message after the beep and we'll get back to you as soon as possible.</Say>`;
      if (digit) {
        const { data: vmOption } = await supabase
          .from("ivr_menu_options")
          .select("dept_vm_greeting, dept_vm_audio_url")
          .eq("digit", digit)
          .maybeSingle();
        if (vmOption?.dept_vm_audio_url) {
          vmGreetingTwiml = `<Play>${
            escapeXml(vmOption.dept_vm_audio_url)
          }</Play>`;
        } else if (vmOption?.dept_vm_greeting) {
          vmGreetingTwiml = `<Say voice="Polly.Joanna">${
            escapeXml(vmOption.dept_vm_greeting)
          }</Say>`;
        }
      }

      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${vmGreetingTwiml}
  <Record maxLength="600" action="${
          escapeXml(selfUrl)
        }" recordingStatusCallback="${
          escapeXml(selfUrl)
        }" recordingStatusCallbackEvent="completed" playBeep="true" />
  <Say voice="Polly.Joanna">We didn't receive a message. Goodbye.</Say>
  <Hangup />
</Response>`,
        {
          headers: { ...corsHeaders, "Content-Type": "text/xml" },
          status: 200,
        },
      );
    }

    // ── PHASE 2: Recording completed callback ──
    if (recordingStatus === "completed" && recordingUrl) {
      const { data: callEntry } = await supabase
        .from("call_log")
        .select("id")
        .eq("twilio_sid", callSid)
        .maybeSingle();

      const transcription = await transcribeRecording(recordingUrl);

      const voicemailPayload = {
          call_log_id: callEntry?.id || null,
          phone_number: from,
          contact_name: contactName || null,
          contact_type: contactType,
          recording_url: recordingUrl,
          recording_sid: recordingSid,
          duration_seconds: recordingDuration,
          transcription: transcription || null,
        };

      if (recordingSid) {
        await supabase
          .from("voicemails")
          .upsert(voicemailPayload, { onConflict: "recording_sid", ignoreDuplicates: false });
      } else {
        await supabase.from("voicemails").insert(voicemailPayload);
      }

      if (callEntry) {
        await supabase.from("call_log").update({
          recording_url: recordingUrl,
          status: "voicemail",
          transcription: transcription || null,
        }).eq("id", callEntry.id);
      }

      console.log(
        `Voicemail saved: ${recordingSid} from ${from} (${
          contactName || "unknown"
        }), duration: ${recordingDuration}s, transcribed: ${!!transcription}`,
      );

      // ── Inject Copilot action card for voicemail ──
      try {
        const callerDisplay = contactName || from;
        const vmActions = [
          { type: "call_back", phone: from, customer_name: callerDisplay },
          { type: "send_text", phone: from, customer_name: callerDisplay },
          { type: "view_voicemail", customer_name: callerDisplay },
        ];

        // Find any active copilot session to inject the card
        const { data: sessions } = await supabase
          .from("copilot_sessions")
          .select("id, user_id")
          .is("ended_at", null)
          .order("created_at", { ascending: false })
          .limit(1);

        if (sessions?.[0]) {
          const transcriptPreview = transcription
            ? `\n> "${transcription.substring(0, 120)}${
              transcription.length > 120 ? "..." : ""
            }"`
            : "";
          await supabase.from("copilot_messages").insert({
            session_id: sessions[0].id,
            user_id: sessions[0].user_id,
            role: "assistant",
            content:
              `📩 **New voicemail from ${callerDisplay}** (${from}), ${recordingDuration}s.${transcriptPreview}\n\nWould you like to call back or send a text?`,
            metadata: { suggested_actions: vmActions },
          });
          console.log(`Voicemail action card injected for ${callerDisplay}`);
        }
      } catch (cardErr) {
        console.error("Failed to inject voicemail action card:", cardErr);
      }

      // SMS already sent in Phase 1 (no-answer handler) — no duplicate needed here.

      // ── Invoke summarize-call for AI summary + todo extraction ──
      if (callEntry?.id && transcription) {
        try {
          const sumResp = await fetch(
            `${supabaseUrl}/functions/v1/summarize-call`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({ call_id: callEntry.id }),
            },
          );
          if (!sumResp.ok) {
            console.error(
              "summarize-call failed for voicemail:",
              sumResp.status,
              await sumResp.text(),
            );
          }
        } catch (sumErr) {
          console.error(
            "Failed to invoke summarize-call for voicemail:",
            sumErr,
          );
        }
      }
    }

    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">Thank you. Goodbye.</Say><Hangup /></Response>',
      { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 },
    );
  } catch (error) {
    console.error("voice-voicemail error:", error);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup /></Response>',
      { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 },
    );
  }
});
