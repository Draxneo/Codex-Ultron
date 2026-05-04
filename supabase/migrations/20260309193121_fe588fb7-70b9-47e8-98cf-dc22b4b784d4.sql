
-- Add audio greeting URLs and after-hours forward number to ivr_config
ALTER TABLE public.ivr_config
  ADD COLUMN greeting_audio_url text,
  ADD COLUMN after_hours_audio_url text,
  ADD COLUMN voicemail_audio_url text,
  ADD COLUMN after_hours_forward_number text;

-- Add per-department hours to ivr_menu_options
ALTER TABLE public.ivr_menu_options
  ADD COLUMN dept_hours_start text,
  ADD COLUMN dept_hours_end text,
  ADD COLUMN dept_business_days integer[];

-- Add OOO fields to employees
ALTER TABLE public.employees
  ADD COLUMN ooo_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN ooo_forward_number text;

-- Create storage bucket for IVR greeting audio files
INSERT INTO storage.buckets (id, name, public) VALUES ('ivr-greetings', 'ivr-greetings', true);

-- Storage RLS policies
CREATE POLICY "Anyone can read ivr greetings"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ivr-greetings');

CREATE POLICY "Authenticated can manage ivr greetings"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'ivr-greetings')
  WITH CHECK (bucket_id = 'ivr-greetings');
