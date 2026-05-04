CREATE OR REPLACE FUNCTION public.find_job_by_phone(digits text)
RETURNS TABLE(id uuid, hcp_job_number text, customer_name text, customer_phone text, job_type text, scheduled_date date)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT j.id, j.hcp_job_number, j.customer_name, j.customer_phone, j.job_type, j.scheduled_date
  FROM public.jobs j
  WHERE right(regexp_replace(COALESCE(j.customer_phone, ''), '\D', '', 'g'), 10) = digits
    AND j.status NOT IN ('done', 'invoiced', 'canceled')
  ORDER BY j.scheduled_date DESC
  LIMIT 1
$$;