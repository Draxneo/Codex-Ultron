
-- Add job_number column
ALTER TABLE public.jobs ADD COLUMN job_number text;

-- Sequence for native jobs starting at 9100
CREATE SEQUENCE public.native_job_seq START WITH 9100;

-- Backfill HCP jobs
UPDATE public.jobs SET job_number = hcp_job_number WHERE hcp_job_number IS NOT NULL;

-- Trigger: auto-assign job_number for native jobs
CREATE OR REPLACE FUNCTION public.generate_job_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.job_number IS NULL AND NEW.hcp_id IS NULL THEN
    NEW.job_number := nextval('native_job_seq')::text;
  ELSIF NEW.job_number IS NULL AND NEW.hcp_job_number IS NOT NULL THEN
    NEW.job_number := NEW.hcp_job_number;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER set_job_number BEFORE INSERT ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.generate_job_number();

-- Update invoice number trigger to use job_number
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _job_number text;
  _existing_count integer;
BEGIN
  IF NEW.invoice_number IS NULL THEN
    SELECT job_number INTO _job_number FROM public.jobs WHERE id = NEW.job_id;
    IF _job_number IS NOT NULL THEN
      SELECT COUNT(*) INTO _existing_count
      FROM public.customer_invoices WHERE job_id = NEW.job_id;
      IF _existing_count = 0 THEN
        NEW.invoice_number := _job_number;
      ELSE
        NEW.invoice_number := _job_number || '-' || CHR(65 + _existing_count);
      END IF;
    ELSE
      NEW.invoice_number := 'INV-' || LPAD(nextval('customer_invoice_seq')::text, 5, '0');
    END IF;
  END IF;
  RETURN NEW;
END; $$;

-- Backfill existing invoice numbers to match job numbers
UPDATE customer_invoices ci
SET invoice_number = j.hcp_job_number
FROM jobs j
WHERE ci.job_id = j.id AND j.hcp_job_number IS NOT NULL AND ci.hcp_invoice_id IS NOT NULL;
