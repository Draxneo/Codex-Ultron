-- Add estimate_id to job_tasks so estimates can have tasks too
ALTER TABLE public.job_tasks ADD COLUMN estimate_id uuid REFERENCES public.estimates(id) ON DELETE CASCADE;

-- Make job_id nullable since estimate tasks won't have a job_id
ALTER TABLE public.job_tasks ALTER COLUMN job_id DROP NOT NULL;

-- Add check: must have either job_id or estimate_id
ALTER TABLE public.job_tasks ADD CONSTRAINT job_tasks_must_have_parent
  CHECK (job_id IS NOT NULL OR estimate_id IS NOT NULL);

-- Index for estimate task lookups
CREATE INDEX idx_job_tasks_estimate_id ON public.job_tasks(estimate_id) WHERE estimate_id IS NOT NULL;