
CREATE TABLE public.supply_house_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_house_id uuid REFERENCES public.supply_houses(id) ON DELETE CASCADE NOT NULL,
  branch_name text NOT NULL,
  address text,
  city text,
  state text,
  zip text,
  phone text,
  email text,
  fax text,
  hours text,
  website_url text,
  latitude numeric,
  longitude numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.supply_house_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to supply_house_locations"
  ON public.supply_house_locations
  FOR ALL
  USING (true)
  WITH CHECK (true);
