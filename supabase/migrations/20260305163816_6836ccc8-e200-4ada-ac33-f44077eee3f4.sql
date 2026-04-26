
CREATE TABLE public.copilot_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  category text NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, category)
);

ALTER TABLE public.copilot_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage copilot_permissions"
  ON public.copilot_permissions FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can read copilot_permissions"
  ON public.copilot_permissions FOR SELECT
  TO authenticated
  USING (true);

-- Seed defaults for tech role
INSERT INTO public.copilot_permissions (role, category, allowed) VALUES
  ('tech', 'job_details', true),
  ('tech', 'equipment_specs', true),
  ('tech', 'customer_contact', true),
  ('tech', 'company_procedures', true),
  ('tech', 'pricing', false),
  ('tech', 'financial_data', false),
  ('office', 'job_details', true),
  ('office', 'equipment_specs', true),
  ('office', 'customer_contact', true),
  ('office', 'company_procedures', true),
  ('office', 'pricing', true),
  ('office', 'financial_data', true),
  ('admin', 'job_details', true),
  ('admin', 'equipment_specs', true),
  ('admin', 'customer_contact', true),
  ('admin', 'company_procedures', true),
  ('admin', 'pricing', true),
  ('admin', 'financial_data', true),
  ('installer', 'job_details', true),
  ('installer', 'equipment_specs', true),
  ('installer', 'customer_contact', true),
  ('installer', 'company_procedures', true),
  ('installer', 'pricing', false),
  ('installer', 'financial_data', false);
