
DROP FUNCTION IF EXISTS public.get_customer_enrichment();

CREATE OR REPLACE FUNCTION public.get_customer_enrichment()
 RETURNS TABLE(customer_id uuid, job_count bigint, has_install boolean, last_job_date date, agreement_status text, agreement_plan_name text, agreement_end_date date, agreement_plan_source text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    c.id AS customer_id,
    COALESCE(jc.job_count, 0) AS job_count,
    COALESCE(jc.has_install, false) AS has_install,
    jc.last_job_date,
    CASE
      WHEN sa.status = 'active' AND sa.end_date >= CURRENT_DATE THEN 'active'
      WHEN sa.id IS NOT NULL THEN 'expired'
      ELSE 'none'
    END AS agreement_status,
    sa.plan_name AS agreement_plan_name,
    sa.end_date AS agreement_end_date,
    sa.plan_source AS agreement_plan_source
  FROM public.customers c
  LEFT JOIN LATERAL (
    SELECT
      count(*) AS job_count,
      bool_or(j.job_type = 'install') AS has_install,
      max(j.scheduled_date) AS last_job_date
    FROM public.jobs j
    WHERE j.customer_id = c.id
  ) jc ON true
  LEFT JOIN LATERAL (
    SELECT sa2.id, sa2.status, sa2.plan_name, sa2.end_date, sa2.plan_source
    FROM public.service_agreements sa2
    WHERE sa2.customer_id = c.id
    ORDER BY sa2.end_date DESC
    LIMIT 1
  ) sa ON true
$function$
