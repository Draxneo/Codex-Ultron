ALTER TABLE public.tech_form_photos
  ADD COLUMN IF NOT EXISTS extracted_suction text,
  ADD COLUMN IF NOT EXISTS extracted_discharge text,
  ADD COLUMN IF NOT EXISTS extracted_uf text,
  ADD COLUMN IF NOT EXISTS extracted_vac text,
  ADD COLUMN IF NOT EXISTS extracted_reading_value text,
  ADD COLUMN IF NOT EXISTS extracted_reading_unit text,
  ADD COLUMN IF NOT EXISTS extracted_filter_size text,
  ADD COLUMN IF NOT EXISTS extracted_filter_condition text;