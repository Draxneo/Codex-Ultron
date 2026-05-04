-- ============================================================
-- 1. ONE-TIME BACKFILL
-- ============================================================

-- Backfill: jobs with completed_at but still 'scheduled' → 'done'
UPDATE public.jobs
SET status = 'done'
WHERE completed_at IS NOT NULL
  AND status = 'scheduled';

-- Backfill: jobs with completed_at but stale hcp_status → mark complete
UPDATE public.jobs
SET hcp_status = 'complete unrated'
WHERE completed_at IS NOT NULL
  AND (hcp_status IS NULL OR hcp_status NOT ILIKE '%complete%')
  AND hcp_status NOT IN ('user canceled', 'pro canceled');

-- Backfill: stamp invoice_sent_at on jobs that have a sent/paid customer_invoice
UPDATE public.jobs j
SET invoice_sent_at = COALESCE(j.invoice_sent_at, ci.sent_at, ci.paid_at, ci.created_at)
FROM public.customer_invoices ci
WHERE ci.job_id = j.id
  AND ci.status IN ('sent', 'paid')
  AND j.invoice_sent_at IS NULL;

-- Backfill: stamp payment_collected_at on jobs that have a paid customer_invoice
UPDATE public.jobs j
SET payment_collected_at = COALESCE(j.payment_collected_at, ci.paid_at),
    status = CASE WHEN j.status NOT IN ('canceled') THEN 'invoiced' ELSE j.status END
FROM public.customer_invoices ci
WHERE ci.job_id = j.id
  AND ci.status = 'paid'
  AND ci.paid_at IS NOT NULL
  AND j.payment_collected_at IS NULL;

-- ============================================================
-- 2. TRIGGER: auto-promote job status when completed_at is set
-- ============================================================

CREATE OR REPLACE FUNCTION public.auto_promote_job_status_on_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL
     AND (OLD.completed_at IS NULL OR OLD.completed_at IS DISTINCT FROM NEW.completed_at)
     AND NEW.status NOT IN ('done', 'invoiced', 'canceled')
  THEN
    NEW.status := 'done';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_promote_job_status_on_complete ON public.jobs;
CREATE TRIGGER trg_auto_promote_job_status_on_complete
BEFORE UPDATE ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.auto_promote_job_status_on_complete();

-- ============================================================
-- 3. TRIGGER: sync invoice timestamps to parent job
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_invoice_status_to_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- When invoice marked as sent, stamp parent job's invoice_sent_at if null
  IF NEW.status = 'sent' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'sent') THEN
    UPDATE public.jobs
    SET invoice_sent_at = COALESCE(invoice_sent_at, NEW.sent_at, now())
    WHERE id = NEW.job_id
      AND invoice_sent_at IS NULL;
  END IF;

  -- When invoice marked as paid, stamp parent job's payment_collected_at + invoice_sent_at + status
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid') THEN
    UPDATE public.jobs
    SET
      invoice_sent_at = COALESCE(invoice_sent_at, NEW.sent_at, NEW.paid_at, now()),
      payment_collected_at = COALESCE(payment_collected_at, NEW.paid_at, now()),
      status = CASE WHEN status NOT IN ('canceled') THEN 'invoiced' ELSE status END,
      last_payment_error = NULL,
      last_payment_error_at = NULL
    WHERE id = NEW.job_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_invoice_status_to_job ON public.customer_invoices;
CREATE TRIGGER trg_sync_invoice_status_to_job
AFTER INSERT OR UPDATE OF status, paid_at, sent_at ON public.customer_invoices
FOR EACH ROW
EXECUTE FUNCTION public.sync_invoice_status_to_job();