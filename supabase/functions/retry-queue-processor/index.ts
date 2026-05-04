/**
 * retry-queue-processor
 *
 * Drains public.retry_queue. Designed to be invoked by a cron job every minute.
 * For each due row (status='pending' AND next_attempt_at <= now()):
 *   1. Calls the appropriate edge function based on operation_type.
 *   2. On success → marks status='succeeded', stamps succeeded_at.
 *   3. On failure → increments attempts, schedules next_attempt_at with
 *      exponential backoff. After max_attempts → status='dead_letter' and
 *      pages on-call.
 *
 * Operation types currently handled:
 *   • send_sms       — replays send-sms with the original payload
 *   • upload_to_hcp  — replays upload-to-hcp
 *
 * Add new operation_type handlers by extending the OPERATION_HANDLERS map.
 */
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { logSystemError, pageOnCall } from "../_shared/resilience.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BATCH_SIZE = 25;

type RetryRow = {
  id: string;
  operation_type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  source_function: string | null;
  related_id: string | null;
};

type Handler = (row: RetryRow) => Promise<{ ok: true } | { ok: false; error: string }>;

const callEdgeFunction = async (name: string, body: unknown) => {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "x-source-function": "retry-queue-processor",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    return { ok: false as const, error: `HTTP ${resp.status}: ${t.slice(0, 300)}` };
  }
  return { ok: true as const };
};

const OPERATION_HANDLERS: Record<string, Handler> = {
  send_sms: (row) => callEdgeFunction("send-sms", row.payload),
  upload_to_hcp: (row) => callEdgeFunction("upload-to-hcp", row.payload),
};

/** 30s, 2m, 8m, 30m, 2h … capped at 6h. */
const nextDelaySeconds = (attempt: number): number => {
  const base = 30;
  const delay = base * Math.pow(4, attempt);
  return Math.min(delay, 6 * 60 * 60);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = getSupabaseAdmin();
  const startedAt = Date.now();

  // Cron heartbeat: track this run
  let runId: string | null = null;
  try {
    const { data } = await supabase.rpc("begin_cron_run", {
      p_job_name: "retry-queue-processor",
      p_metadata: {},
    });
    runId = data as string;
  } catch (e) {
    console.warn("begin_cron_run failed:", e);
  }

  try {
    // Fetch a batch of due rows
    const { data: rows, error } = await supabase
      .from("retry_queue")
      .select("id, operation_type, payload, attempts, max_attempts, source_function, related_id")
      .eq("status", "pending")
      .lte("next_attempt_at", new Date().toISOString())
      .order("next_attempt_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) throw error;
    const batch: RetryRow[] = (rows ?? []) as RetryRow[];

    let succeeded = 0;
    let failed = 0;
    let deadLettered = 0;

    for (const row of batch) {
      const handler = OPERATION_HANDLERS[row.operation_type];
      if (!handler) {
        await supabase
          .from("retry_queue")
          .update({
            status: "dead_letter",
            dead_lettered_at: new Date().toISOString(),
            last_error: `unknown operation_type: ${row.operation_type}`,
            last_attempt_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        await logSystemError(supabase, {
          source_name: "retry-queue-processor",
          error_message: `Unknown operation_type in retry_queue: ${row.operation_type}`,
          severity: "warning",
          context: { row_id: row.id },
        });
        deadLettered++;
        continue;
      }

      const newAttempts = row.attempts + 1;
      let result: { ok: true } | { ok: false; error: string };
      try {
        result = await handler(row);
      } catch (e: any) {
        result = { ok: false, error: e?.message ?? String(e) };
      }

      if (result.ok) {
        await supabase
          .from("retry_queue")
          .update({
            status: "succeeded",
            succeeded_at: new Date().toISOString(),
            attempts: newAttempts,
            last_attempt_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", row.id);
        succeeded++;
        continue;
      }

      // Failure path
      if (newAttempts >= row.max_attempts) {
        await supabase
          .from("retry_queue")
          .update({
            status: "dead_letter",
            dead_lettered_at: new Date().toISOString(),
            attempts: newAttempts,
            last_attempt_at: new Date().toISOString(),
            last_error: result.error,
          })
          .eq("id", row.id);
        deadLettered++;
        await logSystemError(supabase, {
          source_name: "retry-queue-processor",
          error_message: `Dead-lettered after ${newAttempts} attempts: ${result.error}`,
          severity: "critical",
          context: { row_id: row.id, operation_type: row.operation_type, related_id: row.related_id },
        });
        await pageOnCall(supabase, {
          service: row.source_function ?? row.operation_type,
          summary: `Retry exhausted: ${row.operation_type}`,
          body: `Operation dead-lettered after ${newAttempts} attempts.\n${result.error.slice(0, 200)}`,
          severity: "critical",
          details: { retry_id: row.id, related_id: row.related_id },
        });
      } else {
        const next = new Date(Date.now() + nextDelaySeconds(newAttempts) * 1000).toISOString();
        await supabase
          .from("retry_queue")
          .update({
            attempts: newAttempts,
            next_attempt_at: next,
            last_attempt_at: new Date().toISOString(),
            last_error: result.error,
          })
          .eq("id", row.id);
        failed++;
      }
    }

    if (runId) {
      await supabase.rpc("finish_cron_run", {
        p_run_id: runId,
        p_status: "success",
        p_rows_processed: batch.length,
        p_metadata: { succeeded, failed_retry_scheduled: failed, dead_lettered: deadLettered },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        scanned: batch.length,
        succeeded,
        failed_retry_scheduled: failed,
        dead_lettered: deadLettered,
        duration_ms: Date.now() - startedAt,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("retry-queue-processor fatal:", err);
    if (runId) {
      try {
        await supabase.rpc("finish_cron_run", {
          p_run_id: runId,
          p_status: "error",
          p_error_message: err?.message ?? String(err),
        });
      } catch (_) { /* ignore */ }
    }
    await logSystemError(supabase, {
      source_name: "retry-queue-processor",
      error_message: err?.message ?? String(err),
      severity: "critical",
    });
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
