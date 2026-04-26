/**
 * Shared resilience helpers for edge functions.
 *
 *  • withRetry      — exponential backoff for transient failures
 *  • logSystemError — write a row to public.system_error_log
 *  • enqueueRetry   — push a failed op into public.retry_queue for later replay
 *  • pageOnCall     — fire a critical SMS to the on-call admin via Twilio direct
 *
 * All functions are non-throwing on the *logging* side: a failure to log
 * should never bring down the parent request. The original error is always
 * surfaced to the caller via withRetry's promise rejection.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SupaClient = any;

// ── Tunables ────────────────────────────────────────────────────────────────
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 400;   // 400, 800, 1600 …
const DEFAULT_MAX_DELAY_MS = 4000;

// On-call number is loaded from secrets at runtime, so we don't hard-code it.
const ONCALL_SECRET_KEY = "ONCALL_ADMIN_PHONE";

// ── Sleep ───────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Retry classifier ────────────────────────────────────────────────────────
/** Decide if an error is worth retrying. Network errors + 5xx + 429 = retry. */
export function isRetryable(err: unknown, status?: number): boolean {
  if (typeof status === "number") {
    if (status === 429) return true;
    if (status >= 500 && status <= 599) return true;
    return false;
  }
  // No status → likely a thrown network error / timeout / DNS
  const msg = (err as Error)?.message?.toLowerCase() ?? "";
  return (
    msg.includes("timeout") ||
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    msg.includes("connection") ||
    msg.includes("econn") ||
    msg.includes("socket")
  );
}

// ── withRetry ───────────────────────────────────────────────────────────────
export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Optional classifier override. Receives (err, status?). */
  shouldRetry?: (err: unknown, status?: number) => boolean;
  /** Called on each failed attempt (1-indexed). */
  onAttemptFail?: (attempt: number, err: unknown) => void;
}

/**
 * Run `fn` with exponential backoff. `fn` may return any value; if it throws
 * (or returns a Response with a retryable status when wrapped), it will be
 * retried up to maxAttempts times.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const max = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const base = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const cap = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const classify = opts.shouldRetry ?? ((e) => isRetryable(e));

  let lastErr: unknown;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      opts.onAttemptFail?.(attempt, err);
      if (attempt === max || !classify(err)) break;
      const delay = Math.min(cap, base * Math.pow(2, attempt - 1));
      // Add ±20% jitter
      const jitter = delay * (0.8 + Math.random() * 0.4);
      await sleep(jitter);
    }
  }
  throw lastErr;
}

/**
 * Convenience for fetch() — retries on network error or retryable status.
 * Returns the final Response (which may still be a non-retryable error).
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: RetryOptions = {}
): Promise<Response> {
  return withRetry(async () => {
    const resp = await fetch(url, init);
    if (!resp.ok && isRetryable(null, resp.status)) {
      // Throw so withRetry can apply backoff. Surface the body for debugging.
      const text = await resp.text().catch(() => "");
      const err = new Error(`HTTP ${resp.status}: ${text.slice(0, 300)}`);
      (err as any).status = resp.status;
      throw err;
    }
    return resp;
  }, opts);
}

// ── logSystemError ──────────────────────────────────────────────────────────
export interface SystemErrorPayload {
  source_name: string;            // e.g. "send-sms"
  error_message: string;
  severity?: "info" | "warning" | "error" | "critical";
  stack_trace?: string | null;
  context?: Record<string, unknown>;
  http_status?: number | null;
}

export async function logSystemError(
  supabase: SupaClient,
  p: SystemErrorPayload
): Promise<void> {
  try {
    await supabase.rpc("log_system_error", {
      p_source_type: "edge_function",
      p_source_name: p.source_name,
      p_error_message: p.error_message,
      p_severity: p.severity ?? "error",
      p_stack_trace: p.stack_trace ?? null,
      p_context: p.context ?? {},
      p_http_status: p.http_status ?? null,
    });
  } catch (e) {
    // Logging itself failed — last resort: stderr only.
    console.error("[resilience] logSystemError failed:", e, "original:", p);
  }
}

// ── enqueueRetry ────────────────────────────────────────────────────────────
export interface EnqueueRetryPayload {
  operation_type: string;          // e.g. "send_sms", "upload_to_hcp"
  payload: Record<string, unknown>;
  source_function?: string;
  related_id?: string;
  max_attempts?: number;
  initial_delay_seconds?: number;
}

export async function enqueueRetry(
  supabase: SupaClient,
  p: EnqueueRetryPayload
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc("enqueue_retry", {
      p_operation_type: p.operation_type,
      p_payload: p.payload,
      p_source_function: p.source_function ?? null,
      p_related_id: p.related_id ?? null,
      p_max_attempts: p.max_attempts ?? 5,
      p_initial_delay_seconds: p.initial_delay_seconds ?? 30,
    });
    if (error) throw error;
    return (data as string) ?? null;
  } catch (e) {
    console.error("[resilience] enqueueRetry failed:", e);
    await logSystemError(supabase, {
      source_name: p.source_function ?? "enqueueRetry",
      error_message: `Failed to enqueue retry: ${(e as Error).message}`,
      severity: "critical",
      context: { operation_type: p.operation_type, payload: p.payload },
    });
    return null;
  }
}

// ── pageOnCall (critical SMS to admin) ──────────────────────────────────────
/**
 * Send a critical alert SMS to the on-call admin number stored in secrets.
 *
 * Goes DIRECT to the Twilio REST API (not through send-sms) so it works even
 * when send-sms itself is broken. Also records the page in public.oncall_alerts
 * with 30-minute (service+summary) dedup so we don't spam during a storm.
 */
export async function pageOnCall(
  supabase: SupaClient,
  opts: {
    service: string;                // 'send-sms' | 'hcp_sync' | 'stripe' | etc.
    summary: string;                // Short, used for dedup
    body?: string;                  // Optional longer detail (joins summary in SMS)
    severity?: "high" | "critical";
    details?: Record<string, unknown>;
    related_error_id?: string | null;
    dedupWindowMinutes?: number;    // default 30
  }
): Promise<void> {
  const dedupMin = opts.dedupWindowMinutes ?? 30;
  const dedupKey = `${opts.service}:${opts.summary}`.slice(0, 200);

  try {
    // Dedup: skip if same key is still within its dedup_until
    const { data: recent } = await supabase
      .from("oncall_alerts")
      .select("id")
      .eq("dedup_key", dedupKey)
      .gt("dedup_until", new Date().toISOString())
      .limit(1);
    if (recent && recent.length > 0) {
      console.warn(`[resilience] Suppressing duplicate page: ${dedupKey}`);
      return;
    }

    const to = Deno.env.get(ONCALL_SECRET_KEY);
    const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const tok = Deno.env.get("TWILIO_AUTH_TOKEN");
    const from = Deno.env.get("TWILIO_PHONE_NUMBER");

    const dedup_until = new Date(Date.now() + dedupMin * 60_000).toISOString();

    if (!to || !sid || !tok || !from) {
      console.error("[resilience] pageOnCall missing config", {
        hasTo: !!to, hasSid: !!sid, hasTok: !!tok, hasFrom: !!from,
      });
      await supabase.from("oncall_alerts").insert({
        service: opts.service,
        summary: opts.summary,
        details: opts.details ?? {},
        severity: opts.severity ?? "critical",
        related_error_id: opts.related_error_id ?? null,
        dedup_key: dedupKey,
        dedup_until,
        notification_status: "suppressed",
        notification_error: "missing twilio/oncall config",
      });
      return;
    }

    const messageBody =
      `🚨 [${(opts.severity ?? "critical").toUpperCase()}] ${opts.service}\n` +
      `${opts.summary}` +
      (opts.body ? `\n${opts.body}` : "");

    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const tw = new URLSearchParams({
      To: to,
      From: from,
      Body: messageBody.slice(0, 1500),
    });
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + btoa(`${sid}:${tok}`),
      },
      body: tw.toString(),
    });
    const data = await resp.json().catch(() => ({}));

    await supabase.from("oncall_alerts").insert({
      service: opts.service,
      summary: opts.summary,
      details: opts.details ?? {},
      severity: opts.severity ?? "critical",
      related_error_id: opts.related_error_id ?? null,
      notified_phone: to,
      dedup_key: dedupKey,
      dedup_until,
      notification_status: resp.ok ? "sent" : "failed",
      notification_error: resp.ok ? null : JSON.stringify(data).slice(0, 500),
    });

    if (!resp.ok) {
      console.error("[resilience] pageOnCall Twilio error:", data);
    }
  } catch (e) {
    console.error("[resilience] pageOnCall threw:", e);
  }
}
