CREATE OR REPLACE FUNCTION public.find_customer_by_phone(digits text)
RETURNS TABLE(id uuid, first_name text, last_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id, c.first_name, c.last_name
  FROM public.customers c
  WHERE right(regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g'), 10) = digits
     OR right(regexp_replace(COALESCE(c.mobile_phone, ''), '\D', '', 'g'), 10) = digits
  LIMIT 1
$$;