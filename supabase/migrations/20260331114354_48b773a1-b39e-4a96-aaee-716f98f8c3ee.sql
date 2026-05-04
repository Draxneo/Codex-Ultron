
-- Create route_travel_cache table
CREATE TABLE public.route_travel_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  leg_order integer NOT NULL,
  from_address text,
  to_address text,
  from_job_id uuid,
  to_job_id uuid,
  from_label text,
  travel_minutes integer,
  distance_miles numeric(6,1),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, scheduled_date, leg_order)
);

-- Index for fast lookups
CREATE INDEX idx_route_travel_cache_lookup ON public.route_travel_cache (employee_id, scheduled_date);

-- Enable RLS
ALTER TABLE public.route_travel_cache ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read travel cache
CREATE POLICY "Authenticated users can read travel cache"
  ON public.route_travel_cache FOR SELECT TO authenticated USING (true);

-- Allow service role to manage (edge functions use service role)
CREATE POLICY "Service role can manage travel cache"
  ON public.route_travel_cache FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Enable pg_net extension for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create trigger function to recalculate travel cache when jobs change
CREATE OR REPLACE FUNCTION public.trigger_recalculate_travel_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Attach trigger to jobs table
CREATE TRIGGER recalculate_travel_on_job_change
  AFTER INSERT OR UPDATE OF assigned_to, scheduled_date, address OR DELETE
  ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recalculate_travel_cache();
