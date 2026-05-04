-- 1. Add is_custom flag to track manual overrides
ALTER TABLE public.employee_tab_access
  ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT false;

-- 2. Mark all EXISTING rows as custom (they were manually set, like Irie's)
UPDATE public.employee_tab_access SET is_custom = true WHERE is_custom = false;

-- 3. Helper function: returns default tab keys for a given role
CREATE OR REPLACE FUNCTION public.get_role_default_tabs(_role text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE lower(COALESCE(_role, ''))
    WHEN 'admin' THEN ARRAY['jobs','phone','sms','inbox','customers','vendors','copilot','pay','admin']
    WHEN 'office' THEN ARRAY['jobs','phone','sms','inbox','customers','vendors','copilot','pay']
    WHEN 'supervisor' THEN ARRAY['jobs','phone','sms','customers','copilot','pay']
    WHEN 'tech' THEN ARRAY['jobs','phone','sms','pay']
    WHEN 'installer' THEN ARRAY['jobs','pay']
    ELSE ARRAY['jobs','phone','sms','inbox','customers','vendors','copilot','pay']
  END;
$$;

-- 4. Backfill: insert default row for every active employee with no row yet
INSERT INTO public.employee_tab_access (employee_id, allowed_tabs, is_custom, updated_at)
SELECT e.id, public.get_role_default_tabs(e.role), false, now()
FROM public.employees e
WHERE e.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.employee_tab_access eta WHERE eta.employee_id = e.id
  );

-- 5. Trigger: when an employee is created or role changes, sync defaults (unless customized)
CREATE OR REPLACE FUNCTION public.sync_employee_tab_access_on_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- On INSERT: always create a default row
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.employee_tab_access (employee_id, allowed_tabs, is_custom, updated_at)
    VALUES (NEW.id, public.get_role_default_tabs(NEW.role), false, now())
    ON CONFLICT (employee_id) DO NOTHING;
    RETURN NEW;
  END IF;

  -- On UPDATE: if role changed, update access row UNLESS it's custom
  IF TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN
    UPDATE public.employee_tab_access
    SET allowed_tabs = public.get_role_default_tabs(NEW.role),
        updated_at = now()
    WHERE employee_id = NEW.id AND is_custom = false;

    -- If no row exists yet, insert one
    INSERT INTO public.employee_tab_access (employee_id, allowed_tabs, is_custom, updated_at)
    SELECT NEW.id, public.get_role_default_tabs(NEW.role), false, now()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.employee_tab_access WHERE employee_id = NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_employee_tab_access_trigger ON public.employees;
CREATE TRIGGER sync_employee_tab_access_trigger
AFTER INSERT OR UPDATE OF role ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.sync_employee_tab_access_on_role_change();