
-- Tech live locations (single row per tech, upserted on each GPS update)
CREATE TABLE public.tech_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL UNIQUE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  speed double precision,
  accuracy double precision,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tech_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON public.tech_locations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.tech_locations;

-- Geofence event log (arrivals/departures at jobs and supply houses)
CREATE TABLE public.tech_location_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  event_type text NOT NULL,
  job_id uuid REFERENCES public.jobs(id),
  estimate_id uuid REFERENCES public.estimates(id),
  supply_house_location_id uuid REFERENCES public.supply_house_locations(id),
  location_name text,
  lat double precision,
  lng double precision,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.tech_location_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON public.tech_location_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
