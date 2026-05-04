CREATE OR REPLACE FUNCTION public.get_revenue_by_month(months_back integer DEFAULT 6)
 RETURNS TABLE(month text, revenue numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH month_series AS (
    SELECT generate_series(
      date_trunc('month', now()) - ((months_back - 1) || ' months')::interval,
      date_trunc('month', now()),
      '1 month'::interval
    )::date AS month_start
  ),
  invoice_months AS (
    SELECT
      date_trunc('month',
        COALESCE(
          ci.paid_at,
          j.scheduled_date::timestamp with time zone,
          j.created_at
        )
      )::date AS revenue_month,
      ci.total
    FROM customer_invoices ci
    JOIN jobs j ON j.id = ci.job_id
    WHERE ci.status IN ('paid', 'sent')
  )
  SELECT
    to_char(ms.month_start, 'Mon YYYY') AS month,
    COALESCE(SUM(im.total), 0)::numeric AS revenue
  FROM month_series ms
  LEFT JOIN invoice_months im ON im.revenue_month = ms.month_start
  GROUP BY ms.month_start
  ORDER BY ms.month_start
$function$;