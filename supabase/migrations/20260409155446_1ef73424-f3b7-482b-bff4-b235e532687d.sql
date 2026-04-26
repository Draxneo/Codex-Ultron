CREATE POLICY "Authenticated can upload mms media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'mms-media');

CREATE POLICY "Anyone can read mms media"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'mms-media');