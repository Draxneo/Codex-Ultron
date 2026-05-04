ALTER TABLE public.tech_form_photos 
  ADD COLUMN extracted_model text,
  ADD COLUMN extracted_serial text,
  ADD COLUMN extraction_status text DEFAULT 'none';

-- Allow updates on tech_form_photos (needed for extraction)
CREATE POLICY "Allow update tech_form_photos" ON public.tech_form_photos
  FOR UPDATE TO authenticated, anon
  USING (true)
  WITH CHECK (true);