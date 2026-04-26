-- Fix: Only recalculate routes for today or future dates (not historical)
-- Also add arrival_start/arrival_end to the skip-guard so time changes trigger recalc

CREATE OR REPLACE FUNCTION trigger_recalculate_travel_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _employee_id uuid;
  _old_employee_id uuid;
  _cutoff date := (now() AT TIME ZONE 'America/Chicago')::date - interval '1 day';
BEGIN
  -- On DELETE or UPDATE: recalculate OLD tech's route (only if recent/future date)
  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    IF OLD.assigned_to IS NOT NULL AND OLD.scheduled_date IS NOT NULL AND OLD.scheduled_date >= _cutoff THEN
      SELECT id INTO _old_employee_id FROM public.employees WHERE name = OLD.assigned_to LIMIT 1;
      IF _old_employee_id IS NOT NULL THEN
        PERFORM net.http_post(
          url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1) || '/functions/v1/calculate-route-cache',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1)
          ),
          body := jsonb_build_object('employee_id', _old_employee_id, 'date', OLD.scheduled_date::text)
        );
      END IF;
    END IF;
  END IF;

  -- On INSERT or UPDATE: recalculate NEW tech's route (only if recent/future date)
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.assigned_to IS NOT NULL AND NEW.scheduled_date IS NOT NULL AND NEW.scheduled_date >= _cutoff THEN
      -- Skip if nothing route-relevant changed
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
        PERFORM net.http_post(
          url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1) || '/functions/v1/calculate-route-cache',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1)
          ),
          body := jsonb_build_object('employee_id', _employee_id, 'date', NEW.scheduled_date::text)
        );
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Same fix for estimates trigger
CREATE OR REPLACE FUNCTION trigger_recalculate_travel_cache_estimates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _employee_id uuid;
  _old_employee_id uuid;
  _cutoff date := (now() AT TIME ZONE 'America/Chicago')::date - interval '1 day';
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    IF OLD.assigned_to IS NOT NULL AND OLD.scheduled_date IS NOT NULL AND OLD.scheduled_date >= _cutoff THEN
      SELECT id INTO _old_employee_id FROM public.employees WHERE name = OLD.assigned_to LIMIT 1;
      IF _old_employee_id IS NOT NULL THEN
        PERFORM net.http_post(
          url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1) || '/functions/v1/calculate-route-cache',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1)
          ),
          body := jsonb_build_object('employee_id', _old_employee_id, 'date', OLD.scheduled_date::text)
        );
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.assigned_to IS NOT NULL AND NEW.scheduled_date IS NOT NULL AND NEW.scheduled_date >= _cutoff THEN
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
        PERFORM net.http_post(
          url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1) || '/functions/v1/calculate-route-cache',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1)
          ),
          body := jsonb_build_object('employee_id', _employee_id, 'date', NEW.scheduled_date::text)
        );
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Clean up historical cache entries we don't need (older than 7 days)
DELETE FROM route_travel_cache 
WHERE scheduled_date < (now() AT TIME ZONE 'America/Chicago')::date - interval '7 days';