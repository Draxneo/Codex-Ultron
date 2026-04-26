
INSERT INTO storage.buckets (id, name, public)
VALUES ('ringtones', 'ringtones', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can upload ringtones"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ringtones');

CREATE POLICY "Authenticated can read ringtones"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'ringtones');

CREATE POLICY "Authenticated can delete own ringtones"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'ringtones');
