
-- Create AHRI certificates storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('ahri-certificates', 'ahri-certificates', true);

-- Allow public read access
CREATE POLICY "Public read access for ahri-certificates"
ON storage.objects FOR SELECT
USING (bucket_id = 'ahri-certificates');

-- Allow all uploads
CREATE POLICY "Allow uploads to ahri-certificates"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'ahri-certificates');

-- Allow deletes
CREATE POLICY "Allow deletes from ahri-certificates"
ON storage.objects FOR DELETE
USING (bucket_id = 'ahri-certificates');

-- Add certificate path column to equipment_matchups
ALTER TABLE public.equipment_matchups ADD COLUMN ahri_certificate_path text;
