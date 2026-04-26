
-- ============================================================
-- 1) Auto-close send_email todos when an outbound email is sent
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_close_todos_on_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _customer_id uuid;
  _to_email text;
BEGIN
  -- only fire on outbound emails
  IF COALESCE(NEW.is_outbound, false) = false THEN
    RETURN NEW;
  END IF;

  _customer_id := NEW.linked_customer_id;
  _to_email := lower(trim(COALESCE(NEW.to_address, '')));

  -- Resolve customer by recipient email if not already linked
  IF _customer_id IS NULL AND _to_email <> '' THEN
    SELECT id INTO _customer_id
    FROM public.customers
    WHERE lower(email) = _to_email
    LIMIT 1;
  END IF;

  -- Close matching open send_email todos: by customer or by raw email in source_ref/action_meta
  UPDATE public.todos
  SET status = 'done',
      completed_at = now(),
      updated_at = now(),
      notes = COALESCE(notes, '') || E'\n[Auto-closed: email sent ' || to_char(now() AT TIME ZONE 'America/Chicago', 'Mon DD HH24:MI') || ']'
  WHERE status = 'open'
    AND action_type = 'send_email'
    AND created_at < COALESCE(NEW.received_at, NEW.created_at, now())
    AND (
      (_customer_id IS NOT NULL AND customer_id = _customer_id)
      OR (_to_email <> '' AND lower(COALESCE(source_ref, '')) = _to_email)
      OR (_to_email <> '' AND lower(COALESCE(action_meta->>'email', '')) = _to_email)
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_close_todos_on_email_trg ON public.emails;
CREATE TRIGGER auto_close_todos_on_email_trg
AFTER INSERT ON public.emails
FOR EACH ROW
EXECUTE FUNCTION public.auto_close_todos_on_email();

-- ============================================================
-- 2) Auto-close add_job_note todos when an activity_log note is added on the job
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_close_todos_on_activity_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.job_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only fire when the activity is a note-style entry
  IF lower(COALESCE(NEW.action, '')) NOT IN ('note_added', 'note', 'job_note', 'add_note', 'note_appended') THEN
    -- Also accept any action whose details indicate a note was added
    IF lower(COALESCE(NEW.action, '')) NOT LIKE '%note%' THEN
      RETURN NEW;
    END IF;
  END IF;

  UPDATE public.todos
  SET status = 'done',
      completed_at = now(),
      updated_at = now(),
      notes = COALESCE(notes, '') || E'\n[Auto-closed: job note added ' || to_char(now() AT TIME ZONE 'America/Chicago', 'Mon DD HH24:MI') || ']'
  WHERE status = 'open'
    AND action_type = 'add_job_note'
    AND job_id = NEW.job_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_close_todos_on_activity_note_trg ON public.activity_log;
CREATE TRIGGER auto_close_todos_on_activity_note_trg
AFTER INSERT ON public.activity_log
FOR EACH ROW
EXECUTE FUNCTION public.auto_close_todos_on_activity_note();
