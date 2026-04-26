CREATE OR REPLACE FUNCTION public.trigger_recalculate_travel_cache_estimates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _employee_id uuid;
  _old_employee_id uuid;
BEGIN
  -- On DELETE or UPDATE: recalculate OLD tech's route
  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    IF OLD.assigned_to IS NOT NULL AND OLD.scheduled_date IS NOT NULL THEN
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
  
  -- On INSERT or UPDATE: recalculate NEW tech's route
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.assigned_to IS NOT NULL AND NEW.scheduled_date IS NOT NULL THEN
      -- Skip if same employee+date+address as OLD (already triggered above)
      IF TG_OP = 'UPDATE' AND OLD.assigned_to IS NOT DISTINCT FROM NEW.assigned_to 
         AND OLD.scheduled_date IS NOT DISTINCT FROM NEW.scheduled_date 
         AND OLD.address IS NOT DISTINCT FROM NEW.address THEN
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

CREATE TRIGGER recalculate_travel_on_estimate_change
  AFTER INSERT OR UPDATE OF assigned_to, scheduled_date, address OR DELETE
  ON public.estimates
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recalculate_travel_cache_estimates();