-- Index on hcp_status for faster sync mismatch queries
CREATE INDEX IF NOT EXISTS idx_jobs_hcp_status ON public.jobs (hcp_status);

-- Bulk-resolve existing SMS-type workflow alerts (the noisy ones)
UPDATE public.workflow_alerts
SET resolved_at = now()
WHERE resolved_at IS NULL
  AND step_id IN (
    'confirmation', 'send_confirmation', 'dispatch', 'send_eta',
    'send_dispatch', 'eta', 'review_request', 'request_review',
    'follow_up_text', 'complete_follow_up'
  );

-- Auto-close completed workflow alerts older than 7 days
UPDATE public.workflow_alerts
SET resolved_at = now()
WHERE resolved_at IS NULL
  AND alert_type = 'completed'
  AND created_at < now() - interval '7 days';