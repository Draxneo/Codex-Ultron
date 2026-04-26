
-- Backfill customer_id on LSA leads by matching phone numbers to customers
UPDATE public.leads l
SET customer_id = matched.cust_id
FROM (
  SELECT DISTINCT ON (l2.id) l2.id as lead_id, c.id as cust_id
  FROM public.leads l2
  JOIN public.customers c ON (
    right(regexp_replace(COALESCE(c.phone,''), '\D', '', 'g'), 10) = right(regexp_replace(l2.phone, '\D', '', 'g'), 10)
    OR right(regexp_replace(COALESCE(c.mobile_phone,''), '\D', '', 'g'), 10) = right(regexp_replace(l2.phone, '\D', '', 'g'), 10)
  )
  WHERE l2.source = 'google_lsa'
    AND l2.customer_id IS NULL
    AND l2.phone IS NOT NULL
) matched
WHERE l.id = matched.lead_id;
