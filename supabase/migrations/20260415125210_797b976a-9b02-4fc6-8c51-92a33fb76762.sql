
-- Remove cron jobs targeting deleted edge functions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobname)
    FROM cron.job
    WHERE jobname ILIKE '%auto-follow-up%'
       OR jobname ILIKE '%jarvis-stall%'
       OR jobname ILIKE '%jarvis-approval%'
       OR jobname ILIKE '%send-completion%'
       OR jobname ILIKE '%send-review%'
       OR jobname ILIKE '%send-finance%'
       OR command ILIKE '%auto-follow-up-text%'
       OR command ILIKE '%jarvis-stall-check%'
       OR command ILIKE '%jarvis-approval-alert%'
       OR command ILIKE '%send-completion-summary%'
       OR command ILIKE '%send-review-request%'
       OR command ILIKE '%send-finance-notice%';
  END IF;
END $$;
