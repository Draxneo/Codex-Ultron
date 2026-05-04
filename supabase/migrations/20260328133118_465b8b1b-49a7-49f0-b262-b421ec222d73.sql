ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS jurisdiction text,
  ADD COLUMN IF NOT EXISTS jurisdiction_looked_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS permit_pulled_at timestamptz;