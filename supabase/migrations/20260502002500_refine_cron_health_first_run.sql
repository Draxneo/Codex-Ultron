-- Make cron health less noisy for newly-created daily jobs.
-- A daily cron can exist for hours before its first scheduled window arrives;
-- that should read as "waiting for first run" instead of "stale".

CREATE OR REPLACE FUNCTION public.get_cron_health()
RETURNS TABLE(
  job_name text,
  last_run_at timestamp with time zone,
  last_status text,
  last_duration_ms integer,
  consecutive_failures integer,
  is_stale boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH active_jobs AS (
    SELECT
      j.jobid,
      j.jobname,
      j.schedule
    FROM cron.job j
    WHERE j.active = true
  ),
  latest_run AS (
    SELECT DISTINCT ON (d.jobid)
      d.jobid,
      d.start_time,
      d.end_time,
      d.status,
      d.return_message
    FROM cron.job_run_details d
    WHERE d.start_time > now() - interval '7 days'
    ORDER BY d.jobid, d.start_time DESC
  ),
  recent_failures AS (
    SELECT
      d.jobid,
      count(*) FILTER (
        WHERE d.status <> 'succeeded'
          AND d.start_time > now() - interval '24 hours'
      )::int AS fail_count
    FROM cron.job_run_details d
    WHERE d.start_time > now() - interval '24 hours'
    GROUP BY d.jobid
  ),
  thresholds AS (
    SELECT
      aj.jobid,
      aj.jobname,
      aj.schedule,
      CASE
        WHEN aj.schedule ~ '^[0-9*/,-]+ +[0-9*/,-]+ +\* +\* +\*$'
             AND aj.schedule !~ '^\*' THEN interval '26 hours'
        WHEN aj.schedule ~ '[0-9]$' AND aj.schedule !~ '^\*' THEN interval '8 days'
        WHEN aj.schedule ~ '^\*/([0-9]+) +\* +\* +\* +\*$' THEN
          ((substring(aj.schedule from '^\*/([0-9]+)')::int) * 3 || ' minutes')::interval
        WHEN aj.schedule ~ '^[0-9]+ +\* +\* +\* +\*$' THEN interval '3 hours'
        WHEN aj.schedule = '* * * * *' THEN interval '5 minutes'
        ELSE interval '2 hours'
      END AS stale_after,
      (
        aj.schedule ~ '^[0-9*/,-]+ +[0-9*/,-]+ +\* +\* +\*$'
        AND aj.schedule !~ '^\*'
      ) AS is_daily
    FROM active_jobs aj
  )
  SELECT
    aj.jobname::text AS job_name,
    lr.start_time AS last_run_at,
    CASE
      WHEN lr.status IS NULL AND t.is_daily THEN 'waiting_first_run'
      WHEN lr.status IS NULL THEN 'never_run'
      WHEN lr.status = 'succeeded' THEN 'success'
      WHEN lr.status = 'failed' THEN 'error'
      ELSE lr.status::text
    END AS last_status,
    CASE
      WHEN lr.start_time IS NOT NULL AND lr.end_time IS NOT NULL
        THEN (EXTRACT(EPOCH FROM (lr.end_time - lr.start_time)) * 1000)::int
      ELSE NULL
    END AS last_duration_ms,
    COALESCE(rf.fail_count, 0) AS consecutive_failures,
    CASE
      WHEN lr.start_time IS NULL AND t.is_daily THEN false
      WHEN lr.start_time IS NULL THEN true
      WHEN lr.start_time < now() - t.stale_after THEN true
      ELSE false
    END AS is_stale
  FROM active_jobs aj
  JOIN thresholds t ON t.jobid = aj.jobid
  LEFT JOIN latest_run lr ON lr.jobid = aj.jobid
  LEFT JOIN recent_failures rf ON rf.jobid = aj.jobid
  ORDER BY aj.jobname;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_cron_health() TO authenticated;
