
-- SMS notify trigger: notify assigned technician when a job is newly assigned or rescheduled
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
  _date_str text;
  _time_str text;
  _body text;
  _kind text;  -- 'assigned' | 'rescheduled'
  _supabase_url text;
  _anon_key text;
BEGIN
  -- Determine event kind
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_to IS NULL OR NEW.scheduled_date IS NULL THEN
      RETURN NEW;
    END IF;
    _kind := 'assigned';
  ELSE
    -- UPDATE: fire on first assignment OR if assigned_to changed OR if scheduled_date changed
    IF NEW.assigned_to IS NULL OR NEW.scheduled_date IS NULL THEN
      RETURN NEW;
    END IF;

    IF OLD.assigned_to IS NOT DISTINCT FROM NEW.assigned_to
       AND OLD.scheduled_date IS NOT DISTINCT FROM NEW.scheduled_date
       AND OLD.arrival_start IS NOT DISTINCT FROM NEW.arrival_start
    THEN
      RETURN NEW;
    END IF;

    -- New assignment: tech changed (or was null)
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
      _kind := 'assigned';
    ELSE
      _kind := 'rescheduled';
    END IF;
  END IF;

  -- Skip canceled / done jobs
  IF NEW.status IN ('canceled', 'done', 'invoiced') THEN
    RETURN NEW;
  END IF;

  -- Resolve tech phone
  SELECT phone INTO _tech_phone
  FROM public.employees
  WHERE name = NEW.assigned_to AND is_active = true
  LIMIT 1;

  _digits := right(regexp_replace(COALESCE(_tech_phone, ''), '\D', '', 'g'), 10);
  IF length(_digits) <> 10 THEN
    RETURN NEW;
  END IF;

  -- Build SMS body
  _customer := COALESCE(NEW.customer_name, 'customer');
  _addr := COALESCE(NEW.address, '');
  _date_str := to_char(NEW.scheduled_date, 'Mon DD');
  _time_str := CASE
    WHEN NEW.arrival_start IS NOT NULL
      THEN to_char(NEW.arrival_start AT TIME ZONE 'America/Chicago', 'HH12:MI AM')
    ELSE ''
  END;

  IF _kind = 'assigned' THEN
    _body := '📋 New job: ' || _customer || ' · ' || _date_str
             || CASE WHEN _time_str <> '' THEN ' ' || _time_str ELSE '' END
             || CASE WHEN _addr <> '' THEN E'\n' || _addr ELSE '' END;
  ELSE
    _body := '🔄 Rescheduled: ' || _customer || ' · ' || _date_str
             || CASE WHEN _time_str <> '' THEN ' ' || _time_str ELSE '' END
             || CASE WHEN _addr <> '' THEN E'\n' || _addr ELSE '' END;
  END IF;

  -- Get vault secrets
  SELECT decrypted_secret INTO _supabase_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  SELECT decrypted_secret INTO _anon_key   FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1;

  IF _supabase_url IS NULL OR _anon_key IS NULL THEN
    RETURN NEW;
  END IF;

  -- Fire the SMS asynchronously (non-blocking)
  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/send-sms',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _anon_key
    ),
    body := jsonb_build_object(
      'to', _digits,
      'body', _body,
      'source', 'notify_tech_on_assign_or_reschedule',
      'job_id', NEW.id
    ),
    timeout_milliseconds := 10000
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_tech_on_assign_or_reschedule ON public.jobs;
CREATE TRIGGER trg_notify_tech_on_assign_or_reschedule
AFTER INSERT OR UPDATE OF assigned_to, scheduled_date, arrival_start ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.notify_tech_on_assign_or_reschedule();
