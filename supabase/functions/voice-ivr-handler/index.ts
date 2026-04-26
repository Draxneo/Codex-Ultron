import { getCentralNow } from "../_shared/formatters.ts";
import { sendIvrSms } from "../_shared/smsHelper.ts";
import { resolveSmsTemplateBody } from "../_shared/smsTemplates.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  buildDepartmentDialList,
  buildClientTags,
  fallbackRoutingDepartmentsForIvrOption,
  isUserBusy,
  resolveIvrRoutingDepartmentKey,
} from "../_shared/callRouting.ts";
import { logSystemTrace } from "../_shared/systemTrace.ts";

type IvrRoutingOption = {
  label?: string | null;
  routing_department_key?: string | null;
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildQueueTwiml({
  holdMusicUrl,
  waitSeconds,
  redirectUrl,
}: {
  holdMusicUrl: string | null | undefined;
  waitSeconds: number;
  redirectUrl: string;
}): string {
  const safeWait = Math.max(5, waitSeconds);
  const holdPrompt = holdMusicUrl
    ? `<Play loop="${Math.max(1, Math.ceil(safeWait / 5))}">${escapeXml(holdMusicUrl)}</Play>`
    : `<Say voice="Polly.Joanna">All team members are helping other callers. Please stay on the line while we hold your place in queue.</Say><Pause length="${safeWait}"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${holdPrompt}
  <Redirect method="POST">${escapeXml(redirectUrl)}</Redirect>
</Response>`;
}

function isWithinHours(hoursStart: string, hoursEnd: string, businessDays: number[]): boolean {
  try {
    const c = getCentralNow();
    const hour = c.getUTCHours();
    const minute = c.getUTCMinutes();
    const currentDay = c.getUTCDay();
    if (!businessDays.includes(currentDay)) return false;
    const [startH, startM] = hoursStart.split(":").map(Number);
    const [endH, endM] = hoursEnd.split(":").map(Number);
    const currentMinutes = hour * 60 + minute;
    return currentMinutes >= startH * 60 + startM && currentMinutes < endH * 60 + endM;
  } catch {
    return true;
  }
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Build a human-readable hours string from department config */
function buildHoursString(option: any): string {
  if (!option?.dept_hours_start || !option?.dept_hours_end || !option?.dept_business_days) return "";
  const days: number[] = option.dept_business_days;
  if (days.length === 0) return "";

  function fmt(t: string): string {
    const [h, m] = t.split(":").map(Number);
    const period = h >= 12 ? "pm" : "am";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
  }

  const weekdays = days.filter(d => d >= 1 && d <= 5).sort();
  const parts: string[] = [];

  if (weekdays.length > 0) {
    const first = DAY_NAMES[weekdays[0]];
    const last = DAY_NAMES[weekdays[weekdays.length - 1]];
    const range = weekdays.length === 1 ? first : `${first}–${last}`;
    parts.push(`${range} ${fmt(option.dept_hours_start)}–${fmt(option.dept_hours_end)}`);
  }

  if (days.includes(6)) {
    const satStart = option.dept_sat_hours_start || option.dept_hours_start;
    const satEnd = option.dept_sat_hours_end || option.dept_hours_end;
    parts.push(`Sat ${fmt(satStart)}–${fmt(satEnd)}`);
  }

  if (days.includes(0)) {
    parts.push(`Sun ${fmt(option.dept_hours_start)}–${fmt(option.dept_hours_end)}`);
  }

  return parts.join(", ");
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
    const queueRetry = url.searchParams.get("QueueRetry") === "1";

    const formData = await req.text();
    const params = new URLSearchParams(formData);
    const digit = params.get("Digits") || url.searchParams.get("Digit") || "";
    const attemptParam = url.searchParams.get("Attempt") || "";

            const supabase = getSupabaseAdmin();
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";

    // ── Bot detection: no digit pressed after all IVR attempts ──
    if (!digit && parseInt(attemptParam) >= 3 && contactType !== "employee") {
      console.log(`IVR handler: no input after ${attemptParam} attempts, tagging as suspected-bot. CallSid=${callSid}`);
      await logSystemTrace({
        sourceType: "voice",
        sourceName: "voice-ivr-handler",
        eventKind: "route_decision",
        summary: `Call tagged as suspected bot after ${attemptParam} IVR attempts`,
        reason: "no_ivr_input",
        severity: "warning",
        traceGroup: callSid,
        entityType: "call",
        entityId: callSid,
        callSid,
        metadata: { attempt: parseInt(attemptParam), from, contact_name: contactName, contact_type: contactType },
      });
      await supabase
        .from("call_log")
        .update({ status: "suspected-bot" })
        .eq("twilio_sid", callSid);
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>\n<Response><Hangup/></Response>`,
        { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
      );
    }

    // Load config + menu option for this digit
    const { data: ivrConfig } = await supabase.from("ivr_config").select("*").limit(1).maybeSingle();
    const config = ivrConfig || {
      voicemail_greeting: "Please leave a message after the tone.",
      voicemail_audio_url: null,
      after_hours_greeting: "Thank you for calling. We are currently closed. Please leave a message after the tone.",
      after_hours_audio_url: null,
      voicemail_enabled: true,
      ring_timeout_seconds: 25,
      after_hours_caller_id_mode: "company",
      answering_service_enabled: false,
      answering_service_number: null,
      answering_service_label: "Answering Service",
      overflow_on_busy: true,
      overflow_on_no_answer: true,
      overflow_after_hours: true,
      overflow_ring_seconds_before_handoff: 20,
      overflow_after_hours_skip_voicemail: true,
    };

    // ── Overflow helpers ──
    const overflowEnabled = (config as any).answering_service_enabled === true;
    const overflowNumber = (config as any).answering_service_number || "";
    const overflowAfterHours = (config as any).overflow_after_hours !== false;
    const overflowSkipVm = (config as any).overflow_after_hours_skip_voicemail !== false;
    const overflowReadyForAh = overflowEnabled && overflowNumber && overflowAfterHours;
    const dialTimeout = config.ring_timeout_seconds || 25;
    const queueWaitSeconds = (config as any).overflow_ring_seconds_before_handoff || dialTimeout;

    function overflowDialTwiml(reason: string): string {
      const callerId = Deno.env.get("TWILIO_PHONE_NUMBER") || from;
      const overflowStatusCallback = `${supabaseUrl}/functions/v1/voice-status-callback`;
      console.log(`🎙️ OVERFLOW TwiML generated: reason=${reason}, callback=${overflowStatusCallback}, recording=record-from-answer-dual`);
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="30" timeLimit="3600" hangupOnStar="true" callerId="${escapeXml(callerId)}" record="record-from-answer-dual" recordingStatusCallback="${escapeXml(overflowStatusCallback)}" recordingStatusCallbackEvent="completed" statusCallback="${escapeXml(overflowStatusCallback)}" statusCallbackEvent="initiated ringing answered completed">
    <Number>${escapeXml(overflowNumber)}</Number>
  </Dial>
</Response>`;
    }

    const { data: option } = await supabase
      .from("ivr_menu_options")
      .select("*")
      .eq("digit", digit)
      .eq("is_active", true)
      .maybeSingle();

    // ── Live transcription stream ──
    const { data: liveTransRow } = await supabase
      .from("company_settings")
      .select("value")
      .eq("key", "live_transcription_enabled")
      .maybeSingle();
    const liveTranscribeEnabled = liveTransRow?.value === "true";
    const streamTwiml = liveTranscribeEnabled
      ? `<Start><Stream url="wss://${supabaseUrl.replace("https://", "")}/functions/v1/live-transcribe" track="both_tracks" /></Start>`
      : "";

    const voicemailUrl = `${supabaseUrl}/functions/v1/voice-voicemail?CallSid=${encodeURIComponent(callSid)}&From=${encodeURIComponent(from)}&ContactName=${encodeURIComponent(contactName)}&ContactType=${encodeURIComponent(contactType)}&Digit=${encodeURIComponent(digit)}`;
    const statusCallbackUrl = `${supabaseUrl}/functions/v1/voice-status-callback`;
    const queueRedirectUrl = `${supabaseUrl}/functions/v1/voice-ivr-handler?CallSid=${encodeURIComponent(callSid)}&From=${encodeURIComponent(from)}&ContactName=${encodeURIComponent(contactName)}&ContactType=${encodeURIComponent(contactType)}&Digit=${encodeURIComponent(digit)}&QueueRetry=1`;

    const vmGreeting = config.voicemail_audio_url
      ? `<Play>${escapeXml(config.voicemail_audio_url)}</Play>`
      : `<Say voice="Polly.Joanna">${escapeXml(config.voicemail_greeting)}</Say>`;

    const afterHoursGreeting = config.after_hours_audio_url
      ? `<Play>${escapeXml(config.after_hours_audio_url)}</Play>`
      : `<Say voice="Polly.Joanna">${escapeXml(config.after_hours_greeting)}</Say>`;

    if (!option) {
      console.log(`IVR handler: invalid digit "${digit}"`);
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">That is not a valid option.</Say>
  ${config.voicemail_enabled ? `
  ${vmGreeting}
  <Record maxLength="600" action="${escapeXml(voicemailUrl)}" recordingStatusCallback="${escapeXml(voicemailUrl)}" recordingStatusCallbackEvent="completed" playBeep="true" />
  ` : '<Hangup />'}
</Response>`,
        { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
      );
    }

    // ── Department hours check ──
    const routingOption = option as IvrRoutingOption;
    const deptKey = resolveIvrRoutingDepartmentKey(routingOption);
    const fallbackDepartmentKeys = fallbackRoutingDepartmentsForIvrOption(routingOption);

    if (option.dept_hours_start && option.dept_hours_end && option.dept_business_days) {
      const c = getCentralNow();
      const currentDay = c.getUTCDay();
      let deptOpen: boolean;

      if (currentDay === 6 && option.dept_sat_hours_start && option.dept_sat_hours_end) {
        deptOpen = isWithinHours(option.dept_sat_hours_start, option.dept_sat_hours_end, [6]);
      } else {
        deptOpen = isWithinHours(option.dept_hours_start, option.dept_hours_end, option.dept_business_days);
      }

      if (!deptOpen) {
        console.log(`IVR handler: department "${option.label}" (digit ${digit}) is closed — after-hours flow`);

        // ── 24/7 OVERFLOW: skip voicemail, send STRAIGHT to live answering service ──
        // We respond with TwiML FIRST (so the caller hears the answering service ring
        // immediately), and fire SMS / logging / DB updates in the background. Awaiting
        // those before returning was adding 1-3s of dead air on top of the AS ring time.
        if (overflowReadyForAh && overflowSkipVm) {
          console.log(`📞 OVERFLOW (after-hours): dept "${option.label}" → ${overflowNumber} (immediate dial)`);

          // Background: trace + SMS + call_log enrichment (do not await)
          const bgTasks = (async () => {
            try {
              await logSystemTrace({
                sourceType: "voice",
                sourceName: "voice-ivr-handler",
                eventKind: "route_decision",
                summary: `Department ${option.label} is closed`,
                reason: "after_hours",
                severity: "info",
                traceGroup: callSid,
                entityType: "call",
                entityId: callSid,
                callSid,
                metadata: { digit, department: option.label },
              });
              await logSystemTrace({
                sourceType: "voice",
                sourceName: "voice-ivr-handler",
                eventKind: "route_selected",
                summary: `After-hours overflow to ${(config as any).answering_service_label || "Answering Service"}`,
                reason: "after_hours",
                severity: "warning",
                traceGroup: callSid,
                entityType: "call",
                entityId: callSid,
                callSid,
                metadata: { digit, department: option.label, overflow_number: overflowNumber },
              });
              const { data: callRow } = await supabase
                .from("call_log").select("id, extracted_data").eq("twilio_sid", callSid).maybeSingle();
              if (callRow) {
                const existing = (callRow.extracted_data as Record<string, unknown>) || {};
                await supabase.from("call_log").update({
                  extracted_data: { ...existing, overflow_to: (config as any).answering_service_label || "Answering Service", overflow_reason: "after_hours" },
                }).eq("id", callRow.id);
              }
              if (option.dept_after_hours_sms_enabled !== false) {
                const hoursStr = buildHoursString(option);
                const resolvedSms = await resolveSmsTemplateBody({
                  supabase,
                  templateKey: option.dept_after_hours_sms_template_key,
                  fallbackBody: option.dept_after_hours_sms || "Hi! Thanks for reaching out. We're outside normal hours, but we do monitor texts after hours and will get back to you as soon as we can.",
                  extraVars: {
                    hours: hoursStr || "our normal business hours",
                    customer_name: contactName || "",
                  },
                });
                await sendIvrSms({
                  to: from,
                  body: resolvedSms.body,
                  contactName: contactName || null,
                  contactType,
                  supabase,
                  skipEmployeeFilter: true,
                  sourceFunction: "voice-ivr-handler",
                  templateKey: resolvedSms.templateKey,
                });
              }
            } catch (bgErr) {
              console.error("after-hours overflow background task error:", bgErr);
            }
          })();
          // EdgeRuntime keeps the worker alive long enough for background tasks
          try { (globalThis as any).EdgeRuntime?.waitUntil?.(bgTasks); } catch {}

          return new Response(
            overflowDialTwiml("after_hours"),
            { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
          );
        }

        // ── No overflow configured → fall back to legacy after-hours SMS + voicemail flow ──
        await logSystemTrace({
          sourceType: "voice",
          sourceName: "voice-ivr-handler",
          eventKind: "route_decision",
          summary: `Department ${option.label} is closed`,
          reason: "after_hours",
          severity: "info",
          traceGroup: callSid,
          entityType: "call",
          entityId: callSid,
          callSid,
          metadata: { digit, department: option.label },
        });

        if (option.dept_after_hours_sms_enabled !== false) {
          const hoursStr = buildHoursString(option);
          const resolvedSms = await resolveSmsTemplateBody({
            supabase,
            templateKey: option.dept_after_hours_sms_template_key,
            fallbackBody: option.dept_after_hours_sms || "Hi! Thanks for reaching out. We're outside normal hours, but we do monitor texts after hours and will get back to you as soon as we can.",
            extraVars: {
              hours: hoursStr || "our normal business hours",
              customer_name: contactName || "",
            },
          });

          await sendIvrSms({
            to: from,
            body: resolvedSms.body,
            contactName: contactName || null,
            contactType,
            supabase,
            skipEmployeeFilter: true,
            sourceFunction: "voice-ivr-handler",
            templateKey: resolvedSms.templateKey,
          });
        } else {
          console.log(`After-hours SMS disabled for dept "${option.label}" — skipping`);
        }

        const deptGreeting = option.dept_after_hours_audio_url
          ? `<Play>${escapeXml(option.dept_after_hours_audio_url)}</Play>`
          : option.dept_after_hours_greeting
          ? `<Say voice="Polly.Joanna">${escapeXml(option.dept_after_hours_greeting)}</Say>`
          : afterHoursGreeting;

        if (config.voicemail_enabled) {
          return new Response(
            `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${deptGreeting}
  <Record maxLength="600" action="${escapeXml(voicemailUrl)}" recordingStatusCallback="${escapeXml(voicemailUrl)}" recordingStatusCallbackEvent="completed" playBeep="true" />
</Response>`,
            { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
          );
        }
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${deptGreeting}
  <Hangup />
</Response>`,
          { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
        );
      }
    }

    console.log(`IVR handler: digit ${digit} → ${option.action_type} → ${option.forward_to}`);
    await logSystemTrace({
      sourceType: "voice",
      sourceName: "voice-ivr-handler",
      eventKind: "ivr_selection",
      summary: `Caller pressed ${digit} for ${option.label}`,
      reason: option.action_type,
      severity: "info",
      traceGroup: callSid,
      entityType: "call",
      entityId: callSid,
      callSid,
      metadata: { digit, label: option.label, action_type: option.action_type, forward_to: option.forward_to },
    });

    // Store the department selection on the call_log so the UI can display it
    try {
      const { data: callRow } = await supabase
        .from("call_log")
        .select("id, extracted_data")
        .eq("twilio_sid", callSid)
        .maybeSingle();
      if (callRow) {
        const existing = (callRow.extracted_data as Record<string, unknown>) || {};
        await supabase.from("call_log").update({
          // ivr_digit lets voice-status-callback look up the per-dept SMS body
          // (the IVR canvas is now the single source of truth for after-call SMS)
          extracted_data: { ...existing, ivr_department: option.label, ivr_department_key: deptKey, ivr_digit: digit },
        }).eq("id", callRow.id);
      }
    } catch (e) { console.error("Failed to store IVR department:", e); }

    if (option.action_type === "say_message") {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(option.forward_to)}</Say>
  <Hangup />
</Response>`,
        { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
      );
    }

    if (option.action_type === "forward_phone") {
      await logSystemTrace({
        sourceType: "voice",
        sourceName: "voice-ivr-handler",
        eventKind: "route_selected",
        summary: `Forwarding call to ${option.forward_to}`,
        reason: "forward_phone",
        severity: "info",
        traceGroup: callSid,
        entityType: "call",
        entityId: callSid,
        callSid,
        metadata: { digit, label: option.label, target: option.forward_to },
      });
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${streamTwiml}
  <Dial timeout="${dialTimeout}" timeLimit="3600" hangupOnStar="true" action="${escapeXml(voicemailUrl)}" callerId="${escapeXml(from)}" record="record-from-answer-dual" recordingStatusCallback="${escapeXml(statusCallbackUrl)}" recordingStatusCallbackEvent="completed" statusCallback="${escapeXml(statusCallbackUrl)}" statusCallbackEvent="initiated ringing answered completed">
    <Number>${escapeXml(option.forward_to)}</Number>
  </Dial>
</Response>`,
        { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
      );
    }

    // forward_client — build list of Client identities to ring
    const callerIdMode = config.after_hours_caller_id_mode || "company";
    const twilioNumber = Deno.env.get("TWILIO_PHONE_NUMBER") || from;

    // ── Check if "Away from Desk" forwarding is active + within THIS department's hours ──
    const { data: fwdRows } = await supabase
      .from("company_settings")
      .select("key, value")
      .in("key", ["call_forwarding_enabled", "call_forwarding_number"]);
    const fwdMap: Record<string, string> = {};
    for (const r of (fwdRows || []) as any[]) fwdMap[r.key] = r.value;
    // Retired global "forward all calls" override. Use per-person Away from Desk
    // and IVR overflow instead so answering-service handoff still works.
    const callFwdEnabled = false;
    const callFwdNumber = fwdMap["call_forwarding_number"] || "";

    if (callFwdEnabled && callFwdNumber) {
      // Department is already confirmed open (after-hours check above would have returned)
      // So if we get here, the department is within hours → forward to cell
      console.log(`AWAY FROM DESK active + dept "${option.label}" is open — forwarding to ${callFwdNumber}`);
      await logSystemTrace({
        sourceType: "voice",
        sourceName: "voice-ivr-handler",
        eventKind: "route_selected",
        summary: `Away-from-desk forwarding to ${callFwdNumber}`,
        reason: "call_forwarding_enabled",
        severity: "warning",
        traceGroup: callSid,
        entityType: "call",
        entityId: callSid,
        callSid,
        metadata: { digit, label: option.label, target: callFwdNumber },
      });
      const dialCallerId = callerIdMode === "customer" ? from : twilioNumber;
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${streamTwiml}
  <Dial timeout="${dialTimeout}" timeLimit="3600" hangupOnStar="true" action="${escapeXml(voicemailUrl)}" callerId="${escapeXml(dialCallerId)}" record="record-from-answer-dual" recordingStatusCallback="${escapeXml(statusCallbackUrl)}" recordingStatusCallbackEvent="completed" statusCallback="${escapeXml(statusCallbackUrl)}" statusCallbackEvent="initiated ringing answered completed">
    <Number>${escapeXml(callFwdNumber)}</Number>
  </Dial>
</Response>`,
        { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
      );
    }

    // Determine which user IDs to dial
    const assignedIds: string[] = option.assigned_user_ids || [];

    // Check OOO for assigned employees
    const { data: oooEmployees } = await supabase
      .from("employees")
      .select("name, ooo_enabled, ooo_forward_number")
      .eq("is_active", true)
      .eq("ooo_enabled", true);

    const oooMatch = (oooEmployees || []).find((emp: any) => {
      return emp.ooo_forward_number;
    });

    if (oooMatch && oooMatch.ooo_forward_number && assignedIds.length === 0) {
      const dialCallerId = callerIdMode === "customer" ? from : twilioNumber;
      console.log(`Employee ${oooMatch.name} is OOO — forwarding to ${oooMatch.ooo_forward_number} (caller ID: ${callerIdMode})`);
      await logSystemTrace({
        sourceType: "voice",
        sourceName: "voice-ivr-handler",
        eventKind: "route_selected",
        summary: `OOO forwarding to ${oooMatch.ooo_forward_number}`,
        reason: "out_of_office",
        severity: "warning",
        traceGroup: callSid,
        entityType: "call",
        entityId: callSid,
        callSid,
        metadata: { employee_name: oooMatch.name, digit, label: option.label },
      });
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${streamTwiml}
  <Say voice="Polly.Joanna">${escapeXml(oooMatch.name)} is currently away from their desk. Forwarding your call.</Say>
  <Dial timeout="${dialTimeout}" timeLimit="3600" hangupOnStar="true" action="${escapeXml(voicemailUrl)}" callerId="${escapeXml(dialCallerId)}" record="record-from-answer-dual" recordingStatusCallback="${escapeXml(statusCallbackUrl)}" recordingStatusCallbackEvent="completed" statusCallback="${escapeXml(statusCallbackUrl)}" statusCallbackEvent="initiated ringing answered completed">
    <Number>${escapeXml(oooMatch.ooo_forward_number)}</Number>
  </Dial>
</Response>`,
        { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
      );
    }

    // ── Build dial list using this app's IVR department routing ──
    // Department comes from the IVR menu's stable routing key; labels are only legacy fallbacks.
    // We skip anyone busy or marked away-from-desk so a 2nd caller is never
    // routed to the same active client that's already on a live call.
    const { clientIdentities, chosenEmployees, evaluation } = await buildDepartmentDialList(supabase, deptKey, {
      callSid,
      traceGroup: callSid,
      sourceName: "voice-ivr-handler",
      fallbackDepartments: fallbackDepartmentKeys,
    });

    let clientTags: string;
    if (clientIdentities.length > 0) {
      clientTags = buildClientTags(clientIdentities, contactName || null);
      console.log(`[ivr-handler] dept "${option.label}" → ${chosenEmployees.join(", ")}`);
    } else if (assignedIds.length > 0 && evaluation.reason === "no_rules") {
      // Fallback only when no department-routing rules exist for this IVR option.
      const { data: assignedEmployees } = await supabase
        .from("employees")
        .select("name, profile_id, ooo_enabled")
        .eq("is_active", true)
        .in("profile_id", assignedIds);

      const employeesByProfile = new Map<string, { name?: string | null; profile_id?: string | null; ooo_enabled?: boolean | null }>();
      for (const employee of assignedEmployees || []) {
        if (employee.profile_id) employeesByProfile.set(employee.profile_id, employee);
      }

      const availableAssignedIds: string[] = [];
      let fallbackBusyCount = 0;
      let fallbackAwayCount = 0;

      for (const uid of assignedIds) {
        const employee = employeesByProfile.get(uid);
        const employeeName = employee?.name || `user_${uid}`;
        if (employee?.ooo_enabled) {
          fallbackAwayCount++;
          await logSystemTrace({
            sourceType: "voice",
            sourceName: "voice-ivr-handler",
            eventKind: "candidate_skipped",
            summary: `${employeeName} skipped for ${option.label}: away from desk`,
            reason: "out_of_office",
            severity: "info",
            traceGroup: callSid,
            entityType: "call",
            entityId: callSid,
            callSid,
            metadata: { digit, label: option.label, profile_id: uid },
          });
          continue;
        }

        if (employee?.name && await isUserBusy(supabase, employee.name)) {
          fallbackBusyCount++;
          await logSystemTrace({
            sourceType: "voice",
            sourceName: "voice-ivr-handler",
            eventKind: "candidate_skipped",
            summary: `${employee.name} skipped for ${option.label}: busy`,
            reason: "busy",
            severity: "info",
            traceGroup: callSid,
            entityType: "call",
            entityId: callSid,
            callSid,
            metadata: { digit, label: option.label, profile_id: uid },
          });
          continue;
        }

        availableAssignedIds.push(uid);
        chosenEmployees.push(employeeName);
      }

      if (availableAssignedIds.length === 0) {
        if (fallbackBusyCount > 0 && overflowEnabled && overflowNumber && (config as any).overflow_on_busy !== false) {
          console.log(`[ivr-handler] dept "${option.label}": assigned users busy - sending to answering service`);
          await logSystemTrace({
            sourceType: "voice",
            sourceName: "voice-ivr-handler",
            eventKind: "route_selected",
            summary: `Assigned users busy; overflow to ${(config as any).answering_service_label || "Answering Service"}`,
            reason: "assigned_users_busy",
            severity: "warning",
            traceGroup: callSid,
            entityType: "call",
            entityId: callSid,
            callSid,
            metadata: {
              digit,
              label: option.label,
              dept_key: deptKey,
              overflow_number: overflowNumber,
              busy_count: fallbackBusyCount,
              away_count: fallbackAwayCount,
              total_candidates: assignedIds.length,
            },
          });
          return new Response(
            overflowDialTwiml("assigned_users_busy"),
            { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
          );
        }

        if (fallbackBusyCount > 0 && !queueRetry) {
          console.log(`[ivr-handler] dept "${option.label}": assigned users busy - queueing caller for ${queueWaitSeconds}s`);
          await logSystemTrace({
            sourceType: "voice",
            sourceName: "voice-ivr-handler",
            eventKind: "queue_entered",
            summary: `Caller queued for ${option.label}`,
            reason: "assigned_users_busy",
            severity: "info",
            traceGroup: callSid,
            entityType: "call",
            entityId: callSid,
            callSid,
            metadata: {
              digit,
              label: option.label,
              dept_key: deptKey,
              queue_wait_seconds: queueWaitSeconds,
              hold_music_audio_url: (config as any).hold_music_audio_url || null,
              busy_count: fallbackBusyCount,
              away_count: fallbackAwayCount,
              total_candidates: assignedIds.length,
            },
          });
          return new Response(
            buildQueueTwiml({
              holdMusicUrl: (config as any).hold_music_audio_url,
              waitSeconds: queueWaitSeconds,
              redirectUrl: queueRedirectUrl,
            }),
            { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
          );
        }

        console.log(`[ivr-handler] dept "${option.label}": no assigned users available after busy/away checks`);
        if (overflowEnabled && overflowNumber && (config as any).overflow_on_no_answer !== false) {
          return new Response(
            overflowDialTwiml("no_available_assigned_users"),
            { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
          );
        }
        if (config?.voicemail_enabled) {
          return new Response(
            `<Response><Say voice="Polly.Joanna">No one is available right now. Please leave a message.</Say><Redirect method="POST">${escapeXml(voicemailUrl)}</Redirect></Response>`,
            { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
          );
        }
        return new Response(`<Response><Say voice="Polly.Joanna">No one is available right now. Goodbye.</Say><Hangup/></Response>`, {
          headers: { ...corsHeaders, "Content-Type": "text/xml" },
          status: 200,
        });
      }

      clientTags = availableAssignedIds.map((uid: string) => {
        const identity = `user_${uid.replace(/-/g, "")}`;
        return `<Client>${escapeXml(identity)}</Client>`;
      }).join("\n    ");
      console.log(`[ivr-handler] dept "${option.label}": routing rule yielded nobody — falling back to ${assignedIds.length} assigned users`);
    } else if (evaluation.reason === "all_busy" && !queueRetry) {
      if (overflowEnabled && overflowNumber && (config as any).overflow_on_busy !== false) {
        console.log(`[ivr-handler] dept "${option.label}": all recipients busy - sending to answering service`);
        await logSystemTrace({
          sourceType: "voice",
          sourceName: "voice-ivr-handler",
          eventKind: "route_selected",
          summary: `All recipients busy; overflow to ${(config as any).answering_service_label || "Answering Service"}`,
          reason: "all_busy",
          severity: "warning",
          traceGroup: callSid,
          entityType: "call",
          entityId: callSid,
          callSid,
          metadata: {
            digit,
            label: option.label,
            dept_key: deptKey,
            overflow_number: overflowNumber,
            busy_count: evaluation.busyCount,
            total_candidates: evaluation.totalCandidates,
          },
        });
        return new Response(
          overflowDialTwiml("all_busy"),
          { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
        );
      }

      console.log(`[ivr-handler] dept "${option.label}": all recipients busy — queueing caller for ${queueWaitSeconds}s`);
      await logSystemTrace({
        sourceType: "voice",
        sourceName: "voice-ivr-handler",
        eventKind: "queue_entered",
        summary: `Caller queued for ${option.label}`,
        reason: "all_busy",
        severity: "info",
        traceGroup: callSid,
        entityType: "call",
        entityId: callSid,
        callSid,
        metadata: {
          digit,
          label: option.label,
          dept_key: deptKey,
          queue_wait_seconds: queueWaitSeconds,
          hold_music_audio_url: (config as any).hold_music_audio_url || null,
          busy_count: evaluation.busyCount,
          total_candidates: evaluation.totalCandidates,
        },
      });
      return new Response(
        buildQueueTwiml({
          holdMusicUrl: (config as any).hold_music_audio_url,
          waitSeconds: queueWaitSeconds,
          redirectUrl: queueRedirectUrl,
        }),
        { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
      );
    } else {
      const finalReason = evaluation.reason === "all_busy" && queueRetry ? "queue_timeout" : evaluation.reason;
      // Last resort: nobody eligible after OOO / identity checks → route to voicemail (or overflow if configured)
      console.log(`[ivr-handler] dept "${option.label}": nobody available — routing to voicemail`);
      await logSystemTrace({
        sourceType: "voice",
        sourceName: "voice-ivr-handler",
        eventKind: "route_decision",
        summary: `No available recipients for ${option.label}`,
        reason: finalReason,
        severity: "warning",
        traceGroup: callSid,
        entityType: "call",
        entityId: callSid,
        callSid,
          metadata: { digit, label: option.label, dept_key: deptKey, assigned_ids: assignedIds, evaluation, queue_retry: queueRetry },
      });
      if (queueRetry && evaluation.reason === "all_busy") {
        await logSystemTrace({
          sourceType: "voice",
          sourceName: "voice-ivr-handler",
          eventKind: "queue_timed_out",
          summary: `Queue expired for ${option.label}`,
          reason: "all_busy",
          severity: "warning",
          traceGroup: callSid,
          entityType: "call",
          entityId: callSid,
          callSid,
          metadata: { digit, label: option.label, dept_key: deptKey, queue_wait_seconds: queueWaitSeconds },
        });
      }
      if (overflowEnabled && overflowNumber && (config as any).overflow_on_busy !== false) {
        await logSystemTrace({
          sourceType: "voice",
          sourceName: "voice-ivr-handler",
          eventKind: "route_selected",
          summary: `Overflow to ${(config as any).answering_service_label || "Answering Service"}`,
          reason: finalReason,
          severity: "warning",
          traceGroup: callSid,
          entityType: "call",
          entityId: callSid,
          callSid,
          metadata: { digit, label: option.label, overflow_number: overflowNumber, evaluation, queue_retry: queueRetry },
        });
        return new Response(
          overflowDialTwiml(finalReason),
          { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
        );
      }
      if (config.voicemail_enabled) {
        await logSystemTrace({
          sourceType: "voice",
          sourceName: "voice-ivr-handler",
          eventKind: "route_selected",
          summary: "Call sent to voicemail",
          reason: finalReason,
          severity: "info",
          traceGroup: callSid,
          entityType: "call",
          entityId: callSid,
          callSid,
          metadata: { digit, label: option.label, evaluation, queue_retry: queueRetry },
        });
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${vmGreeting}
  <Record maxLength="600" action="${escapeXml(voicemailUrl)}" recordingStatusCallback="${escapeXml(voicemailUrl)}" recordingStatusCallbackEvent="completed" playBeep="true" />
</Response>`,
          { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
        );
      }
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>\n<Response><Hangup/></Response>`,
        { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
      );
    }

    await logSystemTrace({
      sourceType: "voice",
      sourceName: "voice-ivr-handler",
      eventKind: "route_selected",
      summary: `${queueRetry ? "Queued caller released to" : "Call ringing"} ${chosenEmployees.join(", ")}`,
      reason: queueRetry ? "queue_released" : "department_routing",
      severity: "info",
      traceGroup: callSid,
      entityType: "call",
      entityId: callSid,
      callSid,
      metadata: { digit, label: option.label, dept_key: deptKey, chosen_employees: chosenEmployees, client_count: clientIdentities.length, queue_retry: queueRetry },
    });

    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${streamTwiml}
  <Dial timeout="${dialTimeout}" timeLimit="3600" hangupOnStar="true" action="${escapeXml(voicemailUrl)}" callerId="${escapeXml(from)}" record="record-from-answer-dual" recordingStatusCallback="${escapeXml(statusCallbackUrl)}" recordingStatusCallbackEvent="completed" statusCallback="${escapeXml(statusCallbackUrl)}" statusCallbackEvent="initiated ringing answered completed">
    ${clientTags}
  </Dial>
</Response>`,
      { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
    );
  } catch (error) {
    console.error("voice-ivr-handler error:", error);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred. Please try again later.</Say></Response>',
      { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
    );
  }
});
