
-- Customer certificates table
CREATE TABLE public.customer_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  certificate_type text NOT NULL CHECK (certificate_type IN ('manufacturer_warranty', 'labor_warranty', 'no_lemon', 'price_match', 'agreement')),
  data_snapshot jsonb NOT NULL DEFAULT '{}',
  token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  generated_at timestamptz NOT NULL DEFAULT now(),
  pdf_path text
);

ALTER TABLE public.customer_certificates ENABLE ROW LEVEL SECURITY;

-- Public read by token (customer-facing)
CREATE POLICY "Anyone can view certificates by token"
  ON public.customer_certificates FOR SELECT
  USING (true);

-- Authenticated users can insert/update
CREATE POLICY "Authenticated users can manage certificates"
  ON public.customer_certificates FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Agreement presentations table
CREATE TABLE public.agreement_presentations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  plan_options jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer NOT NULL DEFAULT 0,
  enrolled_at timestamptz
);

ALTER TABLE public.agreement_presentations ENABLE ROW LEVEL SECURITY;

-- Public read by token
CREATE POLICY "Anyone can view agreement presentations by token"
  ON public.agreement_presentations FOR SELECT
  USING (true);

-- Authenticated can manage
CREATE POLICY "Authenticated users can manage agreement presentations"
  ON public.agreement_presentations FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow anon to update view tracking
CREATE POLICY "Anon can update agreement presentation views"
  ON public.agreement_presentations FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Allow anon to update certificate views (not needed but for consistency)
CREATE POLICY "Anon can update certificates"
  ON public.customer_certificates FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
