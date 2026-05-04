-- Keep the canonical read models fast.
-- The first pass deliberately unified the business story. This pass avoids
-- expensive phone-number inference inside Dispatch and Quote views; direct
-- job/estimate links stay fast and background linking can enrich records later.

CREATE INDEX IF NOT EXISTS sms_log_related_job_id_idx
  ON public.sms_log (related_job_id);

CREATE INDEX IF NOT EXISTS call_log_related_job_id_idx
  ON public.call_log (related_job_id);

CREATE INDEX IF NOT EXISTS sms_log_related_estimate_id_idx
  ON public.sms_log (related_estimate_id);

CREATE INDEX IF NOT EXISTS call_log_related_estimate_id_idx
  ON public.call_log (related_estimate_id);

CREATE OR REPLACE VIEW public.v_dispatch_live_cards
WITH (security_invoker = true)
AS
SELECT
  j.id AS job_id,
  j.customer_id,
  COALESCE(j.job_number, j.hcp_job_number) AS job_number,
  j.customer_name,
  j.customer_phone,
  j.customer_email,
  j.address,
  j.job_type,
  j.status,
  j.hcp_status,
  j.scheduled_date,
  j.arrival_start,
  j.arrival_end,
  j.arrival_time,
  j.assigned_to,
  j.description,
  j.travel_time_minutes,
  j.on_my_way_sent_at,
  j.photos_uploaded_at,
  j.completed_at,
  j.invoice_sent_at,
  j.payment_collected_at,
  j.warranty_registered_at,
  j.rebate_submitted_at,
  j.inspection_scheduled_at,
  j.inspection_passed_at,
  j.hold_reason,
  j.paused_at,
  COALESCE(attachments.attachment_count, 0) AS attachment_count,
  attachments.latest_attachment_at,
  comm.latest_communication_at,
  comm.latest_communication_type,
  comm.latest_communication_summary,
  alerts.open_alert_count,
  alerts.highest_alert_severity,
  CASE
    WHEN j.paused_at IS NOT NULL THEN 'Paused'
    WHEN COALESCE(alerts.open_alert_count, 0) > 0 THEN 'Needs attention'
    WHEN j.completed_at IS NOT NULL THEN 'Completed'
    WHEN j.arrival_time IS NOT NULL THEN 'On site'
    WHEN j.on_my_way_sent_at IS NOT NULL THEN 'On the way'
    WHEN j.arrival_start IS NOT NULL THEN 'Scheduled'
    ELSE 'Needs schedule'
  END AS card_status
FROM public.jobs j
LEFT JOIN LATERAL (
  SELECT count(*)::integer AS attachment_count, max(created_at) AS latest_attachment_at
  FROM public.job_attachments a
  WHERE a.job_id = j.id
) attachments ON true
LEFT JOIN LATERAL (
  SELECT
    x.event_at AS latest_communication_at,
    x.source_type AS latest_communication_type,
    x.summary_text AS latest_communication_summary
  FROM (
    SELECT
      s.created_at AS event_at,
      'sms'::text AS source_type,
      NULLIF(s.body, '') AS summary_text
    FROM public.sms_log s
    WHERE s.related_job_id = j.id
    UNION ALL
    SELECT
      COALESCE(c.started_at, c.created_at) AS event_at,
      'call'::text AS source_type,
      NULLIF(COALESCE(c.ai_summary, c.summary, c.transcription), '') AS summary_text
    FROM public.call_log c
    WHERE c.related_job_id = j.id
  ) x
  ORDER BY x.event_at DESC NULLS LAST
  LIMIT 1
) comm ON true
LEFT JOIN LATERAL (
  SELECT
    count(*)::integer AS open_alert_count,
    (array_agg(COALESCE(alert_type, 'open') ORDER BY created_at DESC))[1] AS highest_alert_severity
  FROM public.workflow_alerts wa
  WHERE wa.job_id = j.id
    AND wa.resolved_at IS NULL
    AND COALESCE(wa.is_active, true) = true
) alerts ON true;

CREATE OR REPLACE VIEW public.v_quote_pipeline
WITH (security_invoker = true)
AS
SELECT
  e.id AS estimate_id,
  e.customer_id,
  e.source_job_id,
  e.converted_job_id,
  e.estimate_number,
  e.customer_name,
  e.customer_phone,
  e.customer_email,
  e.address,
  e.estimate_type,
  COALESCE(e.status, e.work_status, e.hcp_status) AS status,
  e.total_amount,
  e.scheduled_date,
  e.arrival_start,
  e.arrival_end,
  e.assigned_to,
  e.presentation_sent_at,
  e.customer_approved_at,
  e.brochure_sent,
  e.created_at,
  comm.latest_communication_at,
  comm.latest_communication_type,
  comm.latest_communication_summary,
  CASE
    WHEN e.customer_approved_at IS NOT NULL THEN 'Approved'
    WHEN e.presentation_sent_at IS NOT NULL THEN 'Waiting on customer'
    WHEN e.scheduled_date IS NOT NULL THEN 'Estimate visit scheduled'
    ELSE 'Needs next step'
  END AS pipeline_stage
FROM public.estimates e
LEFT JOIN LATERAL (
  SELECT
    x.event_at AS latest_communication_at,
    x.source_type AS latest_communication_type,
    x.summary_text AS latest_communication_summary
  FROM (
    SELECT
      s.created_at AS event_at,
      'sms'::text AS source_type,
      NULLIF(s.body, '') AS summary_text
    FROM public.sms_log s
    WHERE s.related_estimate_id = e.id
    UNION ALL
    SELECT
      COALESCE(c.started_at, c.created_at) AS event_at,
      'call'::text AS source_type,
      NULLIF(COALESCE(c.ai_summary, c.summary, c.transcription), '') AS summary_text
    FROM public.call_log c
    WHERE c.related_estimate_id = e.id
  ) x
  ORDER BY x.event_at DESC NULLS LAST
  LIMIT 1
) comm ON true;
