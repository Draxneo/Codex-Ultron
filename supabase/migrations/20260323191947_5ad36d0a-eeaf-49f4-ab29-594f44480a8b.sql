
CREATE TABLE public.permit_authorities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  jurisdiction_type text NOT NULL DEFAULT 'city',
  permit_portal_url text,
  inspection_url text,
  inspection_phone text,
  contact_email text,
  zip_codes text[] DEFAULT '{}',
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.permit_authorities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read permit authorities"
  ON public.permit_authorities FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage permit authorities"
  ON public.permit_authorities FOR ALL TO authenticated USING (true) WITH CHECK (true);
