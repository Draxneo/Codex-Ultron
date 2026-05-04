ALTER TABLE public.template_tasks ADD COLUMN IF NOT EXISTS is_silent boolean DEFAULT false;
ALTER TABLE public.job_tasks ADD COLUMN IF NOT EXISTS is_silent boolean DEFAULT false;