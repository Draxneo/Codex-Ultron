-- 1. Fix the existing trigger to also set contact_name and contact_type
CREATE OR REPLACE FUNCTION public.link_call_to_customer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _normalized text;
  _cust record;
BEGIN
  _normalized := right(regexp_replace(NEW.phone_number, '\D', '', 'g'), 10);
  IF length(_normalized) < 10 THEN
    RETURN NEW;
  END IF;

  SELECT id, first_name, last_name INTO _cust
  FROM public.customers
  WHERE right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10) = _normalized
     OR right(regexp_replace(COALESCE(mobile_phone, ''), '\D', '', 'g'), 10) = _normalized
  LIMIT 1;

  IF _cust.id IS NOT NULL THEN
    NEW.related_customer_id := _cust.id;
    IF NEW.contact_name IS NULL OR NEW.contact_type = 'unknown' THEN
      NEW.contact_name := COALESCE(
        NULLIF(trim(COALESCE(_cust.first_name, '') || ' ' || COALESCE(_cust.last_name, '')), ''),
        NEW.contact_name
      );
      NEW.contact_type := 'customer';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. New function: when a customer is created/updated, backfill unresolved call_log and sms_log
CREATE OR REPLACE FUNCTION public.backfill_contact_on_customer_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _phone_norm text;
  _mobile_norm text;
  _display_name text;
BEGIN
  _phone_norm := right(regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g'), 10);
  _mobile_norm := right(regexp_replace(COALESCE(NEW.mobile_phone, ''), '\D', '', 'g'), 10);
  _display_name := NULLIF(trim(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, '')), '');

  IF _display_name IS NULL THEN
    RETURN NEW;
  END IF;

  IF length(_phone_norm) = 10 OR length(_mobile_norm) = 10 THEN
    UPDATE public.call_log
    SET contact_name = _display_name,
        contact_type = 'customer',
        related_customer_id = NEW.id
    WHERE (contact_name IS NULL OR contact_type = 'unknown')
      AND related_customer_id IS NULL
      AND (
        (length(_phone_norm) = 10 AND right(regexp_replace(phone_number, '\D', '', 'g'), 10) = _phone_norm)
        OR
        (length(_mobile_norm) = 10 AND right(regexp_replace(phone_number, '\D', '', 'g'), 10) = _mobile_norm)
      );

    UPDATE public.sms_log
    SET contact_name = _display_name,
        contact_type = 'customer'
    WHERE (contact_name IS NULL OR contact_type = 'unknown')
      AND (
        (length(_phone_norm) = 10 AND right(regexp_replace(phone_number, '\D', '', 'g'), 10) = _phone_norm)
        OR
        (length(_mobile_norm) = 10 AND right(regexp_replace(phone_number, '\D', '', 'g'), 10) = _mobile_norm)
      );
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_backfill_contact_on_customer_change
  AFTER INSERT OR UPDATE OF phone, mobile_phone, first_name, last_name
  ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.backfill_contact_on_customer_change();