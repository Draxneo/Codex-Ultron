
-- One-time cleanup: close out jobs where ALL tasks are done (and tasks exist)
-- and remove their chat channels
WITH done_jobs AS (
  SELECT DISTINCT jt.job_id
  FROM job_tasks jt
  WHERE jt.job_id IS NOT NULL
  GROUP BY jt.job_id
  HAVING COUNT(*) > 0
    AND COUNT(*) FILTER (WHERE jt.status = 'pending') = 0
)
UPDATE jobs
SET status = 'done',
    completed_at = COALESCE(completed_at, now())
FROM done_jobs dj
WHERE jobs.id = dj.job_id
  AND jobs.status NOT IN ('done', 'invoiced', 'canceled');

-- Clean up chat channels for those jobs
WITH done_jobs AS (
  SELECT DISTINCT jt.job_id
  FROM job_tasks jt
  WHERE jt.job_id IS NOT NULL
  GROUP BY jt.job_id
  HAVING COUNT(*) > 0
    AND COUNT(*) FILTER (WHERE jt.status = 'pending') = 0
)
DELETE FROM chat_channels
WHERE job_id IN (SELECT job_id FROM done_jobs);

-- Same for estimates
WITH done_estimates AS (
  SELECT DISTINCT jt.estimate_id
  FROM job_tasks jt
  WHERE jt.estimate_id IS NOT NULL
  GROUP BY jt.estimate_id
  HAVING COUNT(*) > 0
    AND COUNT(*) FILTER (WHERE jt.status = 'pending') = 0
)
UPDATE estimates
SET work_status = 'won'
FROM done_estimates de
WHERE estimates.id = de.estimate_id
  AND estimates.work_status NOT IN ('won', 'lost', 'canceled');

WITH done_estimates AS (
  SELECT DISTINCT jt.estimate_id
  FROM job_tasks jt
  WHERE jt.estimate_id IS NOT NULL
  GROUP BY jt.estimate_id
  HAVING COUNT(*) > 0
    AND COUNT(*) FILTER (WHERE jt.status = 'pending') = 0
)
DELETE FROM chat_channels
WHERE estimate_id IN (SELECT estimate_id FROM done_estimates);
