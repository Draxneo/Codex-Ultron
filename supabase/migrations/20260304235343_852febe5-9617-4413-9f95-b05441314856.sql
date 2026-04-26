
CREATE TABLE public.job_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  serial_number text,
  model_number text,
  brand text,
  source text NOT NULL,
  source_id text,
  confidence text NOT NULL DEFAULT 'medium',
  is_confirmed boolean NOT NULL DEFAULT false,
  conflicts jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to job_equipment" ON public.job_equipment FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_job_equipment_job_id ON public.job_equipment(job_id);
CREATE INDEX idx_job_equipment_source ON public.job_equipment(source);
