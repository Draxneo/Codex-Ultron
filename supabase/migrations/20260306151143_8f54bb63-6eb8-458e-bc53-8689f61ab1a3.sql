
CREATE TABLE public.property_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL UNIQUE,
  bedrooms integer,
  bathrooms numeric,
  sqft integer,
  year_built integer,
  estimated_value numeric,
  lot_size text,
  property_type text,
  lat numeric,
  lng numeric,
  source text DEFAULT 'realtymole',
  fetched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.property_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read property data" ON public.property_data FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert" ON public.property_data FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update" ON public.property_data FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anon can insert property data" ON public.property_data FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update property data" ON public.property_data FOR UPDATE TO anon USING (true);
