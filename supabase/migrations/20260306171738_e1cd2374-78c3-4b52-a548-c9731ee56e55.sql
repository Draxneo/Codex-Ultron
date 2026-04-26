
-- Create manufacturer_brochures table
CREATE TABLE public.manufacturer_brochures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  brand text NOT NULL DEFAULT '',
  description text,
  file_path text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.manufacturer_brochures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read brochures" ON public.manufacturer_brochures
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage brochures" ON public.manufacturer_brochures
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create storage bucket for brochure PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('manufacturer-brochures', 'manufacturer-brochures', true);

CREATE POLICY "Anyone can read brochure files" ON storage.objects
  FOR SELECT USING (bucket_id = 'manufacturer-brochures');

CREATE POLICY "Authenticated can upload brochure files" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'manufacturer-brochures' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated can delete brochure files" ON storage.objects
  FOR DELETE USING (bucket_id = 'manufacturer-brochures' AND auth.role() = 'authenticated');
