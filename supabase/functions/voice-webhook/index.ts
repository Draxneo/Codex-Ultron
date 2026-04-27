import { getCentralNow } from "../_shared/formatters.ts";
import { sendIvrSms } from "../_shared/smsHelper.ts";
import { resolveContact } from "../_shared/resolveContact.ts";
import { validateTwilioSignature } from "../_shared/twilioSignature.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  buildClientTags,
  buildDepartmentDialList,
  isUserBusy,
} from "../_shared/callRouting.ts";
import { logSystemTrace } from "../_shared/systemTrace.ts";

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

/** Returns <Play> for audio URL or <Say> for text */
function greetingTwiml(audioUrl: string | null, text: string): string {
  if (audioUrl) return `<Play>${escapeXml(audioUrl)}</Play>`;
  return `<Say voice="Polly.Joanna">${escapeXml(text)}</Say>`;
}

function menuGreetingTwiml(
  audioUrl: string | null,
  greetingText: string,
  menuText: string,
): string {
  if (audioUrl) {
    return `<Play>${escapeXml(audioUrl)}</Play>
    <Say voice="Polly.Joanna">${escapeXml(menuText)}</Say>`;
  }
  return `<Say voice="Polly.Joanna">${
    escapeXml(`${greetingText} ${menuText}`.trim())
  }</Say>`;
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
    ? `<Play loop="${Math.max(1, Math.ceil(safeWait / 5))}">${
      escapeXml(holdMusicUrl)
    }</Play>`
    : `<Say voice="Polly.Joanna">All team members are helping other callers. Please stay on the line while we hold your place in queue.</Say><Pause length="${safeWait}"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${holdPrompt}
  <Redirect method="POST">${escapeXml(redirectUrl)}</Redirect>
</Response>`;
}

function detectHoliday(now: Date): string | null {
  const month = now.getUTCMonth();
  const date = now.getUTCDate();
  const day = now.getUTCDay();

  if (month === 0 && date === 1) return "New Year's Day";
  if (month === 0 && date === 2 && day === 1) return "New Year's Day";
  if (month === 11 && date === 31 && day === 5) return "New Year's Day";
  if (month === 8 && day === 1 && date <= 7) return "Labor Day";
  if (month === 10 && day === 4 && date >= 22 && date <= 28) {
    return "Thanksgiving";
  }
  if (month === 10 && day === 5 && date >= 23 && date <= 29) {
    return "Thanksgiving";
  }
  if (month === 11 && date === 24) return "Christmas Eve";
  if (month === 11 && date === 25) return "Christmas";
  if (month === 11 && date === 26 && day === 1) return "Christmas";
  if (month === 11 && date === 23 && day === 5) return "Christmas";
  return null;
}

function getHolidaySms(holiday: string, cn: string): string {
  const messages: Record<string, string> = {
    "New Year's Day":
      `Happy New Year! 🎉 This is ${cn} — we're closed today celebrating the new year. I'll get back to you first thing tomorrow, or feel free to text me here anytime!`,
    "Labor Day":
      `Happy Labor Day! 🇺🇸 This is ${cn} — we're closed today enjoying the holiday. I'll get back to you first thing tomorrow, or feel free to text me here anytime!`,
    "Thanksgiving":
      `Happy Thanksgiving! 🦃 This is ${cn} — we're closed today spending time with family. I'll get back to you when we're back, or feel free to text me here anytime!`,
    "Christmas Eve":
      `Merry Christmas Eve! 🎄 This is ${cn} — we're closed for the holiday. I'll get back to you when we're back, or feel free to text me here anytime!`,
    "Christmas":
      `Merry Christmas! 🎄 This is ${cn} — we're closed today celebrating with family. I'll get back to you when we're back, or feel free to text me here anytime!`,
  };
  return messages[holiday] || messages["Christmas"];
}

function getHolidayGreeting(holiday: string, cn: string): string {
  const greetings: Record<string, string> = {
    "New Year's Day":
      `Happy New Year from ${cn}! We're closed today in celebration. Please leave a message and we'll call you back first thing tomorrow. For emergencies, text us and we'll get right back to you.`,
    "Labor Day":
      `Happy Labor Day from ${cn}! We're closed today for the holiday. Please leave a message and we'll call you back first thing tomorrow. For emergencies, text us and we'll get right back to you.`,
    "Thanksgiving":
      `Happy Thanksgiving from ${cn}! We're closed today spending time with family. Please leave a message and we'll call you back when we're in. For emergencies, text us and we'll get right back to you.`,
    "Christmas Eve":
      `Merry Christmas Eve from ${cn}! We're closed for the holiday. Please leave a message and we'll return your call when we're back. For emergencies, text us and we'll get right back to you.`,
    "Christmas":
      `Merry Christmas from ${cn}! We're closed today celebrating with family. Please leave a message and we'll return your call when we're back. For emergencies, text us and we'll get right back to you.`,
  };
  return greetings[holiday] || greetings["Christmas"];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.text();
    const params = new URLSearchParams(formData);
    let sigValid = false;
    try {
      sigValid = await validateTwilioSignature(req, formData);
    } catch (sigErr) {
      console.error("Voice webhook Twilio signature validation error:", sigErr);
    }
    if (!sigValid) {
      const postedAccountSid =
        params.get("AccountSid") || params.get("account_sid") || "";
      const expectedAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
      if (postedAccountSid && expectedAccountSid && postedAccountSid === expectedAccountSid) {
        console.warn(
          "Voice webhook Twilio signature mismatch, but AccountSid matched; allowing call to avoid dropping live callers",
        );
      } else {
        console.warn("Rejecting voice webhook: invalid Twilio signature");
        return new Response(
          '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
          { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 403 },
        );
      }
    }

    const getParam = (...keys: string[]) => {
      for (const key of keys) {
        const value = params.get(key);
        if (value) return value;
      }
      return "";
    };

    const callSid = getParam("CallSid", "call_sid");
    const from = getParam("From", "from", "Caller", "caller");
    const to = getParam("To", "to", "Called", "called");
    const callStatus = getParam("CallStatus", "call_status") || "initiated";
    const direction = getParam("Direction", "direction") || "inbound";
    const queueRetry = new URL(req.url).searchParams.get("QueueRetry") === "1";

    const stirVerstat = getParam("StirVerstat", "stir_verstat");

    if (!from) {
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        {
          headers: { ...corsHeaders, "Content-Type": "text/xml" },
          status: 200,
        },
      );
    }

    const supabase = getSupabaseAdmin();
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";

    // ── STIR/SHAKEN spam filter ──
    // Classify the attestation level for logging
    const stirStatus = stirVerstat
      ? (stirVerstat.includes("TN-Validation-Failed")
        ? "failed"
        : stirVerstat.includes("-A")
        ? "A"
        : stirVerstat.includes("-B")
        ? "B"
        : stirVerstat.includes("-C")
        ? "C"
        : "unknown")
      : "none";

    // Auto-hang-up ONLY on cryptographically confirmed failures
    if (stirStatus === "failed") {
      console.log(
        `SPAM BLOCKED: ${from} — StirVerstat=${stirVerstat} — hanging up`,
      );
      // Still log it so we can review
      await supabase.from("call_log").insert({
        direction: "inbound",
        phone_number: from,
        status: "spam-blocked",
        twilio_sid: callSid,
        contact_name: null,
        contact_type: "unknown",
        stir_status: stirStatus,
      } as any);
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Reject /></Response>',
        {
          headers: { ...corsHeaders, "Content-Type": "text/xml" },
          status: 200,
        },
      );
    }

    const isInbound = direction === "inbound" ||
      !direction.includes("outbound");
    const externalPhone = isInbound ? from : to;

    // FIXED: was loading all 2000 customers into memory — now single targeted DB query
    let { contactName, contactType } = await resolveContact(
      supabase,
      externalPhone,
    );

    // Parse Twilio CNAM Add-on result as fallback for caller name
    if (!contactName) {
      try {
        const addOnsRaw = params.get("AddOns");
        console.log(`CNAM raw AddOns param: ${addOnsRaw || "(empty)"}`);
        if (addOnsRaw) {
          const addOns = JSON.parse(addOnsRaw);
          console.log(
            `CNAM parsed keys: ${
              JSON.stringify(Object.keys(addOns?.results || {}))
            }`,
          );
          // Try multiple common CNAM add-on result paths
          const results = addOns?.results || {};
          let cnamValue: string | null = null;
          for (const key of Object.keys(results)) {
            const r = results[key]?.result;
            // twilio_caller_name style
            cnamValue = r?.caller_name?.caller_name || r?.caller_name ||
              r?.name || null;
            if (typeof cnamValue === "string" && cnamValue.trim()) break;
            cnamValue = null;
          }
          if (cnamValue && typeof cnamValue === "string" && cnamValue.trim()) {
            contactName = cnamValue.trim();
            console.log(`CNAM lookup resolved: ${contactName}`);
          } else {
            console.log(`CNAM: no usable name found in results`);
          }
        }
      } catch (e) {
        console.error("CNAM parsing failed:", e);
      }
    }

    // Vendor matching — optimized: single SQL queries with server-side digit
    // normalization instead of loading entire tables into memory.
    let relatedVendorId: string | null = null;
    const normalizedExtPhone = externalPhone.replace(/\D/g, "").slice(-10);
    if (normalizedExtPhone.length === 10) {
      try {
        // 1. Check vendor_contacts (per-person vendor reps)
        const { data: vc } = await supabase
          .from("vendor_contacts")
          .select("supply_house_id, phone")
          .not("phone", "is", null)
          .filter("phone", "ilike", `%${normalizedExtPhone}%`)
          .limit(50);
        const vcMatch = (vc || []).find(
          (c: any) => c.phone?.replace(/\D/g, "").slice(-10) === normalizedExtPhone,
        );
        if (vcMatch) relatedVendorId = vcMatch.supply_house_id;

        // 2. Fall back to supply_houses main contact phone
        if (!relatedVendorId) {
          const { data: houses } = await supabase
            .from("supply_houses")
            .select("id, contact_phone")
            .eq("is_active", true)
            .not("contact_phone", "is", null)
            .filter("contact_phone", "ilike", `%${normalizedExtPhone}%`)
            .limit(50);
          const houseMatch = (houses || []).find(
            (h: any) =>
              h.contact_phone?.replace(/\D/g, "").slice(-10) === normalizedExtPhone,
          );
          if (houseMatch) relatedVendorId = houseMatch.id;
        }
      } catch (e) {
        console.error("vendor phone match failed:", e);
      }
    }

    // Upsert call log
    const { data: existing } = await supabase
      .from("call_log")
      .select("id")
      .eq("twilio_sid", callSid)
      .maybeSingle();

    if (existing) {
      await supabase.from("call_log").update({
        status: callStatus,
        ...(callStatus === "completed"
          ? { ended_at: new Date().toISOString() }
          : {}),
        ...(isInbound && stirStatus ? { stir_status: stirStatus } : {}),
      }).eq("id", existing.id);
    } else {
      await supabase.from("call_log").insert({
        direction: isInbound ? "inbound" : "outbound",
        phone_number: externalPhone,
        status: callStatus,
        twilio_sid: callSid,
        contact_name: contactName,
        contact_type: contactType,
        ...(relatedVendorId ? { related_vendor_id: relatedVendorId } : {}),
        ...(isInbound && stirStatus ? { stir_status: stirStatus } : {}),
      } as any);
    }

    console.log(
      `Voice webhook: ${
        isInbound ? "inbound" : "outbound"
      } call ${callSid} from ${externalPhone} — status: ${callStatus}, contact: ${
        contactName || "unknown"
      }, stir: ${stirStatus}`,
    );

    await logSystemTrace({
      sourceType: "voice",
      sourceName: "voice-webhook",
      eventKind: "webhook_received",
      summary: `Inbound call received from ${contactName || externalPhone}`,
      reason: callStatus,
      severity: "info",
      traceGroup: callSid,
      entityType: "call",
      entityId: callSid,
      callSid,
      metadata: {
        from,
        to,
        direction,
        stir_status: stirStatus,
        contact_name: contactName,
        contact_type: contactType,
      },
    });

    if (!isInbound) {
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        {
          headers: { ...corsHeaders, "Content-Type": "text/xml" },
          status: 200,
        },
      );
    }

    // ── Load company settings ──
    const { data: fwdRows } = await supabase
      .from("company_settings")
      .select("key, value")
      .in("key", [
        "call_forwarding_enabled",
        "call_forwarding_number",
        "live_transcription_enabled",
        "ivr_test_mode",
      ]);
    const csMap: Record<string, string> = {};
    for (const r of (fwdRows || []) as any[]) csMap[r.key] = r.value;

    // Retired global "forward all calls" override. Availability now belongs to
    // IVR department routing and per-person Away from Desk state so busy callers
    // can overflow to the answering service predictably.
    const callForwardingEnabled = false;
    const callForwardingNumber = csMap["call_forwarding_number"] || "";
    const liveTranscribeEnabled =
      csMap["live_transcription_enabled"] === "true";
    const ivrTestMode = csMap["ivr_test_mode"] === "true";

    // Build stream TwiML BEFORE any early returns so all paths can use it.
    // NOTE: At the top-level <Start>, Twilio only supports inbound_track / outbound_track
    // (no both_tracks — that flag is only valid inside <Dial>). Using "both_tracks" here
    // caused Twilio to silently drop all media frames so live transcripts were empty.
    // We use inbound_track (the caller's audio) for the live transcript; the full
    // dual-channel agent+caller recording is still captured by record-from-answer-dual
    // on the <Dial> and post-processed by transcribe-audio.
    const streamTwiml = liveTranscribeEnabled
      ? `<Start><Stream url="wss://${
        supabaseUrl.replace("https://", "")
      }/functions/v1/live-transcribe" track="inbound_track" /></Start>`
      : "";

    // ── CALL FORWARDING CHECK (hours-aware) ──
    // Only forward during main business hours; after hours let normal IVR/VM handle it
    if (callForwardingEnabled && callForwardingNumber) {
      // Load IVR config to check business hours
      const { data: fwdIvrConfig } = await supabase.from("ivr_config").select(
        "business_hours_start, business_hours_end, business_days",
      ).limit(1).maybeSingle();
      let withinBusinessHours = true; // default to forwarding if no hours configured
      if (
        fwdIvrConfig?.business_hours_start &&
        fwdIvrConfig?.business_hours_end && fwdIvrConfig?.business_days
      ) {
        const c = getCentralNow();
        const hour = c.getUTCHours();
        const minute = c.getUTCMinutes();
        const currentDay = c.getUTCDay();
        const days: number[] = fwdIvrConfig.business_days;
        const [startH, startM] = fwdIvrConfig.business_hours_start.split(":")
          .map(Number);
        const [endH, endM] = fwdIvrConfig.business_hours_end.split(":").map(
          Number,
        );
        const currentMinutes = hour * 60 + minute;
        withinBusinessHours = days.includes(currentDay) &&
          currentMinutes >= startH * 60 + startM &&
          currentMinutes < endH * 60 + endM;
      }

      if (withinBusinessHours) {
        console.log(
          `CALL FORWARDING ACTIVE (within business hours) — dialing ${callForwardingNumber}`,
        );
        await logSystemTrace({
          sourceType: "voice",
          sourceName: "voice-webhook",
          eventKind: "route_selected",
          summary:
            `Call forwarded to away-from-desk number ${callForwardingNumber}`,
          reason: "call_forwarding_enabled",
          severity: "warning",
          traceGroup: callSid,
          entityType: "call",
          entityId: callSid,
          callSid,
          metadata: {
            target_number: callForwardingNumber,
            within_business_hours: true,
          },
        });
        const twilioNumber = normalizeE164Phone(Deno.env.get("TWILIO_PHONE_NUMBER")) || to;
        const statusCallbackUrlFwd =
          `${supabaseUrl}/functions/v1/voice-status-callback`;
        const voicemailUrlFwd =
          `${supabaseUrl}/functions/v1/voice-voicemail?CallSid=${
            encodeURIComponent(callSid)
          }&From=${encodeURIComponent(from)}&ContactName=${
            encodeURIComponent(contactName || "")
          }&ContactType=${encodeURIComponent(contactType)}`;
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${streamTwiml}
  <Dial timeout="25" action="${escapeXml(voicemailUrlFwd)}" callerId="${
            escapeXml(twilioNumber)
          }" record="record-from-answer-dual" recordingStatusCallback="${
            escapeXml(statusCallbackUrlFwd)
          }" recordingStatusCallbackEvent="completed" statusCallback="${
            escapeXml(statusCallbackUrlFwd)
          }" statusCallbackEvent="initiated ringing answered completed">
    <Number>${escapeXml(callForwardingNumber)}</Number>
  </Dial>
</Response>`,
          {
            headers: { ...corsHeaders, "Content-Type": "text/xml" },
            status: 200,
          },
        );
      } else {
        console.log(
          `CALL FORWARDING enabled but AFTER HOURS — skipping, using normal IVR flow`,
        );
        await logSystemTrace({
          sourceType: "voice",
          sourceName: "voice-webhook",
          eventKind: "route_decision",
          summary: "Call forwarding skipped",
          reason: "after_hours",
          severity: "info",
          traceGroup: callSid,
          entityType: "call",
          entityId: callSid,
          callSid,
          metadata: { target_number: callForwardingNumber },
        });
      }
    }

    // Load IVR config
    const { data: ivrConfig } = await supabase.from("ivr_config").select("*")
      .limit(1).maybeSingle();
    const config = ivrConfig || {
      greeting_text: "Thank you for calling. Please hold while we connect you.",
      greeting_audio_url: null,
      voicemail_enabled: true,
      ring_timeout_seconds: 25,
      after_hours_caller_id_mode: "company",
    };

    const overflowEnabled = (config as any).answering_service_enabled === true;
    const overflowNumber = (config as any).answering_service_number || "";
    const overflowOnBusy = (config as any).overflow_on_busy !== false;
    const dialTimeout = config.ring_timeout_seconds || 25;
    const queueWaitSeconds =
      (config as any).overflow_ring_seconds_before_handoff || dialTimeout;

    function overflowDialTwiml(reason: string, callerId: string): string {
      const overflowStatusCallback =
        `${supabaseUrl}/functions/v1/voice-status-callback`;
      console.log(`📞 OVERFLOW (voice-webhook): ${reason} → ${overflowNumber}`);
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${streamTwiml}
  <Dial timeout="30" timeLimit="3600" hangupOnStar="true" callerId="${
        escapeXml(callerId)
      }" record="record-from-answer-dual" recordingStatusCallback="${
        escapeXml(overflowStatusCallback)
      }" recordingStatusCallbackEvent="completed" statusCallback="${
        escapeXml(overflowStatusCallback)
      }" statusCallbackEvent="initiated ringing answered completed">
    <Number>${escapeXml(overflowNumber)}</Number>
  </Dial>
</Response>`;
    }

    const voicemailUrl = `${supabaseUrl}/functions/v1/voice-voicemail?CallSid=${
      encodeURIComponent(callSid)
    }&From=${encodeURIComponent(from)}&ContactName=${
      encodeURIComponent(contactName || "")
    }&ContactType=${encodeURIComponent(contactType)}`;
    const statusCallbackUrl =
      `${supabaseUrl}/functions/v1/voice-status-callback`;
    const queueRedirectUrl =
      `${supabaseUrl}/functions/v1/voice-webhook?CallSid=${
        encodeURIComponent(callSid)
      }&From=${encodeURIComponent(from)}&To=${
        encodeURIComponent(to)
      }&CallStatus=${encodeURIComponent(callStatus)}&Direction=${
        encodeURIComponent(direction)
      }&QueueRetry=1`;

    // TEST MODE: bypass greeting/holiday/menu — ring directly from this app's IVR layer to every registered client
    if (ivrTestMode) {
      console.log(
        "TEST MODE: bypassing IVR — direct ring to registered clients",
      );
      const { data: profiles } = await supabase.from("profiles").select("id");
      const clientTags = (profiles || []).length > 0
        ? (profiles as any[]).map((p: any) => {
          const clientId = `uo2_user_${p.id.replace(/-/g, "")}`;
          const callerNameParam = contactName
            ? ` CapacitorTwilioCallerName="${escapeXml(contactName)}"`
            : "";
          return `<Client${callerNameParam}>${clientId}</Client>`;
        }).join("\n    ")
        : `<Client>ultraphone</Client>`;
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${streamTwiml}
  <Dial timeout="${dialTimeout}" action="${
          escapeXml(voicemailUrl)
        }" callerId="${
          escapeXml(from)
        }" record="record-from-answer-dual" recordingStatusCallback="${
          escapeXml(statusCallbackUrl)
        }" recordingStatusCallbackEvent="completed" statusCallback="${
          escapeXml(statusCallbackUrl)
        }" statusCallbackEvent="initiated ringing answered completed">
    ${clientTags}
  </Dial>
</Response>`,
        {
          headers: { ...corsHeaders, "Content-Type": "text/xml" },
          status: 200,
        },
      );
    }

    const ivrHandlerUrl = `${supabaseUrl}/functions/v1/voice-ivr-handler`;

    // Holiday check
    const centralNow = getCentralNow();
    const holiday = detectHoliday(centralNow);
    if (holiday) {
      console.log(`Holiday detected: ${holiday} — playing holiday greeting`);
      const { data: cnRow } = await supabase.from("company_settings").select(
        "value",
      ).eq("key", "company_name").maybeSingle();
      const { data: smsTestModeRow } = await supabase.from("company_settings")
        .select("value").eq("key", "sms_test_mode").maybeSingle();
      const cn = cnRow?.value || "our team";

      await sendIvrSms({
        to: from,
        body: getHolidaySms(holiday, cn),
        contactName,
        contactType,
        supabase,
        skipEmployeeFilter: smsTestModeRow?.value === "true",
      });

      const holidayGreeting = getHolidayGreeting(holiday, cn);
      const holidayGreetingTwiml = config.voicemail_audio_url
        ? `<Play>${escapeXml(config.voicemail_audio_url)}</Play>`
        : `<Say voice="Polly.Joanna">${escapeXml(holidayGreeting)}</Say>`;
      if (config.voicemail_enabled) {
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${streamTwiml}
  ${holidayGreetingTwiml}
  <Record maxLength="600" action="${
            escapeXml(voicemailUrl)
          }" recordingStatusCallback="${
            escapeXml(voicemailUrl)
          }" recordingStatusCallbackEvent="completed" playBeep="true" />
</Response>`,
          {
            headers: { ...corsHeaders, "Content-Type": "text/xml" },
            status: 200,
          },
        );
      }
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${streamTwiml}
  ${holidayGreetingTwiml}
  <Hangup />
</Response>`,
        {
          headers: { ...corsHeaders, "Content-Type": "text/xml" },
          status: 200,
        },
      );
    }

    // Load active IVR menu options
    const { data: menuOptions } = await supabase
      .from("ivr_menu_options")
      .select("*")
      .eq("is_active", true)
      .order("digit");

    const activeOptions = menuOptions || [];

    if (activeOptions.length === 0) {
      console.log(
        "No IVR menu configured here — checking direct-routing availability before dialing",
      );

      const { data: oooEmployees } = await supabase
        .from("employees")
        .select("name, ooo_enabled, ooo_forward_number")
        .eq("is_active", true)
        .eq("ooo_enabled", true);

      const oooWithNumber = (oooEmployees || []).filter((e: any) =>
        e.ooo_forward_number
      );

      if (oooWithNumber.length > 0) {
        const twilioNumber = normalizeE164Phone(Deno.env.get("TWILIO_PHONE_NUMBER")) || from;
        const callerIdMode = config.after_hours_caller_id_mode || "company";
        const dialCallerId = callerIdMode === "customer" ? from : twilioNumber;

        console.log(
          `OOO active for ${
            oooWithNumber.map((e: any) => e.name).join(", ")
          } — forwarding`,
        );
        await logSystemTrace({
          sourceType: "voice",
          sourceName: "voice-webhook",
          eventKind: "route_selected",
          summary: `Forwarded to OOO number for ${
            oooWithNumber.map((e: any) => e.name).join(", ")
          }`,
          reason: "ooo_forwarding",
          severity: "warning",
          traceGroup: callSid,
          entityType: "call",
          entityId: callSid,
          callSid,
          metadata: {
            employees: oooWithNumber.map((e: any) => e.name),
            forwards: oooWithNumber.map((e: any) => e.ooo_forward_number),
          },
        });
        const numberTags = oooWithNumber.map((e: any) =>
          `<Number>${escapeXml(e.ooo_forward_number)}</Number>`
        ).join("\n    ");

        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${streamTwiml}
  ${greetingTwiml(config.greeting_audio_url, config.greeting_text)}
  <Dial timeout="${dialTimeout}" action="${
            escapeXml(voicemailUrl)
          }" callerId="${
            escapeXml(dialCallerId)
          }" record="record-from-answer-dual" recordingStatusCallback="${
            escapeXml(statusCallbackUrl)
          }" recordingStatusCallbackEvent="completed" statusCallback="${
            escapeXml(statusCallbackUrl)
          }" statusCallbackEvent="initiated ringing answered completed">
    ${numberTags}
  </Dial>
</Response>`,
          {
            headers: { ...corsHeaders, "Content-Type": "text/xml" },
            status: 200,
          },
        );
      }

      // ── Department routing (no IVR menu): use 'general' department rules ──
      // Skip anyone busy/away. If everyone unavailable → voicemail.
      const { clientIdentities, chosenEmployees, evaluation } =
        await buildDepartmentDialList(supabase, "general", {
          callSid,
          traceGroup: callSid,
          sourceName: "voice-webhook",
        });

      if (clientIdentities.length === 0) {
        if (evaluation.reason === "all_busy" && !queueRetry) {
          console.log(
            `[voice-webhook] No-IVR path: everyone busy in 'general' — queueing caller for ${queueWaitSeconds}s`,
          );
          await logSystemTrace({
            sourceType: "voice",
            sourceName: "voice-webhook",
            eventKind: "queue_entered",
            summary: "Caller queued for general routing",
            reason: "all_busy",
            severity: "info",
            traceGroup: callSid,
            entityType: "call",
            entityId: callSid,
            callSid,
            metadata: {
              department: "general",
              queue_wait_seconds: queueWaitSeconds,
              hold_music_audio_url: (config as any).hold_music_audio_url ||
                null,
              evaluation,
            },
          });
          return new Response(
            buildQueueTwiml({
              holdMusicUrl: (config as any).hold_music_audio_url,
              waitSeconds: queueWaitSeconds,
              redirectUrl: queueRedirectUrl,
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "text/xml" },
              status: 200,
            },
          );
        }

        const finalReason = evaluation.reason === "all_busy" && queueRetry
          ? "queue_timeout"
          : evaluation.reason;
        console.log(
          "[voice-webhook] No-IVR path: nobody available in 'general' — routing to voicemail",
        );
        await logSystemTrace({
          sourceType: "voice",
          sourceName: "voice-webhook",
          eventKind: "route_decision",
          summary: "No available general-routing recipients",
          reason: finalReason,
          severity: "warning",
          traceGroup: callSid,
          entityType: "call",
          entityId: callSid,
          callSid,
          metadata: {
            department: "general",
            overflow_enabled: overflowEnabled,
            overflow_number: overflowNumber || null,
            evaluation,
            queue_retry: queueRetry,
          },
        });
        if (queueRetry && evaluation.reason === "all_busy") {
          await logSystemTrace({
            sourceType: "voice",
            sourceName: "voice-webhook",
            eventKind: "queue_timed_out",
            summary: "Queue expired for general routing",
            reason: "all_busy",
            severity: "warning",
            traceGroup: callSid,
            entityType: "call",
            entityId: callSid,
            callSid,
            metadata: {
              department: "general",
              queue_wait_seconds: queueWaitSeconds,
            },
          });
        }
        if (overflowEnabled && overflowNumber && overflowOnBusy) {
          await logSystemTrace({
            sourceType: "voice",
            sourceName: "voice-webhook",
            eventKind: "route_selected",
            summary: `Call overflowed to ${
              (config as any).answering_service_label || "Answering Service"
            }`,
            reason: finalReason,
            severity: "warning",
            traceGroup: callSid,
            entityType: "call",
            entityId: callSid,
            callSid,
            metadata: {
              overflow_number: overflowNumber,
              evaluation,
              queue_retry: queueRetry,
            },
          });
          return new Response(
            overflowDialTwiml(finalReason, from),
            {
              headers: { ...corsHeaders, "Content-Type": "text/xml" },
              status: 200,
            },
          );
        }
        if (config.voicemail_enabled) {
          await logSystemTrace({
            sourceType: "voice",
            sourceName: "voice-webhook",
            eventKind: "route_selected",
            summary: "Call sent to voicemail",
            reason: finalReason,
            severity: "info",
            traceGroup: callSid,
            entityType: "call",
            entityId: callSid,
            callSid,
            metadata: {
              department: "general",
              evaluation,
              queue_retry: queueRetry,
            },
          });
          return new Response(
            `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${streamTwiml}
  ${greetingTwiml(config.greeting_audio_url, config.greeting_text)}
  <Record maxLength="600" action="${
              escapeXml(voicemailUrl)
            }" recordingStatusCallback="${
              escapeXml(voicemailUrl)
            }" recordingStatusCallbackEvent="completed" playBeep="true" />
</Response>`,
            {
              headers: { ...corsHeaders, "Content-Type": "text/xml" },
              status: 200,
            },
          );
        }
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${streamTwiml}
  ${greetingTwiml(config.greeting_audio_url, config.greeting_text)}
  <Hangup />
</Response>`,
          {
            headers: { ...corsHeaders, "Content-Type": "text/xml" },
            status: 200,
          },
        );
      }

      console.log(`[voice-webhook] Routing to: ${chosenEmployees.join(", ")}`);
      await logSystemTrace({
        sourceType: "voice",
        sourceName: "voice-webhook",
        eventKind: "route_selected",
        summary: `${
          queueRetry ? "Queued caller released to" : "Call ringing"
        } ${chosenEmployees.join(", ")}`,
        reason: queueRetry ? "queue_released" : "department_routing",
        severity: "info",
        traceGroup: callSid,
        entityType: "call",
        entityId: callSid,
        callSid,
        metadata: {
          department: "general",
          chosen_employees: chosenEmployees,
          client_count: clientIdentities.length,
          queue_retry: queueRetry,
        },
      });
      const clientTags = buildClientTags(clientIdentities, contactName);

      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${streamTwiml}
  ${greetingTwiml(config.greeting_audio_url, config.greeting_text)}
  <Dial timeout="${dialTimeout}" action="${
          escapeXml(voicemailUrl)
        }" callerId="${
          escapeXml(from)
        }" record="record-from-answer-dual" recordingStatusCallback="${
          escapeXml(statusCallbackUrl)
        }" recordingStatusCallbackEvent="completed" statusCallback="${
          escapeXml(statusCallbackUrl)
        }" statusCallbackEvent="initiated ringing answered completed">
    ${clientTags}
  </Dial>
</Response>`,
        {
          headers: { ...corsHeaders, "Content-Type": "text/xml" },
          status: 200,
        },
      );
    }

    const menuText = activeOptions.map((o: any) =>
      `Press ${o.digit} for ${o.label}.`
    ).join(" ");

    await logSystemTrace({
      sourceType: "voice",
      sourceName: "voice-webhook",
      eventKind: "ivr_presented",
      summary: `IVR menu presented with ${activeOptions.length} options`,
      reason: "menu_available",
      severity: "info",
      traceGroup: callSid,
      entityType: "call",
      entityId: callSid,
      callSid,
      metadata: {
        options: activeOptions.map((o: any) => ({
          digit: o.digit,
          label: o.label,
        })),
      },
    });

    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${escapeXml(ivrHandlerUrl)}?CallSid=${
        encodeURIComponent(callSid)
      }&amp;From=${encodeURIComponent(from)}&amp;ContactName=${
        encodeURIComponent(contactName || "")
      }&amp;ContactType=${
        encodeURIComponent(contactType)
      }&amp;Attempt=1" timeout="8" input="dtmf">
    ${menuGreetingTwiml(config.greeting_audio_url, config.greeting_text, menuText)}
  </Gather>
  <Gather numDigits="1" action="${escapeXml(ivrHandlerUrl)}?CallSid=${
        encodeURIComponent(callSid)
      }&amp;From=${encodeURIComponent(from)}&amp;ContactName=${
        encodeURIComponent(contactName || "")
      }&amp;ContactType=${
        encodeURIComponent(contactType)
      }&amp;Attempt=2" timeout="8" input="dtmf">
    <Say voice="Polly.Joanna">We didn't receive a response. ${
        escapeXml(menuText)
      }</Say>
  </Gather>
  <Redirect>${escapeXml(ivrHandlerUrl)}?CallSid=${
        encodeURIComponent(callSid)
      }&amp;From=${encodeURIComponent(from)}&amp;ContactName=${
        encodeURIComponent(contactName || "")
      }&amp;ContactType=${
        encodeURIComponent(contactType)
      }&amp;Attempt=3</Redirect>
</Response>`,
      { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 },
    );
  } catch (error) {
    console.error("Voice webhook error:", error);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 },
    );
  }
});
