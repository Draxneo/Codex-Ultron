
ALTER TABLE public.tech_form_photos ADD COLUMN IF NOT EXISTS photo_latitude numeric;
ALTER TABLE public.tech_form_photos ADD COLUMN IF NOT EXISTS photo_longitude numeric;
ALTER TABLE public.tech_form_photos ADD COLUMN IF NOT EXISTS photo_taken_at timestamp with time zone;
