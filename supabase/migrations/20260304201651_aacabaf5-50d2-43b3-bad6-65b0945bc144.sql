CREATE TABLE public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to company_settings" ON public.company_settings FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.company_settings (key, value) VALUES
  ('company_name', 'Airtastic AC'),
  ('contact_name', ''),
  ('company_phone', ''),
  ('company_email', ''),
  ('company_address', ''),
  ('company_city', 'San Antonio'),
  ('company_state', 'TX'),
  ('company_zip', ''),
  ('tacla_number', ''),
  ('cps_cin', '');