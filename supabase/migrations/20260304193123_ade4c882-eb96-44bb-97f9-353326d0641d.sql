
CREATE TABLE public.warranty_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  registered_at timestamp with time zone,
  confirmation_number text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(job_id)
);

ALTER TABLE public.warranty_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to warranty_registrations"
  ON public.warranty_registrations
  FOR ALL
  USING (true)
  WITH CHECK (true);
