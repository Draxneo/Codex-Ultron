
-- Mark unscheduled jobs with no pending tasks that are older than 7 days as done
UPDATE public.jobs
SET status = 'done', completed_at = COALESCE(completed_at, now())
WHERE status NOT IN ('done', 'invoiced', 'canceled')
  AND scheduled_date IS NULL
  AND created_at < now() - interval '7 days'
  AND NOT EXISTS (
    SELECT 1 FROM public.job_tasks jt WHERE jt.job_id = jobs.id AND jt.status = 'pending'
  );

-- Clean up any resulting orphan channels
DELETE FROM public.chat_channels
WHERE job_id IN (SELECT id FROM public.jobs WHERE status IN ('done', 'invoiced', 'canceled'));
