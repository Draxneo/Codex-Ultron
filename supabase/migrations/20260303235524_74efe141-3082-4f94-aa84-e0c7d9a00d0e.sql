
-- Supply houses table
CREATE TABLE public.supply_houses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_email text,
  contact_phone text,
  account_number text,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.supply_houses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to supply_houses" ON public.supply_houses FOR ALL USING (true) WITH CHECK (true);

-- Parts catalog - running list of parts with per-supply-house part numbers
CREATE TABLE public.parts_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text DEFAULT 'general',
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.parts_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to parts_catalog" ON public.parts_catalog FOR ALL USING (true) WITH CHECK (true);

-- Maps a part to a supply house with that house's specific part number
CREATE TABLE public.part_supply_house_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL REFERENCES public.parts_catalog(id) ON DELETE CASCADE,
  supply_house_id uuid NOT NULL REFERENCES public.supply_houses(id) ON DELETE CASCADE,
  part_number text NOT NULL,
  unit_cost numeric,
  notes text,
  UNIQUE(part_id, supply_house_id)
);

ALTER TABLE public.part_supply_house_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to part_supply_house_numbers" ON public.part_supply_house_numbers FOR ALL USING (true) WITH CHECK (true);

-- Job invoices - uploaded invoices with AI-extracted data
CREATE TABLE public.job_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  supply_house_id uuid REFERENCES public.supply_houses(id),
  invoice_number text,
  invoice_date date,
  total_amount numeric,
  model_number text,
  serial_number text,
  extracted_items jsonb DEFAULT '[]'::jsonb,
  extraction_status text DEFAULT 'pending',
  raw_extraction jsonb,
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to job_invoices" ON public.job_invoices FOR ALL USING (true) WITH CHECK (true);

-- Seed supply houses
INSERT INTO public.supply_houses (name) VALUES
  ('Carrier Enterprise'),
  ('Robert Madden'),
  ('Goodman');
