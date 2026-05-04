
-- ============================================
-- SESSION 1: MISSION CONTROL FOUNDATION TABLES
-- ============================================

-- 1) System error log — central catch-all for edge fn / trigger failures
CREATE TABLE IF NOT EXISTS public.system_error_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source_type text NOT NULL,                  -- 'edge_function' | 'trigger' | 'cron' | 'client'
  source_name text NOT NULL,                  -- function name, trigger name, cron name
  severity text NOT NULL DEFAULT 'error',     -- 'critical' | 'error' | 'warning' | 'info'
  error_message text NOT NULL,
  stack_trace text,
  context jsonb DEFAULT '{}'::jsonb,          -- request body, ids, user, etc.
  http_status int,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text,
  alerted boolean NOT NULL DEFAULT false      -- has on-call been notified?
);

CREATE INDEX IF NOT EXISTS idx_system_error_log_occurred ON public.system_error_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_error_log_unresolved ON public.system_error_log (occurred_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_system_error_log_source ON public.system_error_log (source_type, source_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_error_log_severity ON public.system_error_log (severity, occurred_at DESC) WHERE resolved_at IS NULL;

ALTER TABLE public.system_error_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read errors" ON public.system_error_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update errors" ON public.system_error_log
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- service_role inserts bypass RLS

-- 2) Cron job runs — track every scheduled execution
CREATE TABLE IF NOT EXISTS public.cron_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',     -- 'running' | 'success' | 'failed' | 'timeout'
  duration_ms int,
  rows_processed int,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_cron_job_runs_job_started ON public.cron_job_runs (job_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_job_runs_failed ON public.cron_job_runs (started_at DESC) WHERE status IN ('failed', 'timeout');

ALTER TABLE public.cron_job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read cron runs" ON public.cron_job_runs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3) Service health snapshots — periodic latency/error-rate samples per external API
CREATE TABLE IF NOT EXISTS public.service_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL,                       -- 'twilio' | 'stripe' | 'hcp' | 'sendgrid' | 'google' | 'deepgram' | 'fcm' | 'lovable_ai'
  endpoint text,                               -- optional sub-endpoint
  status text NOT NULL,                        -- 'healthy' | 'degraded' | 'down'
  latency_ms int,
  http_status int,
  error_message text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_service_health_recorded ON public.service_health_snapshots (service, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_health_unhealthy ON public.service_health_snapshots (recorded_at DESC) WHERE status <> 'healthy';

ALTER TABLE public.service_health_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read service health" ON public.service_health_snapshots
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4) Push delivery log — per-device FCM result
CREATE TABLE IF NOT EXISTS public.push_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  device_token text,
  title text,
  body text,
  data jsonb,
  fcm_message_id text,
  delivery_status text NOT NULL,               -- 'sent' | 'failed' | 'invalid_token' | 'rate_limited'
  fcm_error text,
  http_status int,
  source_function text,
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_push_delivery_sent ON public.push_delivery_log (sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_delivery_failed ON public.push_delivery_log (sent_at DESC) WHERE delivery_status <> 'sent';
CREATE INDEX IF NOT EXISTS idx_push_delivery_user ON public.push_delivery_log (user_id, sent_at DESC);

ALTER TABLE public.push_delivery_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read push log" ON public.push_delivery_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5) Retry queue — durable backoff for failed external API calls
CREATE TABLE IF NOT EXISTS public.retry_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  operation_type text NOT NULL,                -- 'send_sms' | 'send_email' | 'hcp_sync' | 'stripe_charge' | etc.
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',      -- 'pending' | 'processing' | 'success' | 'dead_letter'
  last_error text,
  last_attempt_at timestamptz,
  succeeded_at timestamptz,
  dead_lettered_at timestamptz,
  related_id text,                             -- foreign reference (job_id, customer_id, etc.)
  source_function text
);

CREATE INDEX IF NOT EXISTS idx_retry_queue_due ON public.retry_queue (next_attempt_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_retry_queue_status ON public.retry_queue (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retry_queue_dead ON public.retry_queue (dead_lettered_at DESC) WHERE status = 'dead_letter';

ALTER TABLE public.retry_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read retry queue" ON public.retry_queue
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update retry queue" ON public.retry_queue
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 6) On-call alerts — record of SMS sent to admin when critical systems fail
CREATE TABLE IF NOT EXISTS public.oncall_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_at timestamptz NOT NULL DEFAULT now(),
  severity text NOT NULL,                      -- 'critical' | 'high'
  service text NOT NULL,
  summary text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  related_error_id uuid REFERENCES public.system_error_log(id) ON DELETE SET NULL,
  notified_phone text,
  notification_status text NOT NULL DEFAULT 'pending',  -- 'pending' | 'sent' | 'failed' | 'suppressed'
  notification_error text,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  resolved_at timestamptz,
  -- Dedup window: a (service + summary_key) shouldn't re-page within 30 min
  dedup_key text NOT NULL,
  dedup_until timestamptz NOT NULL DEFAULT (now() + interval '30 minutes')
);

CREATE INDEX IF NOT EXISTS idx_oncall_alerts_triggered ON public.oncall_alerts (triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_oncall_alerts_active ON public.oncall_alerts (triggered_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_oncall_alerts_dedup ON public.oncall_alerts (dedup_key, dedup_until);

ALTER TABLE public.oncall_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read oncall alerts" ON public.oncall_alerts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update oncall alerts" ON public.oncall_alerts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- HELPER: log_system_error() — callable from triggers and (via RPC) edge fns
-- ============================================
CREATE OR REPLACE FUNCTION public.log_system_error(
  p_source_type text,
  p_source_name text,
  p_error_message text,
  p_severity text DEFAULT 'error',
  p_stack_trace text DEFAULT NULL,
  p_context jsonb DEFAULT '{}'::jsonb,
  p_http_status int DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  INSERT INTO public.system_error_log
    (source_type, source_name, severity, error_message, stack_trace, context, http_status)
  VALUES
    (p_source_type, p_source_name, p_severity, p_error_message, p_stack_trace, p_context, p_http_status)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_system_error(text, text, text, text, text, jsonb, int) TO authenticated, service_role;

-- ============================================
-- HELPER: enqueue_retry() — push a failed op to the retry queue
-- ============================================
CREATE OR REPLACE FUNCTION public.enqueue_retry(
  p_operation_type text,
  p_payload jsonb,
  p_source_function text DEFAULT NULL,
  p_related_id text DEFAULT NULL,
  p_max_attempts int DEFAULT 5,
  p_initial_delay_seconds int DEFAULT 30
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  INSERT INTO public.retry_queue
    (operation_type, payload, source_function, related_id, max_attempts, next_attempt_at)
  VALUES
    (p_operation_type, p_payload, p_source_function, p_related_id, p_max_attempts, now() + (p_initial_delay_seconds || ' seconds')::interval)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_retry(text, jsonb, text, text, int, int) TO authenticated, service_role;
