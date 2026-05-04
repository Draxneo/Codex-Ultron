
CREATE TABLE public.certificate_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_key text UNIQUE NOT NULL,
  display_name text NOT NULL,
  subtitle_template text NOT NULL DEFAULT '',
  body_template text NOT NULL DEFAULT '',
  fields_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
  warranty_years int,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.certificate_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active certificate templates"
  ON public.certificate_templates FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Authenticated users can manage certificate templates"
  ON public.certificate_templates FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

INSERT INTO public.certificate_templates (type_key, display_name, subtitle_template, body_template, fields_schema, warranty_years) VALUES
(
  'manufacturer_warranty',
  'Manufacturer Warranty Certificate',
  '{{warrantyYears}}-Year Parts Warranty',
  'This certifies that {{customerName}} is covered under a {{warrantyYears}}-year manufacturer parts warranty for the following equipment. This warranty covers all manufacturer-defective parts for the duration specified above. Registration has been completed with {{brand}}.',
  '[{"label":"Brand","variable":"brand"},{"label":"Model","variable":"model"},{"label":"Serial","variable":"serialNumber"},{"label":"Installed","variable":"installDate"},{"label":"Expires","variable":"expirationDate"},{"label":"Confirmation","variable":"confirmationNumber"}]'::jsonb,
  10
),
(
  'labor_warranty',
  'Labor Warranty Certificate',
  '{{warrantyYears}}-Year Labor Coverage',
  'This certifies that {{customerName}} is covered under a {{warrantyYears}}-year labor warranty for the following installation. All labor costs for repairs related to the original installation are covered for {{warrantyYears}} years from the installation date. No service call fees, no diagnostic charges, no labor costs — just call us. This warranty is provided by Carnes & Sons HVAC and is non-transferable.',
  '[{"label":"Equipment","variable":"equipmentDescription"},{"label":"Installation Date","variable":"installDate"},{"label":"Coverage Expires","variable":"expirationDate"}]'::jsonb,
  2
),
(
  'no_lemon',
  'No-Lemon Guarantee',
  'Your Peace of Mind, Guaranteed',
  'This guarantees that {{customerName}} — If your new system requires 3 or more repairs for the same issue within the first year of installation, we will replace the entire unit — no questions asked. This guarantee is provided exclusively by Carnes & Sons HVAC. Most contractors don''t offer this — we do because we stand behind our work.',
  '[{"label":"Brand","variable":"brand"},{"label":"Model","variable":"model"},{"label":"Installed","variable":"installDate"},{"label":"Guarantee Expires","variable":"expirationDate"}]'::jsonb,
  1
),
(
  'price_match',
  'Price Match Guarantee',
  'We Won''t Be Beat on Price',
  'This certifies that {{customerName}} — We will match any licensed contractor''s written quote for the same equipment and scope of work, guaranteed. Provide a written quote from any licensed TX contractor for identical equipment make, model, and tonnage with the same scope of work (installation, materials, permits) — we''ll match or beat their price. Valid for 30 days from the date of your estimate.',
  '[{"label":"Estimate Date","variable":"estimateDate"}]'::jsonb,
  NULL
);
