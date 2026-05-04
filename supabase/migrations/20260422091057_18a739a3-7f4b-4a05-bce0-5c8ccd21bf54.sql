CREATE OR REPLACE FUNCTION public.sync_sms_status_from_delivery()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.status := CASE lower(coalesce(NEW.delivery_status, ''))
    WHEN 'queued'        THEN 'queued'
    WHEN 'queued_retry'  THEN 'queued'
    WHEN 'accepted'      THEN 'queued'
    WHEN 'scheduled'     THEN 'queued'
    WHEN 'sending'       THEN 'sending'
    WHEN 'sent'          THEN 'sent'
    WHEN 'receiving'     THEN 'sent'
    WHEN 'received'      THEN 'delivered'
    WHEN 'delivered'     THEN 'delivered'
    WHEN 'read'          THEN 'delivered'
    WHEN 'undelivered'   THEN 'failed'
    WHEN 'failed'        THEN 'failed'
    WHEN 'canceled'      THEN 'failed'
    ELSE coalesce(NEW.status, 'sent')
  END;

  IF NEW.delivery_status IN ('failed','undelivered','canceled')
     AND NEW.error_message IS NULL
     AND NEW.error_code IS NOT NULL THEN
    NEW.error_message := 'Twilio error ' || NEW.error_code;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_sms_status ON public.sms_log;
CREATE TRIGGER trg_sync_sms_status
BEFORE INSERT OR UPDATE OF delivery_status, error_code ON public.sms_log
FOR EACH ROW
EXECUTE FUNCTION public.sync_sms_status_from_delivery();

UPDATE public.sms_log
SET delivery_status = delivery_status
WHERE delivery_status IS NOT NULL;