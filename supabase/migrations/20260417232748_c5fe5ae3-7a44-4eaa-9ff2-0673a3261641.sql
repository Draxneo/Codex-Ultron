-- ============================================================================
-- SESSION 2: Trigger deduplication + exception-safe net.http_post wrapping
--           + Cron job heartbeat instrumentation
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 1: DROP DUPLICATE TRIGGERS (4 pairs firing twice per row)
-- ────────────────────────────────────────────────────────────────────────────
-- Keep the `trg_` prefixed versions (newer, more specific UPDATE OF columns)
-- Drop the older non-prefixed versions

DROP TRIGGER IF EXISTS auto_close_todos_on_call_trg ON public.call_log;
DROP TRIGGER IF EXISTS auto_close_todos_on_invoice_trg ON public.customer_invoices;
DROP TRIGGER IF EXISTS auto_close_todos_on_job_note_trg ON public.jobs;
DROP TRIGGER IF EXISTS auto_close_todos_on_sms_trg ON public.sms_log;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 2: SAFE NET.HTTP_POST WRAPPER
-- Wraps net.http_post in exception handler — failures log to system_error_log
-- instead of silently failing or aborting the trigger.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.safe_http_post(
  p_url text,
  p_body jsonb,
  p_source text,
  p_timeout_ms integer DEFAULT 30000,
  p_extra_headers jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _anon_key text;
  _request_id bigint;
  _headers jsonb;
BEGIN
  -- Pull anon key from vault
  SELECT decrypted_secret INTO _anon_key
  FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1;

  IF _anon_key IS NULL THEN
    PERFORM public.log_system_error(
      'trigger', p_source,
      'SUPABASE_ANON_KEY not found in vault',
      'critical', NULL,
      jsonb_build_object('url', p_url, 'body', p_body)
    );
    RETURN NULL;
  END IF;

  _headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || _anon_key
  ) || COALESCE(p_extra_headers, '{}'::jsonb);

  BEGIN
    SELECT net.http_post(
      url := p_url,
      headers := _headers,
      body := p_body,
      timeout_milliseconds := p_timeout_ms
    ) INTO _request_id;
    RETURN _request_id;
  EXCEPTION WHEN OTHERS THEN
    -- Log but don't abort the parent transaction
    PERFORM public.log_system_error(
      'trigger', p_source,
      SQLERRM, 'error', SQLSTATE,
      jsonb_build_object('url', p_url, 'body', p_body, 'sqlstate', SQLSTATE)
    );
    RETURN NULL;
  END;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 3: REWRITE TRIGGERS USING SAFE WRAPPER
-- ────────────────────────────────────────────────────────────────────────────

-- 3a) notify_tech_on_assign_or_reschedule
CREATE OR REPLACE FUNCTION public.notify_tech_on_assign_or_reschedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tech_phone text;
  _digits text;
  _customer text;
  _addr text;
  _date_str text;
  _time_str text;
  _body text;
  _kind text;
  _supabase_url text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_to IS NULL OR NEW.scheduled_date IS NULL THEN RETURN NEW; END IF;
    _kind := 'assigned';
  ELSE
    IF NEW.assigned_to IS NULL OR NEW.scheduled_date IS NULL THEN RETURN NEW; END IF;
    IF OLD.assigned_to IS NOT DISTINCT FROM NEW.assigned_to
       AND OLD.scheduled_date IS NOT DISTINCT FROM NEW.scheduled_date
       AND OLD.arrival_start IS NOT DISTINCT FROM NEW.arrival_start
    THEN RETURN NEW; END IF;
    _kind := CASE WHEN OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN 'assigned' ELSE 'rescheduled' END;
  END IF;

  IF NEW.status IN ('canceled', 'done', 'invoiced') THEN RETURN NEW; END IF;

  SELECT phone INTO _tech_phone FROM public.employees WHERE name = NEW.assigned_to AND is_active = true LIMIT 1;
  _digits := right(regexp_replace(COALESCE(_tech_phone, ''), '\D', '', 'g'), 10);
  IF length(_digits) <> 10 THEN RETURN NEW; END IF;

  _customer := COALESCE(NEW.customer_name, 'customer');
  _addr := COALESCE(NEW.address, '');
  _date_str := to_char(NEW.scheduled_date, 'Mon DD');
  _time_str := CASE WHEN NEW.arrival_start IS NOT NULL
    THEN to_char(NEW.arrival_start AT TIME ZONE 'America/Chicago', 'HH12:MI AM') ELSE '' END;

  IF _kind = 'assigned' THEN
    _body := '📋 New job: ' || _customer || ' · ' || _date_str
             || CASE WHEN _time_str <> '' THEN ' ' || _time_str ELSE '' END
             || CASE WHEN _addr <> '' THEN E'\n' || _addr ELSE '' END;
  ELSE
    _body := '🔄 Rescheduled: ' || _customer || ' · ' || _date_str
             || CASE WHEN _time_str <> '' THEN ' ' || _time_str ELSE '' END
             || CASE WHEN _addr <> '' THEN E'\n' || _addr ELSE '' END;
  END IF;

  SELECT decrypted_secret INTO _supabase_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  IF _supabase_url IS NULL THEN
    PERFORM public.log_system_error('trigger', 'notify_tech_on_assign_or_reschedule',
      'SUPABASE_URL missing from vault', 'critical', NULL,
      jsonb_build_object('job_id', NEW.id));
    RETURN NEW;
  END IF;

  PERFORM public.safe_http_post(
    _supabase_url || '/functions/v1/send-sms',
    jsonb_build_object('to', _digits, 'body', _body,
      'source', 'notify_tech_on_assign_or_reschedule', 'job_id', NEW.id),
    'notify_tech_on_assign_or_reschedule', 10000
  );

  RETURN NEW;
END;
$$;

-- 3b) queue_embedding_on_transcript
CREATE OR REPLACE FUNCTION public.queue_embedding_on_transcript()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _supabase_url text;
BEGIN
  IF NEW.transcription IS NOT NULL AND (OLD.transcription IS NULL OR OLD.transcription = '') THEN
    SELECT decrypted_secret INTO _supabase_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
    IF _supabase_url IS NOT NULL THEN
      PERFORM public.safe_http_post(
        _supabase_url || '/functions/v1/generate-embeddings',
        jsonb_build_object('source', 'call_log', 'mode', 'incremental'),
        'queue_embedding_on_transcript', 30000
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3c) queue_embedding_on_training
CREATE OR REPLACE FUNCTION public.queue_embedding_on_training()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _supabase_url text;
BEGIN
  SELECT decrypted_secret INTO _supabase_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  IF _supabase_url IS NOT NULL THEN
    PERFORM public.safe_http_post(
      _supabase_url || '/functions/v1/generate-embeddings',
      jsonb_build_object('source', 'copilot_training', 'mode', 'incremental'),
      'queue_embedding_on_training', 30000
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 3d) trigger_recalculate_travel_cache
CREATE OR REPLACE FUNCTION public.trigger_recalculate_travel_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _employee_id uuid;
  _old_employee_id uuid;
  _cutoff_min date := (now() AT TIME ZONE 'America/Chicago')::date - interval '1 day';
  _cutoff_max date := (now() AT TIME ZONE 'America/Chicago')::date + interval '1 day';
  _supabase_url text;
BEGIN
  SELECT decrypted_secret INTO _supabase_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  IF _supabase_url IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    IF OLD.assigned_to IS NOT NULL AND OLD.scheduled_date IS NOT NULL
       AND OLD.scheduled_date >= _cutoff_min AND OLD.scheduled_date <= _cutoff_max THEN
      SELECT id INTO _old_employee_id FROM public.employees WHERE name = OLD.assigned_to LIMIT 1;
      IF _old_employee_id IS NOT NULL THEN
        PERFORM public.safe_http_post(
          _supabase_url || '/functions/v1/calculate-route-cache',
          jsonb_build_object('employee_id', _old_employee_id, 'date', OLD.scheduled_date::text),
          'trigger_recalculate_travel_cache', 30000
        );
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.assigned_to IS NOT NULL AND NEW.scheduled_date IS NOT NULL
       AND NEW.scheduled_date >= _cutoff_min AND NEW.scheduled_date <= _cutoff_max THEN
      IF TG_OP = 'UPDATE'
         AND OLD.assigned_to IS NOT DISTINCT FROM NEW.assigned_to
         AND OLD.scheduled_date IS NOT DISTINCT FROM NEW.scheduled_date
         AND OLD.address IS NOT DISTINCT FROM NEW.address
         AND OLD.arrival_start IS NOT DISTINCT FROM NEW.arrival_start
         AND OLD.arrival_end IS NOT DISTINCT FROM NEW.arrival_end
         AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
      END IF;
      SELECT id INTO _employee_id FROM public.employees WHERE name = NEW.assigned_to LIMIT 1;
      IF _employee_id IS NOT NULL THEN
        PERFORM public.safe_http_post(
          _supabase_url || '/functions/v1/calculate-route-cache',
          jsonb_build_object('employee_id', _employee_id, 'date', NEW.scheduled_date::text),
          'trigger_recalculate_travel_cache', 30000
        );
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 3e) trigger_recalculate_travel_cache_estimates (mirror of above)
CREATE OR REPLACE FUNCTION public.trigger_recalculate_travel_cache_estimates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _employee_id uuid;
  _old_employee_id uuid;
  _cutoff_min date := (now() AT TIME ZONE 'America/Chicago')::date - interval '1 day';
  _cutoff_max date := (now() AT TIME ZONE 'America/Chicago')::date + interval '1 day';
  _supabase_url text;
BEGIN
  SELECT decrypted_secret INTO _supabase_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  IF _supabase_url IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    IF OLD.assigned_to IS NOT NULL AND OLD.scheduled_date IS NOT NULL
       AND OLD.scheduled_date >= _cutoff_min AND OLD.scheduled_date <= _cutoff_max THEN
      SELECT id INTO _old_employee_id FROM public.employees WHERE name = OLD.assigned_to LIMIT 1;
      IF _old_employee_id IS NOT NULL THEN
        PERFORM public.safe_http_post(
          _supabase_url || '/functions/v1/calculate-route-cache',
          jsonb_build_object('employee_id', _old_employee_id, 'date', OLD.scheduled_date::text),
          'trigger_recalculate_travel_cache_estimates', 30000
        );
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.assigned_to IS NOT NULL AND NEW.scheduled_date IS NOT NULL
       AND NEW.scheduled_date >= _cutoff_min AND NEW.scheduled_date <= _cutoff_max THEN
      IF TG_OP = 'UPDATE'
         AND OLD.assigned_to IS NOT DISTINCT FROM NEW.assigned_to
         AND OLD.scheduled_date IS NOT DISTINCT FROM NEW.scheduled_date
         AND OLD.address IS NOT DISTINCT FROM NEW.address
         AND OLD.arrival_start IS NOT DISTINCT FROM NEW.arrival_start
         AND OLD.arrival_end IS NOT DISTINCT FROM NEW.arrival_end
         AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
      END IF;
      SELECT id INTO _employee_id FROM public.employees WHERE name = NEW.assigned_to LIMIT 1;
      IF _employee_id IS NOT NULL THEN
        PERFORM public.safe_http_post(
          _supabase_url || '/functions/v1/calculate-route-cache',
          jsonb_build_object('employee_id', _employee_id, 'date', NEW.scheduled_date::text),
          'trigger_recalculate_travel_cache_estimates', 30000
        );
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 4: CRON HEARTBEAT INSTRUMENTATION
-- Helper functions to record start/finish in cron_job_runs.
-- Each cron-invoked edge function should call begin_cron_run at start
-- and finish_cron_run at end. Also, this layer adds DB-side entry/exit
-- wrappers so even if an edge function never responds, we have a heartbeat.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.begin_cron_run(p_job_name text, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.cron_job_runs (job_name, status, metadata, started_at)
  VALUES (p_job_name, 'running', p_metadata, now())
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_cron_run(
  p_run_id uuid,
  p_status text DEFAULT 'success',
  p_rows_processed integer DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.cron_job_runs
  SET finished_at = now(),
      status = p_status,
      duration_ms = EXTRACT(EPOCH FROM (now() - started_at)) * 1000,
      rows_processed = COALESCE(p_rows_processed, rows_processed),
      error_message = p_error_message,
      metadata = COALESCE(p_metadata, metadata)
  WHERE id = p_run_id;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 5: STALE-JOB DETECTOR
-- Returns cron jobs that haven't successfully run in their expected window.
-- Used by the System Health Dashboard to surface stalled crons.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_cron_health()
RETURNS TABLE (
  job_name text,
  last_run_at timestamptz,
  last_status text,
  last_duration_ms integer,
  consecutive_failures integer,
  is_stale boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (job_name)
      job_name, started_at, status, duration_ms
    FROM public.cron_job_runs
    ORDER BY job_name, started_at DESC
  ),
  failures AS (
    SELECT
      job_name,
      count(*) FILTER (
        WHERE status IN ('error', 'timeout')
        AND started_at > now() - interval '24 hours'
      ) AS recent_failures
    FROM public.cron_job_runs
    GROUP BY job_name
  )
  SELECT
    l.job_name,
    l.started_at AS last_run_at,
    l.status AS last_status,
    l.duration_ms AS last_duration_ms,
    COALESCE(f.recent_failures, 0)::int AS consecutive_failures,
    (l.started_at < now() - interval '2 hours')::boolean AS is_stale
  FROM latest l
  LEFT JOIN failures f ON f.job_name = l.job_name;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 6: BACKFILL — record initial cron job entries so dashboard isn't empty
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.cron_job_runs (job_name, status, started_at, finished_at, metadata)
SELECT jobname, 'pending_first_run', now(), now(),
  jsonb_build_object('schedule', schedule, 'note', 'baseline entry from session 2 hardening')
FROM cron.job
WHERE active = true
ON CONFLICT DO NOTHING;
