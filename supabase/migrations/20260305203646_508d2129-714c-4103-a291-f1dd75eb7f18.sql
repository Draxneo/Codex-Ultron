-- Create job_attachments table to track archived HCP photos
CREATE TABLE public.job_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
  hcp_attachment_id text,
  file_name text NOT NULL DEFAULT 'attachment',
  file_path text NOT NULL,
  file_type text DEFAULT 'image/jpeg',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: allow all access (matches existing pattern for internal tables)
ALTER TABLE public.job_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to job_attachments" ON public.job_attachments FOR ALL USING (true) WITH CHECK (true);

-- Create storage bucket for archived job photos
INSERT INTO storage.buckets (id, name, public) VALUES ('job-photos', 'job-photos', true);

-- Storage RLS: allow read/write
CREATE POLICY "Allow public read job-photos" ON storage.objects FOR SELECT USING (bucket_id = 'job-photos');
CREATE POLICY "Allow insert job-photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'job-photos');
CREATE POLICY "Allow delete job-photos" ON storage.objects FOR DELETE USING (bucket_id = 'job-photos');