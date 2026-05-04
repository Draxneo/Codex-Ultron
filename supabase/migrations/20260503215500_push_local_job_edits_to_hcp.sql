-- ===========================================================================
-- Push local job edits to HCP (2026-05-03 PM)
-- ===========================================================================
-- COMPLEMENTS the protect_local_job_edits_from_hcp_sync defense:
--   - Defense: jobs.locally_modified_at + sync skip for 15 minutes
--   - Offense (this): when a user makes a local edit, fire-and-forget POST
--     to /functions/v1/push-job-to-hcp which PUTs the change to HCP
--
-- The two together give us:
--   - Local DB is the source of truth (writes from the app land first)
--   - HCP is mirrored from local (push-job-to-hcp updates HCP within ~1s)
--   - On the next minute sync, HCP and local agree → no overwrite
--   - If push-to-HCP fails, the 15-minute defense window protects the
--     local edit until the next manual retry / fix
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.push_local_job_edit_to_hcp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  _supabase_url text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF NEW.hcp_id IS NULL THEN RETURN NEW; END IF;

  -- Skip sync writes — they came FROM HCP, no need to push back.
  IF NEW.synced_at IS DISTINCT FROM OLD.synced_at THEN RETURN NEW; END IF;

  IF NOT (
       NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
    OR NEW.arrival_start  IS DISTINCT FROM OLD.arrival_start
    OR NEW.arrival_end    IS DISTINCT FROM OLD.arrival_end
    OR NEW.assigned_to    IS DISTINCT FROM OLD.assigned_to
  ) THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO _supabase_url
  FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  IF _supabase_url IS NULL THEN RETURN NEW; END IF;

  PERFORM public.safe_http_post(
    _supabase_url || '/functions/v1/push-job-to-hcp',
    jsonb_build_object(
      'job_id', NEW.id,
      'reason', 'local_edit_trigger'
    ),
    'push_local_job_edit_to_hcp',
    15000
  );

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_push_job_to_hcp_on_local_edit ON public.jobs;
CREATE TRIGGER trg_push_job_to_hcp_on_local_edit
AFTER UPDATE OF scheduled_date, arrival_start, arrival_end, assigned_to ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.push_local_job_edit_to_hcp();
