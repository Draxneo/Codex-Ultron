
INSERT INTO storage.buckets (id, name, public) VALUES ('invoices', 'invoices', true);

CREATE POLICY "Allow all uploads to invoices" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'invoices');
CREATE POLICY "Allow all reads from invoices" ON storage.objects FOR SELECT USING (bucket_id = 'invoices');
CREATE POLICY "Allow all deletes from invoices" ON storage.objects FOR DELETE USING (bucket_id = 'invoices');
