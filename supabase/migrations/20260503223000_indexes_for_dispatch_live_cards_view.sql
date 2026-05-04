-- v_dispatch_live_cards has 3 LATERAL JOINs against job_attachments,
-- workflow_alerts, and v_unified_communications. With 82 jobs that's
-- 246 lookups per page render. None of those tables had a covering
-- index on job_id, so Postgres did seq scans, hitting the statement
-- timeout on slow mobile connections. (2026-05-03 fix for the
-- 'canceling statement due to statement timeout' warnings.)

CREATE INDEX IF NOT EXISTS idx_job_attachments_job_id_active
  ON public.job_attachments (job_id)
  WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_alerts_job_id_active
  ON public.workflow_alerts (job_id)
  WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_log_related_job_id
  ON public.sms_log (related_job_id)
  WHERE related_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_call_log_related_job_id
  ON public.call_log (related_job_id)
  WHERE related_job_id IS NOT NULL;

ANALYZE public.job_attachments;
ANALYZE public.workflow_alerts;
ANALYZE public.sms_log;
ANALYZE public.call_log;
