ALTER TABLE public.ivr_menu_options
  ADD COLUMN IF NOT EXISTS routing_department_key text;

UPDATE public.ivr_menu_options
SET routing_department_key = CASE
  WHEN digit = '1' THEN 'service'
  WHEN digit = '2' THEN 'sales'
  WHEN lower(coalesce(label, '')) LIKE '%sales%' THEN 'sales'
  WHEN lower(coalesce(label, '')) LIKE '%service%'
    OR lower(coalesce(label, '')) LIKE '%repair%'
    OR lower(coalesce(label, '')) LIKE '%tech%' THEN 'service'
  WHEN lower(coalesce(label, '')) LIKE '%bill%'
    OR lower(coalesce(label, '')) LIKE '%pay%'
    OR lower(coalesce(label, '')) LIKE '%invoic%' THEN 'billing'
  ELSE 'general'
END
WHERE routing_department_key IS NULL
  OR routing_department_key NOT IN ('sales', 'service', 'billing', 'general');

CREATE OR REPLACE FUNCTION public.set_ivr_menu_option_routing_department_key()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.routing_department_key IS NULL OR NEW.routing_department_key = '' THEN
    NEW.routing_department_key := CASE
      WHEN lower(coalesce(NEW.label, '')) LIKE '%sales%' THEN 'sales'
      WHEN lower(coalesce(NEW.label, '')) LIKE '%service%'
        OR lower(coalesce(NEW.label, '')) LIKE '%repair%'
        OR lower(coalesce(NEW.label, '')) LIKE '%tech%' THEN 'service'
      WHEN lower(coalesce(NEW.label, '')) LIKE '%bill%'
        OR lower(coalesce(NEW.label, '')) LIKE '%pay%'
        OR lower(coalesce(NEW.label, '')) LIKE '%invoic%' THEN 'billing'
      ELSE 'general'
    END;
  ELSE
    NEW.routing_department_key := lower(trim(NEW.routing_department_key));
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_ivr_menu_options_set_routing_department_key'
  ) THEN
    CREATE TRIGGER trg_ivr_menu_options_set_routing_department_key
      BEFORE INSERT ON public.ivr_menu_options
      FOR EACH ROW
      EXECUTE FUNCTION public.set_ivr_menu_option_routing_department_key();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ivr_menu_options_routing_department_key_check'
  ) THEN
    ALTER TABLE public.ivr_menu_options
      ADD CONSTRAINT ivr_menu_options_routing_department_key_check
      CHECK (routing_department_key IN ('sales', 'service', 'billing', 'general'));
  END IF;
END $$;

ALTER TABLE public.ivr_menu_options
  ALTER COLUMN routing_department_key SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ivr_menu_options_routing_department_key
  ON public.ivr_menu_options (routing_department_key)
  WHERE is_active = true;
