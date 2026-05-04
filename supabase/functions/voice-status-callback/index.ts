import { fetchRecordingWithAuth } from "../_shared/twilioRecording.ts";
import { isSmsTestNumber, recentOutboundExists, sendIvrSms } from "../_shared/smsHelper.ts";
import { resolveSmsTemplateBody } from "../_shared/smsTemplates.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { buildKeytermParams } from "../_shared/deepgramKeyterms.ts";
import { logApiUsage } from "../_shared/apiUsageLog.ts";
import { logSystemTrace } from "../_shared/systemTrace.ts";
import { validateTwilioSignature } from "../_shared/twilioSignature.ts";
import { resolveContact } from "../_shared/resolveContact.ts";
import { getDefaultBusinessUnit, normalizeE164Phone, resolveBusinessUnitByPhone } from "../_shared/businessUnits.ts";

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
  answered_by?: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  transcription: string | null;
  started_at: string | null;
  ended_at: string | null;
  twilio_sid: string;
  direction?: string;
  phone_number?: string;
  called_number?: string | null;
  business_unit_id?: string | null;
  contact_name?: string;
  contact_type?: string;
  extracted_data?: Record<string, unknown> | null;
};

function phoneLast10(phone: string | null | undefined): string {
  return String(phone || "").replace(/\D/g, "").slice(-10);
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
    const estimatedSeconds = Math.max(1, Math.round(audioBytes.byteLength / 16000));
    const deepgramCents = Math.round(estimatedSeconds * 0.0072 * 10000) / 10000;
    await logApiUsage(sb, {
      service: "deepgram",
      function_name: "voice-status-callback",
      endpoint: "listen-recording",
      estimated_cost_cents: deepgramCents,
      metadata: { seconds: estimatedSeconds },
    });
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
        "id, status, answered_by, duration_seconds, recording_url, transcription, started_at, ended_at, twilio_sid, direction, phone_number, called_number, business_unit_id, contact_name, contact_type, extracted_data",
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

async function resolveCallBusinessContext(supabase: any, callRow: any) {
  let businessUnit: any = null;
  if (callRow?.business_unit_id) {
    const { data } = await supabase
      .from("business_units")
      .select("id, primary_phone_number")
      .eq("id", callRow.business_unit_id)
      .maybeSingle();
    businessUnit = data;
  }
  if (!businessUnit) {
    businessUnit = (await resolveBusinessUnitByPhone(supabase, callRow?.called_number)) ||
      (await getDefaultBusinessUnit(supabase));
  }
  const fromNumber = normalizeE164Phone(businessUnit?.primary_phone_number || callRow?.called_number || null);
  let ivrConfigId = "";
  if (businessUnit?.id) {
    const { data: ivrConfig } = await supabase
      .from("ivr_config")
      .select("id")
      .eq("business_unit_id", businessUnit.id)
      .maybeSingle();
    ivrConfigId = ivrConfig?.id || "";
  }
  return {
    businessUnitId: businessUnit?.id || null,
    fromNumber,
    ivrConfigId,
  };
}

function normalizeClientIdentity(value: string | null | undefined): string | null {
  const raw = (value || "").trim();
  if (!raw) return null;
  return raw.replace(/^client:/i, "").trim() || null;
}

function profileIdFromClientIdentity(value: string | null | undefined): string | null {
  const identity = normalizeClientIdentity(value);
  if (!identity) return null;

  const compact = identity.replace(/^uo2_user_/i, "").replace(/^user_/i, "").trim();
  if (!compact || compact.length !== 32) return null;

  return [
    compact.slice(0, 8),
    compact.slice(8, 12),
    compact.slice(12, 16),
    compact.slice(16, 20),
    compact.slice(20),
  ].join("-");
}

async function resolveAnsweredByFromCallback(
  supabase: any,
  params: URLSearchParams,
): Promise<{ employeeName: string | null; clientIdentity: string | null }> {
  const candidates = [
    params.get("To"),
    params.get("Called"),
    params.get("ClientIdentity"),
    params.get("DialCallTo"),
  ].map(normalizeClientIdentity).filter(Boolean) as string[];

  for (const clientIdentity of candidates) {
    const profileId = profileIdFromClientIdentity(clientIdentity);
    if (!profileId) continue;

    const { data: employee, error } = await supabase
      .from("employees")
      .select("name")
      .eq("is_active", true)
      .eq("profile_id", profileId)
      .maybeSingle();

    if (error) {
      console.warn("Failed to resolve answered_by from Twilio client identity:", error);
      continue;
    }

    if (employee?.name) {
      return { employeeName: employee.name, clientIdentity };
    }
  }

  return { employeeName: null, clientIdentity: candidates[0] || null };
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

    const sigValid = await validateTwilioSignature(req, formData);
    if (!sigValid) {
      console.warn("Rejecting voice-status-callback: invalid Twilio signature");
      return new Response(JSON.stringify({ error: "Invalid Twilio signature" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // ── Idempotency guard ─────────────────────────────────────────
    // Twilio retries failed webhook deliveries, which means the same callback
    // (same CallSid + CallStatus + Duration + RecordingUrl) can land twice.
    // Without this guard, summarize-call could fire twice and the missed-call
    // SMS could send twice. We track processed callback hashes in
    // call_log.extracted_data.processed_callback_hashes (a small array kept on
    // the row itself — no extra table, no extra read on the hot path).
    if (existingRow) {
      // Compose a stable hash of the values that define a unique callback delivery.
      const callbackKeyParts = [
        callSid,
        callStatus || "",
        callDuration || "",
        recordingUrl || "",
        recordingStatus || "",
      ];
      const callbackKey = callbackKeyParts.join("|");
      // Use SubtleCrypto (Deno-supported) to derive a short stable digest.
      const encoder = new TextEncoder();
      const digestBuf = await crypto.subtle.digest("SHA-1", encoder.encode(callbackKey));
      const callbackHash = Array.from(new Uint8Array(digestBuf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 16); // 8 bytes is plenty to dedup within one call's lifetime

      const seenHashes = Array.isArray(
        ((existingRow as any).extracted_data || {}).processed_callback_hashes
      )
        ? ((existingRow as any).extracted_data.processed_callback_hashes as string[])
        : [];

      if (seenHashes.includes(callbackHash)) {
        console.log(
          `[idempotency] Duplicate callback skipped: callSid=${callSid} status=${callStatus} hash=${callbackHash}`
        );
        return new Response(JSON.stringify({ ok: true, idempotent_skip: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Record this hash NOW (before processing) so a concurrent retry hitting at the
      // same moment can't double-process. Cap the array at 20 entries to bound growth.
      const nextHashes = [...seenHashes, callbackHash].slice(-20);
      await supabase
        .from("call_log")
        .update({
          extracted_data: {
            ...((existingRow as any).extracted_data || {}),
            processed_callback_hashes: nextHashes,
            last_callback_hash_at: new Date().toISOString(),
          },
        })
        .eq("id", (existingRow as any).id);
    }

    if (!existingRow) {
      console.warn(
        `No call_log row found for callback CallSid=${callSid} ParentCallSid=${parentCallSid}`,
      );
      await logSystemTrace({
        sourceType: "voice",
        sourceName: "voice-status-callback",
        eventKind: "callback_missing_call_row",
        summary: "Twilio callback arrived before a call row could be found",
        reason: callStatus || recordingStatus || "missing_call_row",
        severity: "warning",
        traceGroup: parentCallSid || callSid,
        entityType: "call",
        entityId: parentCallSid || callSid,
        callSid,
        parentCallSid: parentCallSid || null,
        metadata: {
          raw_status: callStatus,
          recording_status: recordingStatus,
          duration_seconds: callDuration ? parseInt(callDuration, 10) : null,
          has_recording_url: Boolean(recordingUrl),
        },
      });
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
    const { employeeName: callbackAnsweredBy, clientIdentity: callbackClientIdentity } =
      await resolveAnsweredByFromCallback(supabase, params);

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

    if (callbackClientIdentity) {
      const baseExtracted = {
        ...((existingRow.extracted_data || {}) as Record<string, unknown>),
        ...(((updates.extracted_data as Record<string, unknown>) || {})),
      };
      updates.extracted_data = {
        ...baseExtracted,
        answered_client_identity: callbackClientIdentity,
      };
    }

    // Terminal-state guard: once a call has reached a terminal status (completed,
    // voicemail, no-answer, busy, failed, canceled, missed, etc.), reject any late
    // callback that would flip it back to a non-terminal status like "in-progress".
    // Twilio sometimes delivers callbacks out of order — without this guard, a slow
    // "answered" event arriving after "completed" could resurrect a closed call and
    // cause downstream weirdness (UI shows ghost active call, summarize-call refires).
    // Terminal-to-terminal transitions (e.g. completed -> voicemail) are still allowed.
    const existingIsTerminal = Boolean(existingRow.status) && TERMINAL_STATUSES.has(existingRow.status as string);
    const newIsTerminal = Boolean(effectiveStatus) && TERMINAL_STATUSES.has(effectiveStatus as string);

    if (existingIsTerminal && !newIsTerminal) {
      console.log(
        `[terminal-guard] Ignoring ${callStatus} (effective=${effectiveStatus}) ` +
        `for already-terminal call ${callSid} (existing status=${existingRow.status})`
      );
      await logSystemTrace({
        sourceType: "voice",
        sourceName: "voice-status-callback",
        eventKind: "terminal_callback_rejected",
        summary: `Late callback rejected: ${callStatus} arrived after terminal status ${existingRow.status}`,
        reason: "terminal_state_guard",
        severity: "info",
        traceGroup: parentCallSid || callSid,
        entityType: "call",
        entityId: existingRow.id,
        callSid,
        parentCallSid: parentCallSid || null,
        metadata: {
          existing_status: existingRow.status,
          incoming_status: callStatus,
          effective_status: effectiveStatus,
        },
      });
    } else if (effectiveStatus && effectiveStatus !== existingRow.status) {
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

    if (callbackAnsweredBy && !existingRow.answered_by) {
      updates.answered_by = callbackAnsweredBy;
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

      // ── Bot filter: mark 'abandoned_at_ivr' if call ended without IVR engagement ──
      // If the call is in a negative terminal state (no-answer, busy, failed, canceled)
      // AND bot_filter_status is still 'pending' (no digit was pressed), mark it as
      // 'abandoned_at_ivr' (bot signal). This prevents dead-air calls from flooding
      // the dispatcher's Intake feed and toast notifications.
      const isNegativeTerminal = NEGATIVE_TERMINAL_STATUSES.has(effectiveStatus);
      const isBotCandidate = existingRow.bot_filter_status === 'pending' || !existingRow.bot_filter_status;
      if (isNegativeTerminal && isBotCandidate) {
        updates.bot_filter_status = 'abandoned_at_ivr';
        console.log(
          `[Bot filter] Call ${existingRow.twilio_sid} marked as abandoned_at_ivr ` +
          `(status=${effectiveStatus}, no IVR digit recorded)`
        );
      }
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
        answered_by: callbackAnsweredBy || existingRow.answered_by || null,
        answered_client_identity: callbackClientIdentity,
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
        const phone = existingRow.phone_number || "";
        const resolvedCaller = phone ? await resolveContact(supabase, phone) : null;
        const callerDisplay = existingRow.contact_name ||
          resolvedCaller?.contactName ||
          existingRow.phone_number || "Unknown";
        const callerType = existingRow.contact_type || resolvedCaller?.contactType || "unknown";

        // Re-read the row in case ivr-handler or voice-amd-callback already tagged this as
        // suspected-bot. Without this, a robocall that drops to voicemail can still produce
        // a "Missed call from Unknown" action card that the dispatcher has to dismiss daily.
        const { data: freshForBotCheck } = await supabase
          .from("call_log")
          .select("status")
          .eq("id", existingRow.id)
          .maybeSingle();
        const isBotCall = (freshForBotCheck as any)?.status === "suspected-bot"
          || effectiveStatus === "suspected-bot";

        if (isBotCall) {
          console.log(`Missed call appears to be a bot (${callerDisplay}); skipping action card`);
          await logSystemTrace({
            sourceType: "voice",
            sourceName: "voice-status-callback",
            eventKind: "action_card_skipped",
            summary: "Missed-call action card skipped for suspected bot",
            reason: "suspected_bot",
            severity: "info",
            traceGroup: existingRow.twilio_sid,
            entityType: "call",
            entityId: existingRow.id,
            callSid: existingRow.twilio_sid,
            metadata: { phone_number: phone, caller_display: callerDisplay },
          });
        } else if (callerType === "employee") {
          console.log(`Missed call was from employee ${callerDisplay}; skipping customer action card`);
          await logSystemTrace({
            sourceType: "voice",
            sourceName: "voice-status-callback",
            eventKind: "action_card_skipped",
            summary: "Missed-call action card skipped for employee",
            reason: "employee_phone_number",
            severity: "info",
            traceGroup: existingRow.twilio_sid,
            entityType: "call",
            entityId: existingRow.id,
            callSid: existingRow.twilio_sid,
            metadata: { phone_number: phone, caller_display: callerDisplay },
          });
        } else {

        const { data: existingAction } = await supabase
          .from("action_items")
          .select("id")
          .eq("category", "missed_call")
          .contains("metadata", { call_id: existingRow.id })
          .limit(1)
          .maybeSingle();

        if (existingAction?.id) {
          console.log(`Missed call action already exists for ${callerDisplay}; skipping duplicate`);
        } else {

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
            source_table: "call_log",
            source_event_id: existingRow.id,
            business_unit_id: existingRow.business_unit_id || null,
            company_phone_number: existingRow.called_number || null,
            company_phone_last10: String(existingRow.called_number || "").replace(/\D/g, "").slice(-10) || null,
          },
        });
        console.log(`Missed call action_item created for ${callerDisplay}`);
        }
        }
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
            "status, phone_number, called_number, business_unit_id, contact_name, contact_type, extracted_data",
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
          const smsContext = await resolveCallBusinessContext(supabase, freshCall || existingRow);

          let deptQuery = supabase
            .from("ivr_menu_options")
            .select(
              "label, dept_no_vm_missed_call_sms, dept_no_vm_missed_call_sms_enabled, dept_missed_call_sms, dept_missed_call_sms_enabled, dept_missed_call_sms_template_key",
            )
            .eq("digit", chosenDigit)
            .eq("is_active", true);
          if (smsContext.ivrConfigId) deptQuery = deptQuery.eq("ivr_config_id", smsContext.ivrConfigId);
          const { data: deptOption } = await deptQuery.maybeSingle();

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
            const recent = await recentOutboundExists(supabase, phoneNumber, 30, {
              businessUnitId: smsContext.businessUnitId,
              fromNumber: smsContext.fromNumber,
            });
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
                sourceFunction: "voice-status-missed-call",
                templateKey: resolvedTemplate.templateKey,
                businessUnitId: smsContext.businessUnitId,
                fromNumber: smsContext.fromNumber,
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
    const smsTestNumberBypass = await isSmsTestNumber(supabase, existingRow.phone_number);
    if (
      effectiveStatus === "completed" && !isSuspectedBot && (finalDuration >= 60 || smsTestNumberBypass)
    ) {
      try {
        // Re-fetch the full call_log row to get direction, phone, contact info, ivr selection
        const { data: callRow } = await supabase
          .from("call_log")
          .select("direction, phone_number, called_number, business_unit_id, contact_type, contact_name, extracted_data")
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
          const smsContext = await resolveCallBusinessContext(supabase, callRow);

          let deptQuery = supabase
            .from("ivr_menu_options")
            .select("label, dept_post_call_sms, dept_post_call_sms_enabled")
            .eq("digit", chosenDigit)
            .eq("is_active", true);
          if (smsContext.ivrConfigId) deptQuery = deptQuery.eq("ivr_config_id", smsContext.ivrConfigId);
          const { data: deptOption } = await deptQuery.maybeSingle();

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

            // Twilio can send more than one terminal callback for the same
            // conversation. Test-number bypass should bypass safety locks,
            // not duplicate protection.
            const duplicateSince = new Date(Date.now() - 10 * 60 * 1000)
              .toISOString();
            let recentPostCallQuery = supabase
              .from("sms_log")
              .select("id, phone_number, to_number, body")
              .eq("direction", "outbound")
              .eq("source_function", "voice-status-post-call")
              .gte("created_at", duplicateSince)
              .limit(25);
            if (smsContext.businessUnitId) {
              recentPostCallQuery = recentPostCallQuery.eq(
                "business_unit_id",
                smsContext.businessUnitId,
              );
            }
            const { data: recentPostCallRows } = await recentPostCallQuery;
            const targetLast10 = phoneLast10(callRow.phone_number);
            const fromLast10 = phoneLast10(smsContext.fromNumber);
            const duplicatePostCall = (recentPostCallRows || []).some((
              row: any,
            ) =>
              phoneLast10(row.phone_number) === targetLast10 &&
              (!fromLast10 || phoneLast10(row.to_number) === fromLast10) &&
              String(row.body || "").trim() === resolvedTemplate.body.trim()
            );

            // ── 1x/day dedup: check if we already sent a post-call SMS to this number today ──
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            let sentTodayQuery = supabase
              .from("sms_log")
              .select("id", { count: "exact", head: true })
              .eq("direction", "outbound")
              .eq("phone_number", callRow.phone_number)
              .gte("created_at", todayStart.toISOString())
              .eq("source_function", "voice-status-post-call");
            if (smsContext.businessUnitId) sentTodayQuery = sentTodayQuery.eq("business_unit_id", smsContext.businessUnitId);
            const { count } = await sentTodayQuery;

            // For unknown callers, also check if ANY outbound SMS was sent in the last 60 min
            // (e.g. CSR already sent an intake link during the call)
            const isCustomer = callRow.contact_type === "customer";
            let skipIntake = false;
            if (!isCustomer && !smsTestNumberBypass) {
              const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
              let recentSmsQuery = supabase
                .from("sms_log")
                .select("id", { count: "exact", head: true })
                .eq("direction", "outbound")
                .eq("phone_number", callRow.phone_number)
                .gte("created_at", oneHourAgo);
              if (smsContext.businessUnitId) recentSmsQuery = recentSmsQuery.eq("business_unit_id", smsContext.businessUnitId);
              const { count: recentCount } = await recentSmsQuery;

              if ((recentCount || 0) > 0) {
                skipIntake = true;
                console.log(
                  `Post-call intake SMS skipped — outbound SMS already sent to ${callRow.phone_number} in last 60 min`,
                );
              }
            }

            if (duplicatePostCall) {
              console.log(
                `Post-call SMS skipped — duplicate already sent to ${callRow.phone_number} in last 10 min`,
              );
            } else if (
              smsTestNumberBypass || ((count || 0) === 0 && !skipIntake)
            ) {
              await sendIvrSms({
                to: callRow.phone_number,
                body: resolvedTemplate.body,
                contactName: callRow.contact_name,
                contactType: callRow.contact_type,
                supabase,
                skipEmployeeFilter: allowEmployeeTestSms || smsTestNumberBypass,
                sourceFunction: "voice-status-post-call",
                templateKey: resolvedTemplate.templateKey,
                businessUnitId: smsContext.businessUnitId,
                fromNumber: smsContext.fromNumber,
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
