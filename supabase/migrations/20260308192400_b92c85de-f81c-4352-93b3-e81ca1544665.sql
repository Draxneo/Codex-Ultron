-- Fix generate_job_number: when HCP job has no invoice_number, auto-generate a native number
CREATE OR REPLACE FUNCTION public.generate_job_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.job_number IS NULL AND NEW.hcp_id IS NULL THEN
    -- Native job: auto-increment
    NEW.job_number := nextval('native_job_seq')::text;
  ELSIF NEW.job_number IS NULL AND NEW.hcp_job_number IS NOT NULL THEN
    -- HCP job with known job number
    NEW.job_number := NEW.hcp_job_number;
  ELSIF NEW.job_number IS NULL AND NEW.hcp_id IS NOT NULL AND NEW.hcp_job_number IS NULL THEN
    -- HCP job but no job number provided (e.g. CSR records): auto-generate
    NEW.job_number := nextval('native_job_seq')::text;
  END IF;
  RETURN NEW;
END;
$function$;

-- Backfill: assign job numbers to existing jobs that are missing them
UPDATE public.jobs
SET job_number = nextval('native_job_seq')::text
WHERE job_number IS NULL;