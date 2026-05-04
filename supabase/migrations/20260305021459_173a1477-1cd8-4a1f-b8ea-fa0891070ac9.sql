
-- Create preinstall_surveys table
CREATE TABLE public.preinstall_surveys (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  submitted_by uuid REFERENCES public.employees(id),
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.preinstall_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to preinstall_surveys" ON public.preinstall_surveys FOR ALL USING (true) WITH CHECK (true);

-- Create preinstall_photos table
CREATE TABLE public.preinstall_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  survey_id uuid NOT NULL REFERENCES public.preinstall_surveys(id) ON DELETE CASCADE,
  photo_category text NOT NULL DEFAULT 'job_site',
  file_path text NOT NULL,
  extraction_status text NOT NULL DEFAULT 'pending',
  extracted_model text,
  extracted_serial text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.preinstall_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to preinstall_photos" ON public.preinstall_photos FOR ALL USING (true) WITH CHECK (true);

-- Create storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('preinstall-photos', 'preinstall-photos', true);

-- Storage RLS policies
CREATE POLICY "Anyone can upload preinstall photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'preinstall-photos');
CREATE POLICY "Anyone can read preinstall photos" ON storage.objects FOR SELECT USING (bucket_id = 'preinstall-photos');
