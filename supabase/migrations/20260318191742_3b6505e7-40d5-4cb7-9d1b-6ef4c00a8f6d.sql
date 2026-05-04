
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS needs_follow_up boolean NOT NULL DEFAULT false;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS follow_up_reason text;

-- Backfill: mark currently unscheduled active jobs as needing follow-up
UPDATE public.jobs
SET needs_follow_up = true,
    follow_up_reason = 'Unscheduled — needs dispatch'
WHERE scheduled_date IS NULL
  AND status NOT IN ('done', 'invoiced', 'canceled')
  AND needs_follow_up = false;
