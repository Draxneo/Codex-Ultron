
CREATE OR REPLACE FUNCTION public.get_customer_job_counts()
RETURNS TABLE(customer_id uuid, job_count bigint, last_job_date date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    j.customer_id,
    count(*) as job_count,
    max(j.scheduled_date) as last_job_date
  FROM public.jobs j
  WHERE j.customer_id IS NOT NULL
  GROUP BY j.customer_id
$$;
