
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS arrival_start timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS arrival_end timestamptz;
