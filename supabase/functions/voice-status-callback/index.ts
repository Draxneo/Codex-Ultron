import { fetchRecordingWithAuth } from "../_shared/twilioRecording.ts";
import { recentOutboundExists, sendIvrSms } from "../_shared/smsHelper.ts";
import { resolveSmsTemplateBody } from "../_shared/smsTemplates.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { buildKeytermParams } from "../_shared/deepgramKeyterms.ts";
import { logSystemTrace } from "../_shared/systemTrace.ts";

const NEGATIVE_TERMINAL_STATUSES = new Set([
  "no-answer",
  "busy",
  "failed",
  "canceled",
]);
const TERMINAL_STATUSES = new Set([
  "completed",
  "no-answer",
  "busy",
  "failed",
  "canceled",
  "cancelled",
  "voicemail",
  "missed",
  "missed-while-busy",
  "suspected-bot",
  "unknown",
]);

type CallRow = {
  id: string;
  status: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  transcription: string | null;
  started_at: string | null;
  ended_at: string | null;
  twilio_sid: string;
  direction?: string;
  phone_number?: string;
  contact_name?: string;
  contact_type?: string;
  extracted_data?: Record<string, unknown> | null;
};

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
    console.error("Call transcription error:", err);
    return null;
  }
}

function reconcileTranscripts(
  liveText: string | null,
  batchText: string | null,
): { best: string; source: string; live_length: number; batch_length: number } {
  const live = liveText?.trim() || "";
  const batch = batchText?.trim() || "";

  if (!live && !batch) {
    return { best: "", source: "none", live_length: 0, batch_length: 0 };
  }
  if (!live) {
    return {
      best: batch,
      source: "recording",
      live_length: 0,
      batch_length: batch.length,
    };
  }
  if (!batch) {
    return {
      best: live,
      source: "live_stream",
      live_length: live.length,
      batch_length: 0,
    };
  }

  const liveWords = live.split(/\s+/).length;
  const batchWords = batch.split(/\s+/).length;

  if (liveWords > batchWords * 1.2) {
    return {
      best: live,
      source: "live_stream",
      live_length: live.length,
      batch_length: batch.length,
    };
  }

  return {
    best: batch,
    source: "recording",
    live_length: live.length,
    batch_length: batch.length,
  };
}

async function findCallRow(
  supabase: any,
  callSid: string,
  parentCallSid: string,
): Promise<CallRow | null> {
  // Parent call is the durable conversation row. Child leg callbacks should
  // reconcile back to the parent whenever possible so one conversation does
  // not split into competing call_log records.
  for (const sid of [parentCallSid, callSid]) {
    if (!sid) continue;

    const { data, error } = await supabase
      .from("call_log")
      .select(
        "id, status, duration_seconds, recording_url, transcription, started_at, ended_at, twilio_sid, direction, phone_number, contact_name, contact_type, extracted_data",
      )
      .eq("twilio_sid", sid)
      .maybeSingle();

    if (error) {
      console.error(`Failed to lookup call row for ${sid}:`, error);
      continue;
    }

    if (data) return data as CallRow;
  }

  return null;
}

function resolveEffectiveStatus({
  callStatus,
  existingStatus,
  parsedDuration,
  recordingUrl,
  existingRecordingUrl,
  recordingStatus,
}: {
  callStatus: string;
  existingStatus: string | null;
  parsedDuration: number;
  recordingUrl: string | null;
  existingRecordingUrl: string | null;
  recordingStatus: string;
}) {
  const normalized = callStatus.toLowerCase();
  const hasAnswerEvidence = Boolean(
    parsedDuration > 0 ||
      recordingUrl ||
      existingRecordingUrl ||
      existingStatus === "in-progress" ||
      existingStatus === "completed",
  );

  if (existingStatus === "cancelled") return "canceled";
  if (existingStatus === "voicemail") return "voicemail";

  if (
    existingStatus &&
    TERMINAL_STATUSES.has(existingStatus) &&
    existingStatus !== "no-answer" &&
    existingStatus !== "busy" &&
    existingStatus !== "failed" &&
    existingStatus !== "canceled"
  ) {
    return existingStatus;
  }

  if (
    existingStatus &&
    TERMINAL_STATUSES.has(existingStatus) &&
    !hasAnswerEvidence &&
    (normalized === "initiated" || normalized === "ringing" || normalized === "answered" || normalized === "in-progress")
  ) {
    return existingStatus;
  }

  if (normalized === "answered" || normalized === "in-progress") {
    return "in-progress";
  }

  if (normalized === "completed") {
    // Twilio says "completed" but if duration=0 AND no recording AND no answered-by evidence,
    // this was actually a missed call — don't let it masquerade as a completed conversation.
    if (
      parsedDuration === 0 &&
      !recordingUrl &&
      !existingRecordingUrl &&
      existingStatus !== "in-progress" &&
      existingStatus !== "completed" &&
      existingStatus !== "voicemail"
    ) {
      return "no-answer";
    }
    return "completed";
  }

  if (NEGATIVE_TERMINAL_STATUSES.has(normalized)) {
    return hasAnswerEvidence ? "completed" : normalized;
  }

  if (
    !normalized && recordingStatus === "completed" &&
    (recordingUrl || existingRecordingUrl)
  ) {
    return "completed";
  }

  return existingStatus || normalized || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.text();
    const params = new URLSearchParams(formData);

    const callSid = params.get("CallSid") || "";
    const parentCallSid = params.get("ParentCallSid") || "";
    const callStatus = params.get("CallStatus") || "";
    const callDuration = params.get("CallDuration");
    const recordingUrl = params.get("RecordingUrl");
    const recordingStatus = params.get("RecordingStatus") || "";

    if (!callSid) {
      return new Response(JSON.stringify({ error: "Missing CallSid" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getSupabaseAdmin();
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const existingRow = await findCallRow(supabase, callSid, parentCallSid);
    if (!existingRow) {
      console.warn(
        `No call_log row found for callback CallSid=${callSid} ParentCallSid=${parentCallSid}`,
      );
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsedDuration = callDuration ? parseInt(callDuration, 10) : 0;
    const mergedRecordingUrl = recordingUrl || existingRow.recording_url ||
      null;
    const effectiveStatus = resolveEffectiveStatus({
      callStatus,
      existingStatus: existingRow.status,
      parsedDuration,
      recordingUrl,
      existingRecordingUrl: existingRow.recording_url,
      recordingStatus,
    });

    const updates: Record<string, unknown> = {};
    const callbackIsChildLeg = Boolean(parentCallSid && callSid && existingRow.twilio_sid === parentCallSid);

    if (callbackIsChildLeg) {
      const extracted = (existingRow.extracted_data || {}) as Record<string, unknown>;
      const existingChildren = Array.isArray((extracted as any).child_call_sids)
        ? ((extracted as any).child_call_sids as string[])
        : [];
      if (!existingChildren.includes(callSid)) {
        updates.extracted_data = {
          ...extracted,
          child_call_sids: [...existingChildren, callSid],
          latest_child_call_sid: callSid,
        };
      }
    }

    if (effectiveStatus && effectiveStatus !== existingRow.status) {
      updates.status = effectiveStatus;
    }

    if (
      mergedRecordingUrl && mergedRecordingUrl !== existingRow.recording_url
    ) {
      updates.recording_url = mergedRecordingUrl;
    }

    if (parsedDuration > 0 && parsedDuration !== existingRow.duration_seconds) {
      updates.duration_seconds = parsedDuration;
    }

    if (effectiveStatus === "in-progress" && !existingRow.started_at) {
      updates.started_at = new Date().toISOString();
    }

    if (
      effectiveStatus && TERMINAL_STATUSES.has(effectiveStatus) &&
      !existingRow.ended_at
    ) {
      updates.ended_at = new Date().toISOString();
    }

    if (effectiveStatus && TERMINAL_STATUSES.has(effectiveStatus)) {
      const baseExtracted = {
        ...((existingRow.extracted_data || {}) as Record<string, unknown>),
        ...(((updates.extracted_data as Record<string, unknown>) || {})),
      };
      const pendingEndedBy = typeof (baseExtracted as any).pending_ended_by === "string"
        ? String((baseExtracted as any).pending_ended_by)
        : null;
      updates.extracted_data = {
        ...baseExtracted,
        ended_by: pendingEndedBy === "agent" ? "agent" : (baseExtracted as any).ended_by || "unknown",
        terminal_reason: effectiveStatus,
      };
    }

    if (effectiveStatus === "completed") {
      const { data: liveRows } = await supabase
        .from("live_transcripts")
        .select("text")
        .eq("twilio_sid", existingRow.twilio_sid)
        .eq("is_final", true)
        .order("created_at", { ascending: true });

      const liveText = (liveRows || []).map((r: any) =>
        r.text
      ).join(" ").trim() || null;
      let batchText: string | null = null;

      if (mergedRecordingUrl) {
        batchText = await transcribeRecording(mergedRecordingUrl);
      }

      const result = reconcileTranscripts(liveText, batchText);
      if (result.best && result.best !== existingRow.transcription) {
        updates.transcription = result.best;
      }

      if ((liveRows || []).length > 0) {
        await supabase
          .from("live_transcripts")
          .delete()
          .eq("twilio_sid", existingRow.twilio_sid);
      }

      console.log(
        `Call ${existingRow.twilio_sid} transcript reconciled → source=${result.source} live=${result.live_length} batch=${result.batch_length}`,
      );
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from("call_log")
        .update(updates)
        .eq("id", existingRow.id);

      if (error) {
        console.error("Failed to update call_log:", error);
      }
    }

    if (
      (effectiveStatus === "completed" || effectiveStatus === "voicemail") &&
      (updates.transcription || existingRow.transcription)
    ) {
      // Dedup: skip if summarize-call was already triggered (e.g. by voice-voicemail)
      const { data: freshRow } = await supabase
        .from("call_log")
        .select("ai_summary")
        .eq("id", existingRow.id)
        .maybeSingle();

      if (!freshRow?.ai_summary) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/summarize-call`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({ call_id: existingRow.id }),
          });
        } catch (sumErr) {
          console.error("Failed to invoke summarize-call:", sumErr);
        }
      }
    }

    console.log(
      `Voice status callback reconciled: row=${existingRow.twilio_sid}, callSid=${callSid}, parent=${
        parentCallSid || "none"
      }, raw=${callStatus || "none"}, effective=${
        effectiveStatus || existingRow.status || "unchanged"
      }, duration=${parsedDuration}, recording=${
        mergedRecordingUrl ? "yes" : "no"
      }`,
    );

    await logSystemTrace({
      sourceType: "voice",
      sourceName: "voice-status-callback",
      eventKind: "status_reconciled",
      summary: `Call status reconciled to ${
        effectiveStatus || existingRow.status || "unknown"
      }`,
      reason: callStatus || recordingStatus || "none",
      severity:
        ["no-answer", "busy", "failed", "canceled", "voicemail"].includes(
            effectiveStatus || "",
          )
          ? "warning"
          : "info",
      traceGroup: existingRow.twilio_sid,
      entityType: "call",
      entityId: existingRow.id,
      callSid,
      parentCallSid: parentCallSid || null,
      metadata: {
        row_twilio_sid: existingRow.twilio_sid,
        raw_status: callStatus,
        effective_status: effectiveStatus,
        duration_seconds: parsedDuration,
        recording_url: mergedRecordingUrl,
      },
    });

    // ── Push + action card + UNIVERSAL missed-call SMS ──
    // Includes "voicemail" so callers who left a message ALSO get the
    // "sorry we missed you" SMS — they were still a missed live call.
    if (
      existingRow.direction === "inbound" &&
      effectiveStatus &&
      ["no-answer", "busy", "failed", "canceled", "voicemail"].includes(
        effectiveStatus,
      )
    ) {
      try {
        const { data: tokens } = await supabase.from("push_tokens").select(
          "user_id",
        );
        const uniqueUserIds = [
          ...new Set((tokens || []).map((t: any) => t.user_id)),
        ];
        const caller = existingRow.contact_name || existingRow.phone_number ||
          "Unknown";
        for (const uid of uniqueUserIds) {
          fetch(`${supabaseUrl}/functions/v1/send-push`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              user_id: uid,
              title: `📞 Missed call from ${caller}`,
              body: "Tap to view in call log",
              data: { type: "call" },
            }),
          }).catch((e) => console.error("[Push] Call push failed:", e));
        }
      } catch (pushErr) {
        console.error("[Push] Call push error:", pushErr);
      }

      // ── Inject missed call action card into Copilot ──
      try {
        const callerDisplay = existingRow.contact_name ||
          existingRow.phone_number || "Unknown";
        const phone = existingRow.phone_number || "";

        const { data: sessions } = await supabase
          .from("copilot_sessions")
          .select("id, user_id")
          .is("ended_at", null)
          .order("created_at", { ascending: false })
          .limit(1);

        if (sessions?.[0]) {
          const suggestedActions = [
            { type: "call_back", phone, customer_name: callerDisplay },
            { type: "send_text", phone, customer_name: callerDisplay },
          ];
          await supabase.from("copilot_messages").insert({
            session_id: sessions[0].id,
            user_id: sessions[0].user_id,
            role: "assistant",
            content:
              `📞 **Missed call from ${callerDisplay}** (${phone}). Would you like to call back or send a text?`,
            metadata: { suggested_actions: suggestedActions },
          });
          console.log(`Missed call action card injected for ${callerDisplay}`);
        }

        await supabase.from("action_items").insert({
          title: `Missed call from ${callerDisplay}`,
          description:
            `${callerDisplay} called but no one answered. Follow up needed.`,
          category: "missed_call",
          priority: "high",
          source: "jarvis",
          status: "pending",
          customer_phone: phone || null,
          suggested_action: `Call back ${callerDisplay} or send a text`,
          metadata: {
            phone,
            customer_name: existingRow.contact_name || null,
            call_id: existingRow.id,
          },
        });
        console.log(`Missed call action_item created for ${callerDisplay}`);
      } catch (mcErr) {
        console.error("Missed call action card error:", mcErr);
      }

      // ── UNIVERSAL MISSED-CALL SMS ──
      // Fires for every unanswered inbound call (IVR-routed OR direct dial).
      // Skips: suspected-bot, overflow-handled, recent SMS, master toggle off.
      try {
        const { data: freshCall } = await supabase
          .from("call_log")
          .select(
            "status, phone_number, contact_name, contact_type, extracted_data",
          )
          .eq("id", existingRow.id)
          .maybeSingle();

        const isBot = freshCall?.status === "suspected-bot";
        const wasOverflowed = !!(freshCall?.extracted_data as any)?.overflow_to;
        const phoneNumber = freshCall?.phone_number ||
          existingRow.phone_number || "";

        if (isBot) {
          console.log(
            `[Missed-call SMS] Skipped — suspected bot (${phoneNumber})`,
          );
          await logSystemTrace({
            sourceType: "voice",
            sourceName: "voice-status-callback",
            eventKind: "sms_skipped",
            summary: "Missed-call SMS skipped",
            reason: "suspected_bot",
            severity: "info",
            traceGroup: existingRow.twilio_sid,
            entityType: "call",
            entityId: existingRow.id,
            callSid: existingRow.twilio_sid,
            metadata: { phone_number: phoneNumber },
          });
        } else if (wasOverflowed) {
          console.log(
            `[Missed-call SMS] Skipped — answering service handled it (${phoneNumber})`,
          );
          await logSystemTrace({
            sourceType: "voice",
            sourceName: "voice-status-callback",
            eventKind: "sms_skipped",
            summary: "Missed-call SMS skipped",
            reason: "answering_service_handled",
            severity: "info",
            traceGroup: existingRow.twilio_sid,
            entityType: "call",
            entityId: existingRow.id,
            callSid: existingRow.twilio_sid,
            metadata: { phone_number: phoneNumber },
          });
        } else if (!phoneNumber) {
          console.log(`[Missed-call SMS] Skipped — no phone number on record`);
        } else {
          // ── SINGLE SOURCE OF TRUTH ──
          // Pull missed-call SMS body from the IVR canvas (ivr_menu_options),
          // keyed off the dept the caller chose. Falls back to digit "1"
          // (first dept) if the call was a direct dial that never hit IVR.
          const extracted = (freshCall?.extracted_data as any) || {};
          const chosenDigit = extracted.ivr_digit ? String(extracted.ivr_digit) : "1";

          const { data: deptOption } = await supabase
            .from("ivr_menu_options")
            .select(
              "label, dept_no_vm_missed_call_sms, dept_no_vm_missed_call_sms_enabled, dept_missed_call_sms, dept_missed_call_sms_enabled, dept_missed_call_sms_template_key",
            )
            .eq("digit", chosenDigit)
            .eq("is_active", true)
            .maybeSingle();

          const { data: testModeRow } = await supabase
            .from("company_settings")
            .select("value")
            .eq("key", "sms_test_mode")
            .maybeSingle();
          const allowEmployeeTestSms = (testModeRow as any)?.value === "true";

          const enabled = deptOption?.dept_no_vm_missed_call_sms_enabled !== false;
          const fallbackBody = (deptOption?.dept_no_vm_missed_call_sms || deptOption?.dept_missed_call_sms || "").trim();

          if (!enabled) {
            console.log(`[Missed-call SMS] Disabled for dept "${deptOption?.label || chosenDigit}" — skipping`);
          } else if (!fallbackBody) {
            console.log(`[Missed-call SMS] No body configured for dept "${deptOption?.label || chosenDigit}" — skipping`);
          } else {
            const recent = await recentOutboundExists(supabase, phoneNumber, 30);
            if (recent) {
              console.log(
                `[Missed-call SMS] Skipped — outbound SMS already sent to ${phoneNumber} in last 30min`,
              );
            } else {
              const resolvedTemplate = await resolveSmsTemplateBody({
                supabase,
                templateKey: deptOption?.dept_missed_call_sms_template_key,
                fallbackBody,
                extraVars: { customer_name: freshCall?.contact_name || "" },
              });

              await sendIvrSms({
                to: phoneNumber,
                body: resolvedTemplate.body,
                contactName: freshCall?.contact_name || null,
                contactType: freshCall?.contact_type || "unknown",
                supabase,
                skipEmployeeFilter: allowEmployeeTestSms,
                sourceFunction: "voice-status-callback",
                templateKey: resolvedTemplate.templateKey,
              });
              console.log(
                `[Missed-call SMS] Sent IVR-canvas body for dept "${deptOption?.label || chosenDigit}" to ${phoneNumber}`,
              );
              await logSystemTrace({
                sourceType: "voice",
                sourceName: "voice-status-callback",
                eventKind: "sms_sent",
                summary: `Missed-call SMS sent to ${phoneNumber}`,
                reason: "ivr_canvas_per_dept",
                severity: "info",
                traceGroup: existingRow.twilio_sid,
                entityType: "call",
                entityId: existingRow.id,
                callSid: existingRow.twilio_sid,
                metadata: {
                  phone_number: phoneNumber,
                  ivr_digit: chosenDigit,
                  ivr_department: deptOption?.label || null,
                  template_key: resolvedTemplate.templateKey || null,
                },
              });
            }
          }
        }
      } catch (smsErr) {
        console.error("[Missed-call SMS] Error:", smsErr);
      }
    }

    // ── Post-Call Auto SMS (inbound completed calls only, skip bots) ──
    // Re-check current status — ivr-handler may have tagged it as suspected-bot
    const { data: currentRow } = await supabase
      .from("call_log")
      .select("status")
      .eq("id", existingRow.id)
      .single();
    const isSuspectedBot = currentRow?.status === "suspected-bot";

    const finalDuration = parsedDuration || existingRow.duration_seconds || 0;
    if (
      effectiveStatus === "completed" && !isSuspectedBot && finalDuration >= 60
    ) {
      try {
        // Re-fetch the full call_log row to get direction, phone, contact info, ivr selection
        const { data: callRow } = await supabase
          .from("call_log")
          .select("direction, phone_number, contact_type, contact_name, extracted_data")
          .eq("id", existingRow.id)
          .single();

        if (
          callRow && callRow.direction === "inbound" && callRow.phone_number
        ) {
          // ── SINGLE SOURCE OF TRUTH ──
          // Pull post-call thank-you SMS from the IVR canvas, scoped to the dept
          // the caller picked. If they never made an IVR selection (direct dial),
          // fall back to digit "1" (first dept).
          const extracted = (callRow.extracted_data as any) || {};
          const chosenDigit = extracted.ivr_digit ? String(extracted.ivr_digit) : "1";

          const { data: deptOption } = await supabase
            .from("ivr_menu_options")
            .select("label, dept_post_call_sms, dept_post_call_sms_enabled")
            .eq("digit", chosenDigit)
            .eq("is_active", true)
            .maybeSingle();

          const { data: testModeRow } = await supabase
            .from("company_settings")
            .select("value")
            .eq("key", "sms_test_mode")
            .maybeSingle();
          const allowEmployeeTestSms = (testModeRow as any)?.value === "true";

          const enabled = deptOption?.dept_post_call_sms_enabled === true;
          const body = (deptOption?.dept_post_call_sms || "").trim();

          if (!enabled) {
            console.log(`[Post-call SMS] Disabled for dept "${deptOption?.label || chosenDigit}" — skipping`);
          } else if (!body) {
            console.log(`[Post-call SMS] No body configured for dept "${deptOption?.label || chosenDigit}" — skipping`);
          } else {
            const resolvedTemplate = await resolveSmsTemplateBody({
              supabase,
              templateKey: null,
              fallbackBody: body,
              extraVars: { customer_name: callRow.contact_name || "" },
            });

            // ── 1x/day dedup: check if we already sent a post-call SMS to this number today ──
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const { count } = await supabase
              .from("sms_log")
              .select("id", { count: "exact", head: true })
              .eq("direction", "outbound")
              .eq("phone_number", callRow.phone_number)
              .gte("created_at", todayStart.toISOString())
              .like("body", "%post-call%");

            // For unknown callers, also check if ANY outbound SMS was sent in the last 60 min
            // (e.g. CSR already sent an intake link during the call)
            const isCustomer = callRow.contact_type === "customer";
            let skipIntake = false;
            if (!isCustomer) {
              const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
              const { count: recentCount } = await supabase
                .from("sms_log")
                .select("id", { count: "exact", head: true })
                .eq("direction", "outbound")
                .eq("phone_number", callRow.phone_number)
                .gte("created_at", oneHourAgo);

              if ((recentCount || 0) > 0) {
                skipIntake = true;
                console.log(
                  `Post-call intake SMS skipped — outbound SMS already sent to ${callRow.phone_number} in last 60 min`,
                );
              }
            }

            if ((count || 0) === 0 && !skipIntake) {
              // Tag the SMS body so we can dedup (invisible to customer, stripped by carrier)
              const taggedBody = resolvedTemplate.body + "\n\n[post-call]";
              await sendIvrSms({
                to: callRow.phone_number,
                body: taggedBody,
                contactName: callRow.contact_name,
                contactType: callRow.contact_type,
                supabase,
                skipEmployeeFilter: allowEmployeeTestSms,
                sourceFunction: "voice-status-callback",
                templateKey: resolvedTemplate.templateKey,
              });
              console.log(
                `Post-call SMS sent IVR-canvas body for dept "${deptOption?.label || chosenDigit}" to ${callRow.phone_number}`,
              );
            } else {
              console.log(
                `Post-call SMS skipped — already sent to ${callRow.phone_number} today`,
              );
            }
          }
        }
      } catch (pcErr) {
        console.error("Post-call auto SMS error:", pcErr);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Voice status callback error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
