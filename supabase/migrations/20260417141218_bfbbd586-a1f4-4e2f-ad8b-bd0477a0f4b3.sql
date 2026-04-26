-- Backfill: fix scheduled_date for HCP jobs/estimates where the
-- naive UTC-date extraction pushed late-evening Central appointments
-- one day forward. Realigns to the America/Chicago calendar date.
UPDATE public.jobs
SET scheduled_date = (arrival_start AT TIME ZONE 'America/Chicago')::date
WHERE arrival_start IS NOT NULL
  AND scheduled_date IS NOT NULL
  AND scheduled_date != (arrival_start AT TIME ZONE 'America/Chicago')::date;

UPDATE public.estimates
SET scheduled_date = (arrival_start AT TIME ZONE 'America/Chicago')::date
WHERE arrival_start IS NOT NULL
  AND scheduled_date IS NOT NULL
  AND scheduled_date != (arrival_start AT TIME ZONE 'America/Chicago')::date;