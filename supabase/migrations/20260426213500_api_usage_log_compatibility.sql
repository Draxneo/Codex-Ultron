-- Bring the live UltraOffice2.0 API cost table up to the shape expected by
-- the shared edge-function logger, while keeping older columns intact.

ALTER TABLE public.api_usage_log
  ADD COLUMN IF NOT EXISTS service text,
  ADD COLUMN IF NOT EXISTS endpoint text,
  ADD COLUMN IF NOT EXISTS tokens_used integer,
  ADD COLUMN IF NOT EXISTS estimated_cost_cents numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata jsonb;

UPDATE public.api_usage_log
SET
  service = COALESCE(service, model, 'unknown'),
  tokens_used = COALESCE(tokens_used, COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)),
  estimated_cost_cents = COALESCE(estimated_cost_cents, cost, 0)
WHERE service IS NULL
   OR tokens_used IS NULL
   OR estimated_cost_cents IS NULL;

CREATE INDEX IF NOT EXISTS idx_api_usage_log_service ON public.api_usage_log (service);
CREATE INDEX IF NOT EXISTS idx_api_usage_log_created_at ON public.api_usage_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_log_function ON public.api_usage_log (function_name);

CREATE OR REPLACE FUNCTION public.cleanup_operational_logs(
  p_api_detail_days integer DEFAULT 14,
  p_trace_days integer DEFAULT 7,
  p_health_days integer DEFAULT 7,
  p_push_days integer DEFAULT 14,
  p_cron_days integer DEFAULT 30,
  p_resolved_error_days integer DEFAULT 90,
  p_rollup_days integer DEFAULT 400
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_api_rolled integer := 0;
  v_api_deleted integer := 0;
  v_trace_deleted integer := 0;
  v_health_deleted integer := 0;
  v_push_deleted integer := 0;
  v_cron_deleted integer := 0;
  v_error_deleted integer := 0;
  v_rollup_deleted integer := 0;
BEGIN
  WITH rollup AS (
    SELECT
      created_at::date AS day,
      COALESCE(service, model, 'unknown') AS service,
      COALESCE(function_name, 'unknown') AS function_name,
      COALESCE(endpoint, '') AS endpoint,
      count(*)::integer AS call_count,
      COALESCE(sum(COALESCE(estimated_cost_cents, cost, 0)), 0) AS total_cost_cents,
      COALESCE(sum(COALESCE(tokens_used, COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0))), 0)::bigint AS tokens_total,
      min(created_at) AS first_seen_at,
      max(created_at) AS last_seen_at
    FROM public.api_usage_log
    WHERE created_at < now() - make_interval(days => p_api_detail_days)
    GROUP BY
      created_at::date,
      COALESCE(service, model, 'unknown'),
      COALESCE(function_name, 'unknown'),
      COALESCE(endpoint, '')
  ),
  upserted AS (
    INSERT INTO public.api_usage_daily_rollups (
      day,
      service,
      function_name,
      endpoint,
      call_count,
      total_cost_cents,
      tokens_total,
      first_seen_at,
      last_seen_at,
      last_rolled_up_at
    )
    SELECT
      day,
      service,
      function_name,
      endpoint,
      call_count,
      total_cost_cents,
      tokens_total,
      first_seen_at,
      last_seen_at,
      now()
    FROM rollup
    ON CONFLICT (day, service, function_name, endpoint)
    DO UPDATE SET
      call_count = EXCLUDED.call_count,
      total_cost_cents = EXCLUDED.total_cost_cents,
      tokens_total = EXCLUDED.tokens_total,
      first_seen_at = EXCLUDED.first_seen_at,
      last_seen_at = EXCLUDED.last_seen_at,
      last_rolled_up_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_api_rolled FROM upserted;

  DELETE FROM public.api_usage_log
  WHERE created_at < now() - make_interval(days => p_api_detail_days);
  GET DIAGNOSTICS v_api_deleted = ROW_COUNT;

  DELETE FROM public.system_trace_events
  WHERE occurred_at < now() - make_interval(days => p_trace_days);
  GET DIAGNOSTICS v_trace_deleted = ROW_COUNT;

  DELETE FROM public.service_health_snapshots
  WHERE recorded_at < now() - make_interval(days => p_health_days);
  GET DIAGNOSTICS v_health_deleted = ROW_COUNT;

  DELETE FROM public.push_delivery_log
  WHERE sent_at < now() - make_interval(days => p_push_days);
  GET DIAGNOSTICS v_push_deleted = ROW_COUNT;

  DELETE FROM public.cron_job_runs
  WHERE started_at < now() - make_interval(days => p_cron_days);
  GET DIAGNOSTICS v_cron_deleted = ROW_COUNT;

  DELETE FROM public.system_error_log
  WHERE resolved_at IS NOT NULL
    AND occurred_at < now() - make_interval(days => p_resolved_error_days);
  GET DIAGNOSTICS v_error_deleted = ROW_COUNT;

  DELETE FROM public.api_usage_daily_rollups
  WHERE day < (current_date - p_rollup_days);
  GET DIAGNOSTICS v_rollup_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'api_rollups_written', v_api_rolled,
    'api_detail_deleted', v_api_deleted,
    'system_trace_deleted', v_trace_deleted,
    'service_health_deleted', v_health_deleted,
    'push_delivery_deleted', v_push_deleted,
    'cron_heartbeat_deleted', v_cron_deleted,
    'resolved_error_deleted', v_error_deleted,
    'old_rollup_deleted', v_rollup_deleted
  );
END;
$$;
