-- ===========================================================================
-- Protect local job edits from being overwritten by HCP sync (2026-05-03 PM)
-- ===========================================================================
-- BUG: every minute the hcp-bridge-sync cron pulls each job's HCP-side state
-- and overwrites our copy via diffJobFields() → UPDATE. If a user just
-- rescheduled a job in the app, that local change gets reverted within 60s
-- because HCP doesn't yet have the new value (we don't push back to HCP).
--
-- Confirmed scenario (Clint, job e8ba6517 / job# 8491):
--   19:38:12  user updates scheduled_date Sat May 02 → Sun May 03
--   19:39:10  hcp-bridge-sync reverts to Sat May 02 (HCP still has Saturday)
--   ...sync wins on every subsequent minute. User's edit is silently gone.
--
-- FIX: trigger stamps locally_modified_at on local-only UPDATE writes
-- (distinguishable from HCP sync writes because the sync's diffJobFields
-- always sets synced_at and local writes never do — see
-- supabase/functions/_shared/hcp-mapper.ts:278). The sync function in
-- a follow-up commit reads that column and skips jobs modified within
-- the last 15 minutes.
--
-- This is a defense-only fix. A future commit will add push-to-HCP on
-- local edit so the protection window isn't needed at all.
-- ===========================================================================

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS locally_modified_at timestamptz;

CREATE INDEX IF NOT EXISTS jobs_locally_modified_at_idx
  ON public.jobs (locally_modified_at)
  WHERE locally_modified_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.stamp_locally_modified_at()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;

  -- Sync writes always change synced_at (diffJobFields adds it on every diff).
  -- Local writes don't touch synced_at, so when it's unchanged we're seeing a
  -- local edit and we stamp the column.
  IF NEW.synced_at IS DISTINCT FROM OLD.synced_at THEN
    RETURN NEW;
  END IF;

  IF (NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date)
     OR (NEW.arrival_start IS DISTINCT FROM OLD.arrival_start)
     OR (NEW.arrival_end IS DISTINCT FROM OLD.arrival_end)
     OR (NEW.assigned_to IS DISTINCT FROM OLD.assigned_to)
     OR (NEW.status IS DISTINCT FROM OLD.status)
  THEN
    NEW.locally_modified_at := NOW();
  END IF;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_stamp_locally_modified_at ON public.jobs;
CREATE TRIGGER trg_stamp_locally_modified_at
BEFORE UPDATE ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.stamp_locally_modified_at();
