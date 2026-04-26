
-- Mark past-due jobs (scheduled before today, still active) as done
UPDATE public.jobs
SET status = 'done', completed_at = COALESCE(completed_at, now())
WHERE scheduled_date < CURRENT_DATE
  AND status NOT IN ('done', 'invoiced', 'canceled');

-- Delete chat channels for done/invoiced/canceled jobs  
DELETE FROM public.chat_channels
WHERE job_id IN (
  SELECT id FROM public.jobs WHERE status IN ('done', 'invoiced', 'canceled')
);

-- Delete chat channels for closed estimates
DELETE FROM public.chat_channels
WHERE estimate_id IN (
  SELECT id FROM public.estimates WHERE work_status IN ('won', 'lost', 'canceled')
);
