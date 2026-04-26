
ALTER TABLE public.tech_forms ADD COLUMN IF NOT EXISTS latitude numeric;
ALTER TABLE public.tech_forms ADD COLUMN IF NOT EXISTS longitude numeric;
ALTER TABLE public.tech_forms ADD COLUMN IF NOT EXISTS location_accuracy numeric;
