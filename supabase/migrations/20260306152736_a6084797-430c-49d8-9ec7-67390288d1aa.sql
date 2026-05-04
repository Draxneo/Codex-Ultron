
-- Add new columns to property_data
ALTER TABLE public.property_data
  ADD COLUMN IF NOT EXISTS screenshot_url text,
  ADD COLUMN IF NOT EXISTS zillow_url text;

-- Create property-screenshots storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('property-screenshots', 'property-screenshots', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to property-screenshots
CREATE POLICY "Anyone can read property screenshots"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'property-screenshots');

-- Allow service role and authenticated users to upload
CREATE POLICY "Authenticated can upload property screenshots"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'property-screenshots');
