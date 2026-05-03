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
  _supabase_url text;
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

  SELECT phone INTO _tech_phone FROM public.employees WHERE name = NEW.assigned_to AND is_active = true LIMIT 1;
  _digits := right(regexp_replace(COALESCE(_tech_phone, ''), '\D', '', 'g'), 10);
  IF length(_digits) <> 10 THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO _supabase_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  IF _supabase_url IS NULL THEN
    PERFORM public.log_system_error('trigger', 'notify_tech_on_assign_or_reschedule',
      'SUPABASE_URL missing from vault', 'critical', NULL,
      jsonb_build_object('job_id', NEW.id));
    RETURN NEW;
  END IF;

  _is_for_tomorrow := NEW.scheduled_date = (_today_ct + 1);

  -- After 5pm CT for tomorrow's jobs, send the consolidated digest. The digest
  -- now includes the work reason, so the tech does not get a vague schedule text.
  IF _is_after_5pm AND _is_for_tomorrow THEN
    PERFORM public.safe_http_post(
      _supabase_url || '/functions/v1/send-tech-day-digest',
      jsonb_build_object('tech_name', NEW.assigned_to, 'date', NEW.scheduled_date::text),
      'notify_tech_on_assign_or_reschedule_digest', 15000
    );
    RETURN NEW;
  END IF;

  _customer := COALESCE(NEW.customer_name, 'customer');
  _addr := NULLIF(btrim(COALESCE(NEW.address, '')), '');
  _work := NULLIF(btrim(regexp_replace(COALESCE(NEW.description, ''), '\s+', ' ', 'g')), '');
  _date_str := to_char(NEW.scheduled_date, 'Dy Mon DD');
  _time_str := CASE WHEN NEW.arrival_start IS NOT NULL
    THEN to_char(NEW.arrival_start AT TIME ZONE 'America/Chicago', 'FMHH12:MI AM') ELSE '' END;
  _end_str := CASE WHEN NEW.arrival_end IS NOT NULL
    THEN to_char(NEW.arrival_end AT TIME ZONE 'America/Chicago', 'FMHH12:MI AM') ELSE '' END;
  _window_str := CASE
    WHEN _time_str <> '' AND _end_str <> '' THEN _time_str || ' - ' || _end_str
    WHEN _time_str <> '' THEN _time_str
    ELSE ''
  END;

  IF _kind = 'assigned' THEN
    _body := 'New job: ' || _customer || ' - ' || _date_str
             || CASE WHEN _window_str <> '' THEN ' ' || _window_str ELSE '' END;
  ELSE
    _body := 'Rescheduled: ' || _customer || ' - ' || _date_str
             || CASE WHEN _window_str <> '' THEN ' ' || _window_str ELSE '' END;
  END IF;

  IF _work IS NOT NULL THEN
    _body := _body || E'\nWork: ' || left(_work, 220);
  END IF;
  IF _addr IS NOT NULL THEN
    _body := _body || E'\n' || _addr;
  END IF;

  PERFORM public.safe_http_post(
    _supabase_url || '/functions/v1/send-sms',
    jsonb_build_object('to', _digits, 'body', _body,
      'source', 'notify_tech_on_assign_or_reschedule', 'job_id', NEW.id),
    'notify_tech_on_assign_or_reschedule', 10000
  );

  RETURN NEW;
END;
$function$;
