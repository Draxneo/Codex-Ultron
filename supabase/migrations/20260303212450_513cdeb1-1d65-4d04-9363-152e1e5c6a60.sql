
-- Activity log table
CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  job_task_id uuid REFERENCES public.job_tasks(id) ON DELETE CASCADE,
  action text NOT NULL,
  performed_by text,
  details text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to activity_log" ON public.activity_log FOR ALL USING (true) WITH CHECK (true);

-- Task photos table
CREATE TABLE public.task_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_task_id uuid REFERENCES public.job_tasks(id) ON DELETE CASCADE NOT NULL,
  file_path text NOT NULL,
  uploaded_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.task_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to task_photos" ON public.task_photos FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket for task photos
INSERT INTO storage.buckets (id, name, public) VALUES ('task-photos', 'task-photos', true);

-- Storage RLS policies
CREATE POLICY "Anyone can upload task photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'task-photos');
CREATE POLICY "Anyone can view task photos" ON storage.objects FOR SELECT USING (bucket_id = 'task-photos');
CREATE POLICY "Anyone can delete task photos" ON storage.objects FOR DELETE USING (bucket_id = 'task-photos');
