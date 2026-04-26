
CREATE OR REPLACE FUNCTION public.get_revenue_by_month(months_back integer DEFAULT 6)
RETURNS TABLE(month text, revenue numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH month_series AS (
    SELECT generate_series(
      date_trunc('month', now()) - ((months_back - 1) || ' months')::interval,
      date_trunc('month', now()),
      '1 month'::interval
    )::date AS month_start
  )
  SELECT
    to_char(ms.month_start, 'Mon YYYY') AS month,
    COALESCE(SUM(ci.total), 0)::numeric AS revenue
  FROM month_series ms
  LEFT JOIN customer_invoices ci ON ci.status IN ('paid', 'sent')
    AND ci.job_id IS NOT NULL
  LEFT JOIN jobs j ON j.id = ci.job_id
    AND date_trunc('month', COALESCE(j.completed_at, j.scheduled_date::timestamp with time zone)) = ms.month_start
  GROUP BY ms.month_start
  ORDER BY ms.month_start
$$;
