
-- Form field definitions per job type
CREATE TABLE public.tech_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,
  field_type text NOT NULL DEFAULT 'text', -- text, photo, checkbox, select
  label text NOT NULL,
  is_required boolean NOT NULL DEFAULT false,
  options jsonb, -- for select dropdowns: ["Option A", "Option B"]
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tech_form_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read tech_form_fields" ON public.tech_form_fields
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage tech_form_fields" ON public.tech_form_fields
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Store dynamic field responses
CREATE TABLE public.tech_form_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tech_form_id uuid REFERENCES public.tech_forms(id) ON DELETE CASCADE NOT NULL,
  field_id uuid REFERENCES public.tech_form_fields(id) ON DELETE CASCADE NOT NULL,
  value text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tech_form_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read responses" ON public.tech_form_responses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anyone can insert responses" ON public.tech_form_responses
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anon can read responses" ON public.tech_form_responses
  FOR SELECT TO anon USING (true);

-- Seed default fields for install jobs
INSERT INTO public.tech_form_fields (job_type, field_type, label, is_required, sort_order) VALUES
  ('install', 'text', 'Condenser Model #', true, 1),
  ('install', 'text', 'Condenser Serial #', true, 2),
  ('install', 'text', 'Coil/Air Handler Model #', true, 3),
  ('install', 'text', 'Coil/Air Handler Serial #', true, 4),
  ('install', 'text', 'Furnace Model # (if applicable)', false, 5),
  ('install', 'text', 'Furnace Serial # (if applicable)', false, 6),
  ('install', 'checkbox', 'Permit on site?', true, 7),
  ('install', 'checkbox', 'Customer walked through operation?', true, 8),
  ('install', 'photo', 'Before Photos', false, 9),
  ('install', 'photo', 'After Photos', true, 10),
  ('install', 'photo', 'Data Plate Photos', true, 11),
  ('install', 'text', 'Notes', false, 12);

-- Seed default fields for service jobs
INSERT INTO public.tech_form_fields (job_type, field_type, label, is_required, sort_order) VALUES
  ('service', 'text', 'Diagnosis', true, 1),
  ('service', 'text', 'Repair Performed', false, 2),
  ('service', 'select', 'Customer Decision', false, 3),
  ('service', 'photo', 'Photos', false, 4),
  ('service', 'text', 'Notes', false, 5);

-- Set options for the select field
UPDATE public.tech_form_fields SET options = '["Approved repair", "Declined repair", "Needs estimate", "Will call back"]'::jsonb
WHERE job_type = 'service' AND label = 'Customer Decision';

-- Seed default fields for maintenance jobs
INSERT INTO public.tech_form_fields (job_type, field_type, label, is_required, sort_order) VALUES
  ('maintenance', 'checkbox', 'Filter changed?', true, 1),
  ('maintenance', 'checkbox', 'Coil cleaned?', false, 2),
  ('maintenance', 'text', 'Recommendations', false, 3),
  ('maintenance', 'photo', 'Photos', false, 4),
  ('maintenance', 'text', 'Notes', false, 5);

-- Seed default fields for repair jobs
INSERT INTO public.tech_form_fields (job_type, field_type, label, is_required, sort_order) VALUES
  ('repair', 'text', 'Part replaced', true, 1),
  ('repair', 'text', 'Part model/number', false, 2),
  ('repair', 'checkbox', 'System operational at departure?', true, 3),
  ('repair', 'photo', 'Photos', false, 4),
  ('repair', 'text', 'Notes', false, 5);
