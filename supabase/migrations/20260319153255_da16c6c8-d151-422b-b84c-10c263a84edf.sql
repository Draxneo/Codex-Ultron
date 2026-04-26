
-- Add related_customer_id to call_log for durable CRM linkage
ALTER TABLE public.call_log ADD COLUMN related_customer_id uuid;
CREATE INDEX idx_call_log_customer ON public.call_log(related_customer_id);

-- Auto-link trigger: on INSERT, match phone to customer
CREATE OR REPLACE FUNCTION public.link_call_to_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _normalized text;
  _cust_id uuid;
BEGIN
  _normalized := right(regexp_replace(NEW.phone_number, '\D', '', 'g'), 10);
  IF length(_normalized) < 10 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO _cust_id
  FROM public.customers
  WHERE right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10) = _normalized
     OR right(regexp_replace(COALESCE(mobile_phone, ''), '\D', '', 'g'), 10) = _normalized
  LIMIT 1;

  IF _cust_id IS NOT NULL THEN
    NEW.related_customer_id := _cust_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_link_call_to_customer
  BEFORE INSERT ON public.call_log
  FOR EACH ROW
  EXECUTE FUNCTION public.link_call_to_customer();

-- Backfill existing records
UPDATE public.call_log cl
SET related_customer_id = c.id
FROM public.customers c
WHERE cl.related_customer_id IS NULL
  AND (
    right(regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g'), 10) = right(regexp_replace(cl.phone_number, '\D', '', 'g'), 10)
    OR right(regexp_replace(COALESCE(c.mobile_phone, ''), '\D', '', 'g'), 10) = right(regexp_replace(cl.phone_number, '\D', '', 'g'), 10)
  )
  AND length(right(regexp_replace(cl.phone_number, '\D', '', 'g'), 10)) = 10;
