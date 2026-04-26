
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS follow_up_next_check date;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS follow_up_check_count integer NOT NULL DEFAULT 0;

-- Backfill: set next check to tomorrow for all current follow-up jobs without a check date
UPDATE public.jobs
SET follow_up_next_check = CURRENT_DATE + 1
WHERE needs_follow_up = true
  AND follow_up_next_check IS NULL
  AND status NOT IN ('done', 'invoiced', 'canceled');
