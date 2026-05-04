
-- estimates table (synced from HCP)
CREATE TABLE public.estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id text UNIQUE,
  estimate_number text,
  customer_name text,
  customer_phone text,
  customer_email text,
  address text,
  assigned_to text,
  work_status text,
  scheduled_date date,
  description text,
  hcp_customer_id text,
  options jsonb DEFAULT '[]'::jsonb,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to estimates" ON public.estimates FOR ALL USING (true) WITH CHECK (true);

-- quotes table
CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid REFERENCES public.estimates(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  system_type text,
  tonnage numeric,
  application text,
  brand text,
  customer_name text,
  address text,
  notes text,
  status text NOT NULL DEFAULT 'draft',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to quotes" ON public.quotes FOR ALL USING (true) WITH CHECK (true);

-- quote_options table
CREATE TABLE public.quote_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  tier text NOT NULL,
  matchup_id uuid REFERENCES public.equipment_matchups(id) ON DELETE SET NULL,
  price_override numeric,
  is_selected boolean DEFAULT false,
  notes text,
  sort_order integer DEFAULT 0
);

ALTER TABLE public.quote_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to quote_options" ON public.quote_options FOR ALL USING (true) WITH CHECK (true);
