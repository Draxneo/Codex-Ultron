-- ===========================================================================
-- Debounce tech assignment / reschedule SMS (2026-05-03 evening)
-- ===========================================================================
-- BEFORE: notify_tech_on_assign_or_reschedule fired send-sms synchronously
-- on every UPDATE OF assigned_to/scheduled_date/arrival_start. If a user
-- saved the reschedule modal twice (e.g. picked the wrong day, then
-- corrected), the assigned tech got TWO confusing SMSs ~60 seconds apart —
-- first with the wrong day, then the corrected one.
--
-- AFTER: trigger UPSERTs the latest pending notification into a queue,
-- keyed on (job_id, tech_phone). Rapid-fire updates within the debounce
-- window collapse into a single row with the latest body. A pg_cron job
-- flushes the queue every minute, sending only rows whose last_change_at
-- is older than 30 seconds (so we don't send mid-edit).
--
-- Net effect: 1 SMS per logical reschedule, sent ~30-90 seconds after the
-- user's LAST save. Worst-case delay is bounded; multi-save bursts no
-- longer spam the tech.
--
-- New body format for reschedules per user request:
--   "⚠ Job rescheduled. New time: <date> <window>"
--   "Customer: <name>"
--   "Work: <description>"
--   "<address>"
-- ===========================================================================

-- 1. Queue table
CREATE TABLE IF NOT EXISTS public.tech_sms_queue (
  job_id          uuid NOT NULL,
  tech_phone_e164 text NOT NULL,
  tech_name       text,
  body            text NOT NULL,
  kind            text NOT NULL,
  last_change_at  timestamptz NOT NULL DEFAULT NOW(),
  sent_at         timestamptz,
  send_attempts   int NOT NULL DEFAULT 0,
  last_error      text,
  PRIMARY KEY (job_id, tech_phone_e164)
);

CREATE INDEX IF NOT EXISTS tech_sms_queue_pending_idx
  ON public.tech_sms_queue (last_change_at)
  WHERE sent_at IS NULL;

ALTER TABLE public.tech_sms_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tech_sms_queue' AND policyname = 'service_role_full_access') THEN
    CREATE POLICY service_role_full_access ON public.tech_sms_queue
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 2. Trigger function — UPSERTs into queue instead of direct send
CREATE OR REPLACE FUNCTION public.notify_tech_on_assign_or_reschedule()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tech_phone text;
  _digits text;
  _customer text;
  _addr text;
  _work text;
  _date_str text;
  _time_str text;
  _end_str text;
  _window_str text;
  _body text;
  _kind text;
  _today_ct date := (now() AT TIME ZONE 'America/Chicago')::date;
  _hour_ct int := EXTRACT(HOUR FROM (now() AT TIME ZONE 'America/Chicago'))::int;
  _is_after_5pm boolean := _hour_ct >= 17;
  _is_for_tomorrow boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_to IS NULL OR NEW.scheduled_date IS NULL THEN RETURN NEW; END IF;
    _kind := 'assigned';
  ELSE
    IF NEW.assigned_to IS NULL OR NEW.scheduled_date IS NULL THEN RETURN NEW; END IF;
    IF OLD.assigned_to IS NOT DISTINCT FROM NEW.assigned_to
       AND OLD.scheduled_date IS NOT DISTINCT FROM NEW.scheduled_date
       AND OLD.arrival_start IS NOT DISTINCT FROM NEW.arrival_start
       AND OLD.arrival_end IS NOT DISTINCT FROM NEW.arrival_end
       AND OLD.description IS NOT DISTINCT FROM NEW.description
    THEN RETURN NEW; END IF;
    _kind := CASE WHEN OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN 'assigned' ELSE 'rescheduled' END;
  END IF;

  IF NEW.status IN ('canceled', 'done', 'invoiced') THEN RETURN NEW; END IF;

  SELECT phone INTO _tech_phone
  FROM public.employees
  WHERE name = NEW.assigned_to AND is_active = true
  LIMIT 1;

  _digits := right(regexp_replace(COALESCE(_tech_phone, ''), '\D', '', 'g'), 10);
  IF length(_digits) <> 10 THEN RETURN NEW; END IF;

  _is_for_tomorrow := NEW.scheduled_date = (_today_ct + 1);

  IF _is_after_5pm AND _is_for_tomorrow THEN
    DECLARE _supabase_url text;
    BEGIN
      SELECT decrypted_secret INTO _supabase_url
      FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
      IF _supabase_url IS NOT NULL THEN
        PERFORM public.safe_http_post(
          _supabase_url || '/functions/v1/send-tech-day-digest',
          jsonb_build_object('tech_name', NEW.assigned_to, 'date', NEW.scheduled_date::text),
          'notify_tech_on_assign_or_reschedule_digest',
          15000
        );
      END IF;
    END;
    RETURN NEW;
  END IF;

  _customer := COALESCE(NEW.customer_name, 'customer');
  _addr := NULLIF(btrim(COALESCE(NEW.address, '')), '');
  _work := NULLIF(btrim(regexp_replace(COALESCE(NEW.description, ''), '\s+', ' ', 'g')), '');
  _date_str := to_char(NEW.scheduled_date, 'Dy Mon DD');

  _time_str := CASE
    WHEN NEW.arrival_start IS NOT NULL
      THEN to_char(NEW.arrival_start AT TIME ZONE 'America/Chicago', 'FMHH12:MI AM')
    ELSE ''
  END;
  _end_str := CASE
    WHEN NEW.arrival_end IS NOT NULL
      THEN to_char(NEW.arrival_end AT TIME ZONE 'America/Chicago', 'FMHH12:MI AM')
    ELSE ''
  END;
  _window_str := CASE
    WHEN _time_str <> '' AND _end_str <> '' THEN
      CASE
        WHEN right(_time_str, 2) = right(_end_str, 2)
          THEN regexp_replace(_time_str, '\s?(AM|PM)$', '', 'i') || ' - ' || _end_str
        ELSE _time_str || ' - ' || _end_str
      END
    WHEN _time_str <> '' THEN _time_str
    ELSE ''
  END;

  IF _kind = 'assigned' THEN
    _body := 'New job: ' || _customer || ' - ' || _date_str
             || CASE WHEN _window_str <> '' THEN ' ' || _window_str ELSE '' END;
  ELSE
    _body := '⚠ Job rescheduled. New time: ' || _date_str
             || CASE WHEN _window_str <> '' THEN ' ' || _window_str ELSE '' END
             || E'\nCustomer: ' || _customer;
  END IF;

  IF _work IS NOT NULL THEN
    _body := _body || E'\nWork: ' || left(_work, 220);
  END IF;
  IF _addr IS NOT NULL THEN
    _body := _body || E'\n' || _addr;
  END IF;

  -- Queue (or update) the pending notification. ON CONFLICT replaces body
  -- and pushes last_change_at forward — so the debouncer flushes only the
  -- LATEST version after the user stops editing.
  INSERT INTO public.tech_sms_queue (
    job_id, tech_phone_e164, tech_name, body, kind, last_change_at, sent_at, send_attempts, last_error
  ) VALUES (
    NEW.id, _digits, NEW.assigned_to, _body, _kind, NOW(), NULL, 0, NULL
  )
  ON CONFLICT (job_id, tech_phone_e164) DO UPDATE
  SET body = EXCLUDED.body,
      kind = EXCLUDED.kind,
      tech_name = EXCLUDED.tech_name,
      last_change_at = EXCLUDED.last_change_at,
      sent_at = NULL,
      send_attempts = 0,
      last_error = NULL;

  RETURN NEW;
END;
$function$;

-- 3. Flusher — sends queued rows that have been quiet for 30+ seconds
CREATE OR REPLACE FUNCTION public.flush_tech_sms_queue()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row record;
  _supabase_url text;
  _sent_count int := 0;
BEGIN
  SELECT decrypted_secret INTO _supabase_url
  FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  IF _supabase_url IS NULL THEN RETURN 0; END IF;

  FOR _row IN
    SELECT * FROM public.tech_sms_queue
    WHERE sent_at IS NULL
      AND last_change_at < NOW() - INTERVAL '30 seconds'
      AND send_attempts < 5
    ORDER BY last_change_at ASC
    LIMIT 50
  LOOP
    BEGIN
      PERFORM public.safe_http_post(
        _supabase_url || '/functions/v1/send-sms',
        jsonb_build_object(
          'to', _row.tech_phone_e164,
          'body', _row.body,
          'source', 'flush_tech_sms_queue:' || _row.kind,
          'job_id', _row.job_id
        ),
        'flush_tech_sms_queue',
        10000
      );

      UPDATE public.tech_sms_queue
      SET sent_at = NOW(),
          send_attempts = send_attempts + 1
      WHERE job_id = _row.job_id AND tech_phone_e164 = _row.tech_phone_e164;

      _sent_count := _sent_count + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.tech_sms_queue
      SET send_attempts = send_attempts + 1,
          last_error = SQLERRM
      WHERE job_id = _row.job_id AND tech_phone_e164 = _row.tech_phone_e164;
    END;
  END LOOP;

  -- Garbage collect: drop sent rows older than 24 hours
  DELETE FROM public.tech_sms_queue
  WHERE sent_at IS NOT NULL AND sent_at < NOW() - INTERVAL '24 hours';

  RETURN _sent_count;
END;
$function$;

-- 4. pg_cron job — runs every minute
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'flush-tech-sms-queue') THEN
    PERFORM cron.unschedule('flush-tech-sms-queue');
  END IF;
END $$;

SELECT cron.schedule(
  'flush-tech-sms-queue',
  '* * * * *',
  $$ SELECT public.flush_tech_sms_queue(); $$
);
