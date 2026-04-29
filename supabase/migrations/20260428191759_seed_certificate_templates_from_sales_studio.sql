INSERT INTO public.certificate_templates (
  type_key,
  display_name,
  subtitle_template,
  body_template,
  fields_schema,
  warranty_years,
  is_active,
  updated_at
) VALUES
(
  'manufacturer_warranty',
  'Manufacturer Warranty Certificate',
  '{{warrantyYears}}-Year Parts Warranty',
  'This certifies that {{customerName}} is covered under a {{warrantyYears}}-year manufacturer parts warranty for the equipment listed below. This warranty covers manufacturer-defective parts for the covered term. Registration has been completed with {{brand}}, and Carnes and Sons keeps the warranty details with your customer record.',
  '[{"label":"Brand","variable":"brand"},{"label":"Model","variable":"model"},{"label":"Serial","variable":"serialNumber"},{"label":"Installed","variable":"installDate"},{"label":"Expires","variable":"expirationDate"},{"label":"Confirmation","variable":"confirmationNumber"}]'::jsonb,
  10,
  true,
  now()
),
(
  'labor_warranty',
  'Labor Warranty Certificate',
  '{{warrantyYears}}-Year Labor Coverage',
  'This certifies that {{customerName}} is covered under a {{warrantyYears}}-year labor warranty for the installation listed below. Labor costs for repairs related to the original installation are covered during the warranty term, including service-call labor and diagnostic labor tied to the original installation. This warranty is provided by Carnes and Sons Air Conditioning and is non-transferable.',
  '[{"label":"Equipment","variable":"equipmentDescription"},{"label":"Installation Date","variable":"installDate"},{"label":"Coverage Expires","variable":"expirationDate"},{"label":"Serial Number","variable":"serialNumber"}]'::jsonb,
  2,
  true,
  now()
),
(
  'price_match',
  'Price Match Guarantee',
  'We Won''t Be Beat on Price',
  'This certifies that {{customerName}} is protected by the Carnes and Sons Price Match Guarantee. We will match any licensed Texas HVAC contractor''s written quote for the same equipment and scope of work, including identical equipment make, model, tonnage, installation materials, permits, and labor. Valid for 30 days from the estimate date.',
  '[{"label":"Estimate Date","variable":"estimateDate"},{"label":"Equipment","variable":"equipmentDescription"},{"label":"Quote Valid Through","variable":"validThroughDate"}]'::jsonb,
  NULL,
  true,
  now()
),
(
  'no_lemon',
  'No-Lemon Guarantee',
  '5-Year No-Lemon Guarantee',
  'This certifies that {{customerName}} is covered by the Carnes and Sons No-Lemon Guarantee. If the compressor on the covered outdoor unit fails more than once during the first five years after installation, Carnes and Sons will replace the entire outdoor unit. Most contractors do not offer this level of protection; we do because we stand behind the installation.',
  '[{"label":"Brand","variable":"brand"},{"label":"Model","variable":"model"},{"label":"Serial Number","variable":"serialNumber"},{"label":"Installation Date","variable":"installDate"},{"label":"Guarantee Expires","variable":"expirationDate"}]'::jsonb,
  5,
  true,
  now()
),
(
  'ten_year_labor',
  '10-Year Labor Warranty',
  'Comprehensive 10-Year Labor Coverage',
  'This certifies that {{customerName}} is covered under a 10-year labor warranty for the installation listed below. Labor costs for covered repairs related to the original installation are covered for ten years from the installation date. This certificate represents Carnes and Sons'' commitment to standing behind the work long after installation day.',
  '[{"label":"Equipment","variable":"equipmentDescription"},{"label":"Installation Date","variable":"installDate"},{"label":"Coverage Expires","variable":"expirationDate"},{"label":"Serial Number","variable":"serialNumber"}]'::jsonb,
  10,
  true,
  now()
),
(
  'comfort_club_membership',
  'Comfort Club Membership',
  'Official Member Since {{memberSince}}',
  'This certifies that {{customerName}} is an active Comfort Club member. Membership includes priority scheduling, a locked-in diagnostic rate, repair discounts, two precision tune-ups per year, condenser coil cleaning, and maintenance paperwork to support warranty compliance. Your rate is locked in for life while the membership remains active.',
  '[{"label":"Plan","variable":"planName"},{"label":"Member Since","variable":"memberSince"},{"label":"Annual Rate","variable":"annualRate"},{"label":"Membership ID","variable":"membershipId"}]'::jsonb,
  NULL,
  true,
  now()
)
ON CONFLICT (type_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  subtitle_template = EXCLUDED.subtitle_template,
  body_template = EXCLUDED.body_template,
  fields_schema = EXCLUDED.fields_schema,
  warranty_years = EXCLUDED.warranty_years,
  is_active = EXCLUDED.is_active,
  updated_at = now();
