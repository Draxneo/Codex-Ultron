-- ============================================================
-- 1. SNOOZE COLUMN
-- ============================================================
ALTER TABLE public.todos
ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_todos_snoozed_until ON public.todos(snoozed_until) WHERE snoozed_until IS NOT NULL;

-- ============================================================
-- 2. AUTO-CLOSE TODOS WHEN SMS SENT
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_close_todos_on_sms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _digits text;
  _customer_id uuid;
BEGIN
  -- only outbound from us closes a "remember to text" todo
  IF NEW.direction <> 'outbound' THEN
    RETURN NEW;
  END IF;

  _digits := right(regexp_replace(COALESCE(NEW.phone_number, ''), '\D', '', 'g'), 10);
  IF length(_digits) < 10 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO _customer_id
  FROM public.customers
  WHERE right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10) = _digits
     OR right(regexp_replace(COALESCE(mobile_phone, ''), '\D', '', 'g'), 10) = _digits
  LIMIT 1;

  -- Close send_sms todos that match by customer OR by raw phone in source_ref
  UPDATE public.todos
  SET status = 'done',
      completed_at = now(),
      updated_at = now(),
      notes = COALESCE(notes, '') || E'\n[Auto-closed: SMS sent ' || to_char(now() AT TIME ZONE 'America/Chicago', 'Mon DD HH24:MI') || ']'
  WHERE status = 'open'
    AND action_type = 'send_sms'
    AND created_at < NEW.created_at
    AND (
      (_customer_id IS NOT NULL AND customer_id = _customer_id)
      OR right(regexp_replace(COALESCE(source_ref, ''), '\D', '', 'g'), 10) = _digits
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_close_todos_on_sms ON public.sms_log;
CREATE TRIGGER trg_auto_close_todos_on_sms
AFTER INSERT ON public.sms_log
FOR EACH ROW
EXECUTE FUNCTION public.auto_close_todos_on_sms();

-- ============================================================
-- 3. AUTO-CLOSE TODOS WHEN CALL MADE
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_close_todos_on_call()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _digits text;
  _customer_id uuid;
BEGIN
  _digits := right(regexp_replace(COALESCE(NEW.phone_number, ''), '\D', '', 'g'), 10);
  IF length(_digits) < 10 THEN
    RETURN NEW;
  END IF;

  -- only meaningful calls (>= 15s) count as "the callback happened"
  IF COALESCE(NEW.duration_seconds, 0) < 15 AND NEW.direction <> 'outbound' THEN
    RETURN NEW;
  END IF;

  _customer_id := NEW.related_customer_id;
  IF _customer_id IS NULL THEN
    SELECT id INTO _customer_id
    FROM public.customers
    WHERE right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10) = _digits
       OR right(regexp_replace(COALESCE(mobile_phone, ''), '\D', '', 'g'), 10) = _digits
    LIMIT 1;
  END IF;

  UPDATE public.todos
  SET status = 'done',
      completed_at = now(),
      updated_at = now(),
      notes = COALESCE(notes, '') || E'\n[Auto-closed: call logged ' || to_char(now() AT TIME ZONE 'America/Chicago', 'Mon DD HH24:MI') || ']'
  WHERE status = 'open'
    AND action_type = 'call_customer'
    AND created_at < COALESCE(NEW.started_at, NEW.created_at)
    AND (
      (_customer_id IS NOT NULL AND customer_id = _customer_id)
      OR right(regexp_replace(COALESCE(source_ref, ''), '\D', '', 'g'), 10) = _digits
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_close_todos_on_call ON public.call_log;
CREATE TRIGGER trg_auto_close_todos_on_call
AFTER INSERT OR UPDATE OF duration_seconds, ended_at ON public.call_log
FOR EACH ROW
EXECUTE FUNCTION public.auto_close_todos_on_call();

-- ============================================================
-- 4. AUTO-CLOSE TODOS WHEN INVOICE CREATED
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_close_todos_on_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _customer_id uuid;
BEGIN
  SELECT customer_id INTO _customer_id FROM public.jobs WHERE id = NEW.job_id;

  UPDATE public.todos
  SET status = 'done',
      completed_at = now(),
      updated_at = now(),
      notes = COALESCE(notes, '') || E'\n[Auto-closed: invoice ' || COALESCE(NEW.invoice_number, 'created') || ']'
  WHERE status = 'open'
    AND (
      job_id = NEW.job_id
      OR (_customer_id IS NOT NULL AND customer_id = _customer_id)
    )
    AND (
      lower(title) LIKE '%invoice%'
      OR lower(title) LIKE '%bill%'
      OR lower(title) LIKE '%collect payment%'
      OR lower(COALESCE(notes,'')) LIKE '%send invoice%'
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_close_todos_on_invoice ON public.customer_invoices;
CREATE TRIGGER trg_auto_close_todos_on_invoice
AFTER INSERT ON public.customer_invoices
FOR EACH ROW
EXECUTE FUNCTION public.auto_close_todos_on_invoice();

-- ============================================================
-- 5. AUTO-CLOSE TODOS WHEN JOB NOTE ADDED
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_close_todos_on_job_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- only fire when hcp_note actually got longer (note appended)
  IF COALESCE(length(NEW.hcp_note), 0) <= COALESCE(length(OLD.hcp_note), 0) THEN
    RETURN NEW;
  END IF;

  UPDATE public.todos
  SET status = 'done',
      completed_at = now(),
      updated_at = now(),
      notes = COALESCE(notes, '') || E'\n[Auto-closed: job note added]'
  WHERE status = 'open'
    AND action_type = 'add_job_note'
    AND job_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_close_todos_on_job_note ON public.jobs;
CREATE TRIGGER trg_auto_close_todos_on_job_note
AFTER UPDATE OF hcp_note ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.auto_close_todos_on_job_note();

-- ============================================================
-- 6. HELPER FUNCTION: resolve open job for customer (used by extraction)
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_open_job_for_customer(_customer_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.jobs
  WHERE customer_id = _customer_id
    AND status NOT IN ('done', 'invoiced', 'canceled')
  ORDER BY scheduled_date DESC NULLS LAST, created_at DESC
  LIMIT 1
$$;