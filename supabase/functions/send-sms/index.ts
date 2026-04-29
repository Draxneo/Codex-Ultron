import { logApiUsage } from "../_shared/apiUsageLog.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { withRetry, isRetryable, logSystemError, enqueueRetry, pageOnCall } from "../_shared/resilience.ts";
import { requireStaffOrInternal } from "../_shared/functionAuth.ts";
import { appendSmsSignature } from "../_shared/smsSignature.ts";

type MediaInput = string | { url: string; content_type?: string };

interface NormalizedMedia {
  url: string;
  content_type: string;
}

/** Guess a sane MIME type from a URL extension when caller didn't supply one. */
function guessContentType(url: string): string {
  const u = url.toLowerCase().split("?")[0];
  if (u.endsWith(".png")) return "image/png";
  if (u.endsWith(".gif")) return "image/gif";
  if (u.endsWith(".webp")) return "image/webp";
  if (u.endsWith(".heic")) return "image/heic";
  if (u.endsWith(".pdf")) return "application/pdf";
  if (u.endsWith(".mp4")) return "video/mp4";
  if (u.endsWith(".mov")) return "video/quicktime";
  if (u.endsWith(".jpg") || u.endsWith(".jpeg")) return "image/jpeg";
  return "image/jpeg";
}

function normalizeMedia(input: unknown): NormalizedMedia[] {
  if (!Array.isArray(input)) return [];
  const out: NormalizedMedia[] = [];
  for (const item of input as MediaInput[]) {
    if (typeof item === "string") {
      if (item.startsWith("http")) out.push({ url: item, content_type: guessContentType(item) });
    } else if (item && typeof item === "object" && typeof item.url === "string" && item.url.startsWith("http")) {
      out.push({ url: item.url, content_type: item.content_type || guessContentType(item.url) });
    }
  }
  return out;
}

const retiredSmsSources = new Set([
  "auto-advance-workflow",
  "run-lead-drip",
  "rain_day_blast",
]);

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
        { status: auth.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reqBody = await req.json();
    const {
      to,
      body,
      job_id,
      media_urls,
      client_id,
      // ── Universal SMS fields (accepted from useSendSms hook + legacy callers) ──
      contactName,
      contactType,
      relatedVendorId,
      relatedCustomerId,
      source: bodySource,
      template_key,
    } = reqBody;
    // Some callers (legacy) pass `message` instead of `body`. Accept both.
    const messageBody: string = body ?? reqBody.message ?? "";

    const hasMedia = Array.isArray(media_urls) && media_urls.length > 0;
    if (!to || (!messageBody && !hasMedia)) {
      return new Response(
        JSON.stringify({ error: "Missing 'to' or 'body' (body may be empty only if media_urls supplied)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (!accountSid || !authToken || !fromNumber) {
      return new Response(
        JSON.stringify({ error: "Twilio credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── HITL gate removed ──────────────────────────────────────
    // Header takes precedence; body `source` is a fallback so callers using the
    // universal `useSendSms` hook can pass it without setting custom headers.
    // x-source-function / x-hitl-approved are workflow hints only; authorization
    // above requires staff auth, service-role bearer, or x-internal-function-secret.
    const sourceFunction = req.headers.get("x-source-function") || bodySource || "manual";
    const isManual = sourceFunction === "manual";
    const isInternalCaller = auth.kind === "service_role" || auth.kind === "internal_secret";
    const isHitlApproved = isInternalCaller || req.headers.get("x-hitl-approved") === "true";

    if (retiredSmsSources.has(sourceFunction)) {
      console.log(`Retired SMS trigger blocked: source="${sourceFunction}" to ${to}`);
      return new Response(
        JSON.stringify({ blocked: true, reason: "retired_sms_trigger", source: sourceFunction }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: testModeSetting } = await supabase
      .from("company_settings")
      .select("value")
      .eq("key", "human_in_the_loop")
      .maybeSingle();
    const testingMode = testModeSetting?.value === "true";

    if (!isManual && testingMode && !isHitlApproved) {
      console.log(`Test Mode: blocking AI message from source="${sourceFunction}" to ${to}`);
      return new Response(
        JSON.stringify({ blocked: true, reason: "test_mode_active" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize 'to' to E.164 for consistent storage + strict validation
    const toDigits = String(to).replace(/\D/g, "");
    let normalizedTo = "";
    if (toDigits.length === 10) normalizedTo = `+1${toDigits}`;
    else if (toDigits.length === 11 && toDigits.startsWith("1")) normalizedTo = `+${toDigits}`;
    else if (typeof to === "string" && /^\+[1-9]\d{7,14}$/.test(to.trim())) normalizedTo = to.trim();

    if (!normalizedTo) {
      console.warn(`Invalid 'to' number rejected: ${to}`);
      return new Response(
        JSON.stringify({
          error: "Invalid phone number — must be a valid 10-digit US number or full E.164 (+CCXXXXXXXXXX)",
          provided: to,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Normalize outbound media (preserve real content types) ──
    const outboundMedia: NormalizedMedia[] = normalizeMedia(media_urls);

    // ── PRE-INSERT (speed): write the row FIRST, then send to Twilio ──
    const isAiGenerated = sourceFunction !== "manual";

    const initialInsert: Record<string, unknown> = {
      direction: "outbound",
      phone_number: normalizedTo,
      body: messageBody,
      twilio_sid: null,
      related_job_id: job_id || null,
      delivery_status: "sending",
      to_number: fromNumber,
      client_id: client_id || null,
    };
    if (outboundMedia.length > 0) {
      initialInsert.media_urls = outboundMedia;
    }
    // Persist caller-provided contact metadata up-front so per-vendor /
    // per-customer scoping (useVendorSms, useCustomerSms) works without a
    // second insert. Background contact resolution below will fill gaps.
    if (contactName) initialInsert.contact_name = contactName;
    if (contactType) initialInsert.contact_type = contactType;
    if (relatedVendorId) initialInsert.related_vendor_id = relatedVendorId;
    if (relatedCustomerId) initialInsert.related_customer_id = relatedCustomerId;
    if (sourceFunction) initialInsert.source_function = sourceFunction;
    if (template_key) initialInsert.template_key = template_key;

    const { data: insertedRow, error: insertErr } = await supabase
      .from("sms_log")
      .insert(initialInsert)
      .select("id")
      .single();

    if (insertErr || !insertedRow) {
      console.error("CRITICAL: sms_log pre-insert failed:", JSON.stringify(insertErr));
      return new Response(
        JSON.stringify({ error: "Failed to record SMS" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const smsLogId = insertedRow.id as string;

    // ── Resolve final body (grammar check only) in parallel ──
    const grammarStartedAt = Date.now();
    let grammarTimedOut = false;
    const grammarCheckPromise: Promise<string> = isAiGenerated
      ? (async (): Promise<string> => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            grammarTimedOut = true;
            controller.abort();
          }, 1200);
          try {
            const grammarResp = await fetch(
              `${Deno.env.get("SUPABASE_URL")}/functions/v1/grammar-check`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: messageBody, context: "sms" }),
                signal: controller.signal,
              }
            );
            if (!grammarResp.ok) return messageBody;
            const grammarData = await grammarResp.json();
            return grammarData.corrected || messageBody;
          } catch (grammarErr) {
            console.warn("Grammar check failed/timeout, sending original:", grammarErr);
            return messageBody;
          } finally {
            clearTimeout(timeoutId);
          }
        })()
      : Promise.resolve(messageBody);

    const correctedBody = await grammarCheckPromise;

    // Telemetry: surface grammar-check timeouts so we can detect regressions
    if (isAiGenerated && grammarTimedOut) {
      logApiUsage(supabase, {
        service: "openai_ai",
        function_name: "send-sms",
        endpoint: "grammar-check-timeout",
        estimated_cost_cents: 0,
        metadata: { duration_ms: Date.now() - grammarStartedAt, source: sourceFunction },
      });
    }

    const finalBody = appendSmsSignature(correctedBody || "", 1600);

    // ── Send SMS via Twilio REST API (with retry on transient failures) ──
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const twilioBody = new URLSearchParams({
      To: normalizedTo,
      From: fromNumber,
      Body: finalBody,
      StatusCallback: `${Deno.env.get("SUPABASE_URL")}/functions/v1/sms-status-callback`,
    });
    for (const m of outboundMedia) twilioBody.append("MediaUrl", m.url);

    let twilioResp: Response;
    let twilioData: any;
    try {
      twilioResp = await withRetry(
        async () => {
          const r = await fetch(twilioUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
            },
            body: twilioBody.toString(),
          });
          // Throw on retryable HTTP statuses so withRetry backs off
          if (!r.ok && isRetryable(null, r.status)) {
            const t = await r.text().catch(() => "");
            const err = new Error(`Twilio ${r.status}: ${t.slice(0, 200)}`);
            (err as any).status = r.status;
            throw err;
          }
          return r;
        },
        { maxAttempts: 3 }
      );
      twilioData = await twilioResp.json();
    } catch (transientErr: any) {
      // All retries exhausted — persist for later replay + page on-call
      console.error("Twilio retries exhausted:", transientErr);
      await logSystemError(supabase, {
        source_name: "send-sms",
        error_message: `Twilio unreachable after retries: ${transientErr.message}`,
        severity: "critical",
        context: { to: normalizedTo, sms_log_id: smsLogId, source: sourceFunction },
      });
      await enqueueRetry(supabase, {
        operation_type: "send_sms",
        source_function: "send-sms",
        related_id: smsLogId,
        payload: { to: normalizedTo, body: finalBody, media_urls: outboundMedia, job_id, client_id, sms_log_id: smsLogId },
      });
      await supabase.from("sms_log").update({ delivery_status: "queued_retry", body: finalBody }).eq("id", smsLogId);
      await pageOnCall(supabase, {
        service: "send-sms",
        summary: "Twilio unreachable",
        body: `Could not deliver SMS to ${normalizedTo} after 3 attempts. Queued for retry.`,
        severity: "critical",
        details: { sms_log_id: smsLogId, error: transientErr.message },
      });
      return new Response(
        JSON.stringify({ queued: true, sms_log_id: smsLogId, reason: "twilio_transient" }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const segments = Math.ceil((finalBody.length || 1) / 160);
    logApiUsage(supabase, {
      service: "twilio_sms",
      function_name: "send-sms",
      endpoint: "Messages.json",
      estimated_cost_cents: Math.round(segments * 0.79),
      metadata: { segments, mms: outboundMedia.length > 0 },
    });

    if (!twilioResp.ok) {
      console.error("Twilio error:", twilioData);
      // Telemetry: log Twilio error code for regression detection
      logApiUsage(supabase, {
        service: "twilio_sms",
        function_name: "send-sms",
        endpoint: "Messages.json:error",
        estimated_cost_cents: 0,
        metadata: {
          status: twilioResp.status,
          code: twilioData?.code,
          message: twilioData?.message,
          to: normalizedTo,
        },
      });
      await supabase
        .from("sms_log")
        .update({ delivery_status: "failed", body: finalBody })
        .eq("id", smsLogId);
      return new Response(
        JSON.stringify({ error: twilioData.message || "Twilio send failed", code: twilioData?.code }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Update row with twilio_sid + final body (with footer/grammar) ──
    const { error: updateErr } = await supabase
      .from("sms_log")
      .update({
        twilio_sid: twilioData.sid,
        body: finalBody,
        num_segments: segments,
        delivery_status: "sent",
        source_function: sourceFunction,
        template_key: template_key || null,
      })
      .eq("id", smsLogId);
    if (updateErr) console.error("sms_log post-send update failed:", updateErr);

    // ── Auto-dismiss lead-triage action_items for this recipient (best-effort) ──
    (globalThis as any).EdgeRuntime?.waitUntil((async () => {
      try {
        const last10 = normalizedTo.replace(/\D/g, "").slice(-10);
        if (last10.length !== 10) return;
        const { data: matches } = await supabase
          .from("action_items")
          .select("id, customer_phone, metadata")
          .eq("status", "pending")
          .in("category", ["new_lead", "new_appointment", "missed_call", "follow_up", "thread_attention", "schedule_change", "eta_request", "access_note", "pet_warning", "contact_update", "reschedule", "confirmation", "dispatch_callback"]);
        const toResolve = (matches || []).filter((row: any) => {
          const d = String(row.customer_phone || "").replace(/\D/g, "").slice(-10);
          return d === last10;
        });
        if (toResolve.length === 0) return;
        await supabase
          .from("action_items")
          .update({
            status: "dismissed",
            resolved_at: new Date().toISOString(),
            metadata: { resolved_reason: "outbound_sms_sent", source: sourceFunction, sms_log_id: smsLogId },
          })
          .in("id", toResolve.map((r: any) => r.id));
        console.log(`Auto-dismissed ${toResolve.length} action_item(s) for ${last10} on outbound SMS`);
      } catch (e) {
        console.warn("Auto-dismiss action_items failed:", e);
      }
    })());

    // ── Resolve contact in the background (non-blocking) ──
    // Skip resolution entirely if the caller already provided contactName +
    // contactType (Vendor compose, etc.) — we already persisted those above.
    if (!contactName || contactType === undefined) {
      (globalThis as any).EdgeRuntime?.waitUntil((async () => {
        try {
          const { resolveContact } = await import("../_shared/resolveContact.ts");
          let { contactName: resolvedName, contactType: resolvedType } = await resolveContact(supabase, normalizedTo);
          if (!resolvedName && job_id) {
            const { data: jobRow } = await supabase
              .from("jobs")
              .select("customer_name")
              .eq("id", job_id)
              .maybeSingle();
            if (jobRow?.customer_name) {
              resolvedName = jobRow.customer_name;
              resolvedType = "customer";
            }
          }
          if (resolvedName || resolvedType !== "unknown") {
            await supabase
              .from("sms_log")
              .update({ contact_name: resolvedName, contact_type: resolvedType })
              .eq("id", smsLogId);
          }
        } catch (e) {
          console.warn("Background contact resolution failed:", e);
        }
      })());
    }

    return new Response(
      JSON.stringify({ success: true, sid: twilioData.sid, sms_log_id: smsLogId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Send SMS error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
