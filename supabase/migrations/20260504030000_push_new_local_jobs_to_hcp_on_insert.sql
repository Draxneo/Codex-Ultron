-- ===========================================================================
-- Push new local jobs to HCP on INSERT (2026-05-03 PM)
-- ===========================================================================
-- COMPLEMENTS the earlier UPDATE-side push (5bf0c72 + 39988ee). Without this
-- INSERT trigger, jobs created locally (e.g. via the Now HQ "Booked job"
-- action, or any direct insert from our app) never reach HCP — Clint's
-- direct report after creating Sandy's job 12236.
--
-- Behavior:
--   - Fires AFTER INSERT only when hcp_id IS NULL (new local jobs only —
--     skips the case where sync-hcp-jobs is INSERTing rows pulled from HCP)
--   - Skips if status is canceled / done / invoiced (no point pushing
--     finished work)
--   - Skips legacy HCP-imported rows that have import_run_id set
--   - Calls /functions/v1/create-hcp-job which:
--       1) Resolves or creates the HCP customer
--       2) POSTs the job to HCP with schedule + dispatch
--       3) Updates the local row with the returned hcp_id + hcp_job_number
--   - On failure, logs to system_error_log; doesn't block the INSERT itself
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.push_new_local_job_to_hcp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  _supabase_url text;
BEGIN
  IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;
  IF NEW.hcp_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.import_run_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.status IN ('canceled', 'done', 'invoiced') THEN RETURN NEW; END IF;
  IF NEW.customer_name IS NULL OR btrim(NEW.customer_name) = '' THEN RETURN NEW; END IF;
  IF NEW.customer_phone IS NULL OR btrim(NEW.customer_phone) = '' THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO _supabase_url
  FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  IF _supabase_url IS NULL THEN RETURN NEW; END IF;

  PERFORM public.safe_http_post(
    _supabase_url || '/functions/v1/create-hcp-job',
    jsonb_build_object(
      'customer_name', NEW.customer_name,
      'customer_phone', NEW.customer_phone,
      'customer_email', NEW.customer_email,
      'customer_id', NEW.customer_id,
      'address', NEW.address,
      'description', NEW.description,
      'job_type', COALESCE(NEW.job_type, 'service'),
      'scheduled_date', NEW.scheduled_date::text,
      'arrival_start', NEW.arrival_start::text,
      'arrival_end', NEW.arrival_end::text,
      'assigned_to', NEW.assigned_to,
      'created_by', 'auto_trigger_push_new_local_job',
      'is_estimate', false
    ),
    'push_new_local_job_to_hcp',
    20000
  );

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_push_new_local_job_to_hcp ON public.jobs;
CREATE TRIGGER trg_push_new_local_job_to_hcp
AFTER INSERT ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.push_new_local_job_to_hcp();
