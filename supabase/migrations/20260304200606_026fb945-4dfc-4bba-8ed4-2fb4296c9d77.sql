
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS ahri_number text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS hcp_note text;

-- Backfill AHRI numbers from existing descriptions
UPDATE public.jobs
SET ahri_number = (regexp_match(description, '\b(\d{9,10})\b'))[1]
WHERE description IS NOT NULL AND ahri_number IS NULL;
