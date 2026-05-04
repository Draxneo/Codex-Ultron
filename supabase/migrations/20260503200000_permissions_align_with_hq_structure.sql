-- ===========================================================================
-- Permissions matrix realignment (2026-05-03)
-- ===========================================================================
-- The old keys (jobs / phone / sms / inbox / chat / customers / copilot / pay
-- / admin) didn't match the actual HQ structure of the app:
--   - "inbox" was a deprecated route that redirected to /phone or /sms
--   - "chat" was doing double-duty for the Team HQ
--   - "jobs" was overloaded across /tech, /intake, /now, /dispatch, /catalog
--   - The 7 real Operating HQs (Intake/Now/Dispatch/Tech/Quote/Customer/Team)
--     had no individual representation in the matrix
--
-- New 12-key vocabulary (also see src/lib/roleAccessDefaults.ts and
-- src/hooks/useEmployeeTabAccess.ts for the JS side):
--   tech, intake, now, dispatch, quote, customer, team,
--   phone, sms, jarvis, pay, admin
-- ===========================================================================

-- 1. Updated role default function
CREATE OR REPLACE FUNCTION public.get_role_default_tabs(_role text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE lower(COALESCE(_role, ''))
    WHEN 'admin' THEN ARRAY[
      'tech','intake','now','dispatch','quote','customer','team',
      'phone','sms','jarvis','pay','admin'
    ]
    WHEN 'office' THEN ARRAY[
      'intake','now','dispatch','quote','customer','team',
      'phone','sms','jarvis','pay'
    ]
    WHEN 'supervisor' THEN ARRAY[
      'tech','now','dispatch','customer','team',
      'phone','sms','jarvis','pay'
    ]
    WHEN 'tech' THEN ARRAY[
      'tech','phone','sms','team','pay'
    ]
    WHEN 'installer' THEN ARRAY[
      'tech','team','pay'
    ]
    ELSE ARRAY[
      'intake','now','dispatch','quote','customer','team',
      'phone','sms','jarvis','pay'
    ]
  END;
$$;

-- 2. Migrate existing rows to new vocabulary.
--    Mapping rules (per row, looking at role context):
--      jobs   → tech + (intake, now, dispatch, quote if role is admin/office/supervisor)
--      inbox  → drop (route was deprecated, lived under phone+sms)
--      chat   → team
--      customers → customer
--      copilot → jarvis
--      vendors → customer (vendors lives in CRM/Customer HQ now)
--      phone, sms, pay, admin → unchanged
CREATE OR REPLACE FUNCTION public._tmp_migrate_old_tab_keys(old_tabs text[], _role text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $func$
DECLARE
  result text[] := ARRAY[]::text[];
  k text;
  is_office_class boolean;
BEGIN
  is_office_class := lower(COALESCE(_role,'')) IN ('admin','office','supervisor');

  IF old_tabs IS NULL THEN
    RETURN public.get_role_default_tabs(_role);
  END IF;

  FOREACH k IN ARRAY old_tabs LOOP
    CASE lower(k)
      WHEN 'jobs' THEN
        result := result || ARRAY['tech'];
        IF is_office_class THEN
          result := result || ARRAY['intake','now','dispatch','quote'];
        END IF;
      WHEN 'inbox' THEN NULL;
      WHEN 'chat' THEN result := result || ARRAY['team'];
      WHEN 'customers' THEN result := result || ARRAY['customer'];
      WHEN 'vendors' THEN result := result || ARRAY['customer'];
      WHEN 'copilot' THEN result := result || ARRAY['jarvis'];
      WHEN 'phone','sms','team','pay','admin','tech','intake','now','dispatch','quote','customer','jarvis' THEN
        result := result || ARRAY[lower(k)];
      ELSE NULL;
    END CASE;
  END LOOP;

  RETURN (
    SELECT array_agg(DISTINCT key ORDER BY key)
    FROM unnest(result) AS key
  );
END;
$func$;

-- 3. Apply translation to every existing row
UPDATE public.employee_tab_access eta
SET allowed_tabs = public._tmp_migrate_old_tab_keys(eta.allowed_tabs, e.role),
    updated_at = NOW()
FROM public.employees e
WHERE eta.employee_id = e.id;

-- 4. For non-custom rows, snap to fresh role defaults — clean baseline
UPDATE public.employee_tab_access eta
SET allowed_tabs = public.get_role_default_tabs(e.role),
    updated_at = NOW()
FROM public.employees e
WHERE eta.employee_id = e.id
  AND eta.is_custom = false;

-- 5. Force admins to defaults regardless of is_custom — matches the UI which
--    always shows admins as "full" with all checkboxes disabled+checked
UPDATE public.employee_tab_access eta
SET allowed_tabs = public.get_role_default_tabs('admin'),
    is_custom = false,
    updated_at = NOW()
FROM public.employees e
WHERE eta.employee_id = e.id
  AND lower(e.role) = 'admin';

-- 6. Drop temp helper
DROP FUNCTION public._tmp_migrate_old_tab_keys(text[], text);
