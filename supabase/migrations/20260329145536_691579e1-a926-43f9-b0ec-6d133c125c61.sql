
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text,
  last_name text,
  phone text,
  email text,
  source text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'new',
  intent text,
  notes text,
  job_id uuid REFERENCES public.jobs(id),
  customer_id uuid REFERENCES public.customers(id),
  raw_payload jsonb,
  contacted_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read leads"
  ON public.leads FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert leads"
  ON public.leads FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update leads"
  ON public.leads FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Anon can insert leads via webhook"
  ON public.leads FOR INSERT TO anon
  WITH CHECK (true);

CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_source ON public.leads(source);
CREATE INDEX idx_leads_phone ON public.leads(phone);

ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
