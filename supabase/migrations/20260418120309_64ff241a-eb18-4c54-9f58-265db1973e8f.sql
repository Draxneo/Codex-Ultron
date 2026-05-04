-- Rewrite get_cron_health() to read from cron.job + cron.job_run_details (ground truth)
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
  -- Admin-only
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
  -- Schedule-aware stale threshold
  thresholds AS (
    SELECT
      aj.jobid,
      aj.jobname,
      CASE
        -- Daily jobs (e.g. '0 8 * * *') → stale if no run in 26h
        WHEN aj.schedule ~ '^[0-9*/,-]+ +[0-9*/,-]+ +\* +\* +\*$'
             AND aj.schedule !~ '^\*' THEN interval '26 hours'
        -- Weekly (day-of-week specified)
        WHEN aj.schedule ~ '[0-9]$' AND aj.schedule !~ '^\*' THEN interval '8 days'
        -- Every-N-minutes pattern '*/N * * * *'
        WHEN aj.schedule ~ '^\*/([0-9]+) +\* +\* +\* +\*$' THEN
          ((substring(aj.schedule from '^\*/([0-9]+)')::int) * 3 || ' minutes')::interval
        -- Hourly '0 * * * *'
        WHEN aj.schedule ~ '^[0-9]+ +\* +\* +\* +\*$' THEN interval '3 hours'
        -- Every minute
        WHEN aj.schedule = '* * * * *' THEN interval '5 minutes'
        ELSE interval '2 hours'
      END AS stale_after
  FROM active_jobs aj
  )
  SELECT
    aj.jobname::text AS job_name,
    lr.start_time AS last_run_at,
    CASE
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

-- New: paginated recent runs across all cron jobs (for dashboard panel)
CREATE OR REPLACE FUNCTION public.get_recent_cron_runs(p_limit integer DEFAULT 50)
RETURNS TABLE(
  job_name text,
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  duration_ms integer,
  status text,
  return_message text
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
  SELECT
    j.jobname::text AS job_name,
    d.start_time AS started_at,
    d.end_time AS finished_at,
    CASE
      WHEN d.start_time IS NOT NULL AND d.end_time IS NOT NULL
        THEN (EXTRACT(EPOCH FROM (d.end_time - d.start_time)) * 1000)::int
      ELSE NULL
    END AS duration_ms,
    CASE
      WHEN d.status = 'succeeded' THEN 'success'
      WHEN d.status = 'failed' THEN 'error'
      ELSE d.status::text
    END AS status,
    d.return_message
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
  ORDER BY d.start_time DESC
  LIMIT p_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_cron_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recent_cron_runs(integer) TO authenticated;