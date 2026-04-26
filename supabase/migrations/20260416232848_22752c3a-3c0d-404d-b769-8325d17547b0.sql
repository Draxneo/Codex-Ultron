
-- ============================================================
-- 1) New: auto-close schedule_followup todos when a job gets scheduled for the customer
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_close_todos_on_job_scheduled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Fire only when a scheduled_date is newly set (insert or change)
  IF NEW.scheduled_date IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.scheduled_date IS NOT DISTINCT FROM NEW.scheduled_date THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Close open schedule_followup todos for this customer
  -- Also close todos whose title mentions schedule/book/follow-up/maintenance
  UPDATE public.todos
  SET status = 'done',
      completed_at = now(),
      updated_at = now(),
      notes = COALESCE(notes, '') || E'\n[Auto-closed: job scheduled for ' || to_char(NEW.scheduled_date, 'Mon DD') || ']'
  WHERE status = 'open'
    AND customer_id = NEW.customer_id
    AND created_at < now()
    AND (
      action_type = 'schedule_followup'
      OR lower(title) ~ '\m(schedule|book|follow.?up|maintenance|tune.?up|coil cleaning)\M'
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_close_todos_on_job_scheduled_trg ON public.jobs;
CREATE TRIGGER auto_close_todos_on_job_scheduled_trg
AFTER INSERT OR UPDATE OF scheduled_date, customer_id ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.auto_close_todos_on_job_scheduled();

-- ============================================================
-- 2) Re-attach existing auto-close triggers (idempotent)
-- ============================================================

-- Invoice → close invoice/billing todos
DROP TRIGGER IF EXISTS auto_close_todos_on_invoice_trg ON public.customer_invoices;
CREATE TRIGGER auto_close_todos_on_invoice_trg
AFTER INSERT OR UPDATE OF status ON public.customer_invoices
FOR EACH ROW
EXECUTE FUNCTION public.auto_close_todos_on_invoice();

-- SMS → close send_sms todos when outbound SMS goes to customer
DROP TRIGGER IF EXISTS auto_close_todos_on_sms_trg ON public.sms_log;
CREATE TRIGGER auto_close_todos_on_sms_trg
AFTER INSERT ON public.sms_log
FOR EACH ROW
EXECUTE FUNCTION public.auto_close_todos_on_sms();

-- Call → close call_customer todos when call logged
DROP TRIGGER IF EXISTS auto_close_todos_on_call_trg ON public.call_log;
CREATE TRIGGER auto_close_todos_on_call_trg
AFTER INSERT OR UPDATE OF duration_seconds ON public.call_log
FOR EACH ROW
EXECUTE FUNCTION public.auto_close_todos_on_call();

-- Job note (HCP note appended) → close add_job_note todos
DROP TRIGGER IF EXISTS auto_close_todos_on_job_note_trg ON public.jobs;
CREATE TRIGGER auto_close_todos_on_job_note_trg
AFTER UPDATE OF hcp_note ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.auto_close_todos_on_job_note();

-- ============================================================
-- 3) Backfill: close any currently-open schedule todos for customers who already have a future job
-- ============================================================
UPDATE public.todos t
SET status = 'done',
    completed_at = now(),
    updated_at = now(),
    notes = COALESCE(t.notes, '') || E'\n[Auto-closed on backfill: customer already has scheduled job]'
WHERE t.status = 'open'
  AND t.customer_id IS NOT NULL
  AND (
    t.action_type = 'schedule_followup'
    OR lower(t.title) ~ '\m(schedule|book|follow.?up|maintenance|tune.?up|coil cleaning)\M'
  )
  AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.customer_id = t.customer_id
      AND j.scheduled_date >= CURRENT_DATE
      AND j.status NOT IN ('canceled', 'done', 'invoiced')
      AND j.created_at >= t.created_at - interval '1 hour'
  );
