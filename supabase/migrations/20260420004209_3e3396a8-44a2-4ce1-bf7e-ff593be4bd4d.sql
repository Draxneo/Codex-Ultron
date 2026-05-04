-- Widen recalc window: today through +2 days (instead of ±1 day)
-- so after-hours edits on Sunday eve update Monday's cache, and the
-- 5pm pre-warm cron has a stable window to land into.

CREATE OR REPLACE FUNCTION public.trigger_recalculate_travel_cache()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _employee_id uuid;
  _old_employee_id uuid;
  _today date := (now() AT TIME ZONE 'America/Chicago')::date;
  _cutoff_max date := _today + interval '2 days';
  _supabase_url text;
BEGIN
  SELECT decrypted_secret INTO _supabase_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  IF _supabase_url IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    IF OLD.assigned_to IS NOT NULL AND OLD.scheduled_date IS NOT NULL
       AND OLD.scheduled_date >= _today AND OLD.scheduled_date <= _cutoff_max THEN
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
       AND NEW.scheduled_date >= _today AND NEW.scheduled_date <= _cutoff_max THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.trigger_recalculate_travel_cache_estimates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _employee_id uuid;
  _old_employee_id uuid;
  _today date := (now() AT TIME ZONE 'America/Chicago')::date;
  _cutoff_max date := _today + interval '2 days';
  _supabase_url text;
BEGIN
  SELECT decrypted_secret INTO _supabase_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  IF _supabase_url IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    IF OLD.assigned_to IS NOT NULL AND OLD.scheduled_date IS NOT NULL
       AND OLD.scheduled_date >= _today AND OLD.scheduled_date <= _cutoff_max THEN
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
       AND NEW.scheduled_date >= _today AND NEW.scheduled_date <= _cutoff_max THEN
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
$function$;