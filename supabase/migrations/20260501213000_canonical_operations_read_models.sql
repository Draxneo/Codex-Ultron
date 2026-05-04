-- Canonical operations read models.
-- These views give Intake, NOW, Dispatch, Customer HQ, Quote HQ, Tech, and
-- Jarvis the same clean windows into the business without forcing each screen
-- to stitch together raw tables differently.

CREATE OR REPLACE FUNCTION public.phone_last10(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT right(regexp_replace(coalesce(value, ''), '\D', '', 'g'), 10)
$$;

CREATE OR REPLACE VIEW public.v_unified_communications
WITH (security_invoker = true)
AS
WITH sms_events AS (
  SELECT
    ('sms:' || s.id::text) AS communication_id,
    s.id AS source_id,
    'sms_log'::text AS source_table,
    'sms'::text AS source_type,
    'sms'::text AS intake_channel,
    s.direction,
    s.created_at AS event_at,
    s.phone_number,
    public.phone_last10(s.phone_number) AS phone_last10,
    s.contact_name,
    s.contact_type,
    s.related_customer_id,
    s.related_job_id,
    s.related_estimate_id,
    s.body AS body,
    NULL::text AS transcription,
    NULL::text AS ai_summary,
    NULL::text AS recording_url,
    s.media_urls,
    s.twilio_sid,
    s.message_sid,
    s.delivery_status,
    s.status,
    s.error_code,
    s.error_message,
    s.is_read,
    s.source_function,
    s.template_key,
    jsonb_build_object(
      'to_number', s.to_number,
      'num_media', s.num_media,
      'num_segments', s.num_segments,
      'client_id', s.client_id
    ) AS metadata
  FROM public.sms_log s
),
call_events AS (
  SELECT
    ('call:' || c.id::text) AS communication_id,
    c.id AS source_id,
    'call_log'::text AS source_table,
    'call'::text AS source_type,
    'call'::text AS intake_channel,
    c.direction,
    COALESCE(c.started_at, c.created_at) AS event_at,
    c.phone_number,
    public.phone_last10(c.phone_number) AS phone_last10,
    c.contact_name,
    c.contact_type,
    c.related_customer_id,
    c.related_job_id,
    c.related_estimate_id,
    c.summary AS body,
    c.transcription,
    COALESCE(c.ai_summary, c.summary) AS ai_summary,
    c.recording_url,
    NULL::text[] AS media_urls,
    c.twilio_sid,
    NULL::text AS message_sid,
    NULL::text AS delivery_status,
    c.status,
    NULL::text AS error_code,
    NULL::text AS error_message,
    c.is_read,
    NULL::text AS source_function,
    NULL::text AS template_key,
    jsonb_build_object(
      'ended_at', c.ended_at,
      'duration_seconds', c.duration_seconds,
      'recording_duration', c.recording_duration,
      'answered_by', c.answered_by,
      'device_answered', c.device_answered,
      'department_key', c.department_key,
      'route_type', c.route_type,
      'parent_call_sid', c.parent_call_sid,
      'transcription_status', c.transcription_status,
      'extracted_data', c.extracted_data,
      'call_extraction', c.call_extraction
    ) AS metadata
  FROM public.call_log c
),
voicemail_events AS (
  SELECT
    ('voicemail:' || v.id::text) AS communication_id,
    v.id AS source_id,
    'voicemails'::text AS source_table,
    'voicemail'::text AS source_type,
    'call'::text AS intake_channel,
    'inbound'::text AS direction,
    v.created_at AS event_at,
    v.phone_number,
    public.phone_last10(v.phone_number) AS phone_last10,
    v.contact_name,
    v.contact_type,
    cl.related_customer_id,
    cl.related_job_id,
    cl.related_estimate_id,
    NULL::text AS body,
    v.transcription,
    cl.ai_summary,
    v.recording_url,
    NULL::text[] AS media_urls,
    cl.twilio_sid,
    NULL::text AS message_sid,
    NULL::text AS delivery_status,
    'voicemail'::text AS status,
    NULL::text AS error_code,
    NULL::text AS error_message,
    v.is_read,
    NULL::text AS source_function,
    NULL::text AS template_key,
    jsonb_build_object(
      'call_log_id', v.call_log_id,
      'duration_seconds', v.duration_seconds,
      'recording_sid', v.recording_sid
    ) AS metadata
  FROM public.voicemails v
  LEFT JOIN public.call_log cl ON cl.id = v.call_log_id
),
events AS (
  SELECT * FROM sms_events
  UNION ALL
  SELECT * FROM call_events
  UNION ALL
  SELECT * FROM voicemail_events
)
SELECT
  e.communication_id,
  e.source_id,
  e.source_table,
  e.source_type,
  e.intake_channel,
  e.direction,
  e.event_at,
  timezone('America/Chicago', e.event_at)::date AS day_ct,
  to_char(timezone('America/Chicago', e.event_at), 'FMHH12:MI AM') AS time_ct,
  e.phone_number,
  e.phone_last10,
  COALESCE(e.contact_name, NULLIF(trim(concat_ws(' ', cust.first_name, cust.last_name)), ''), cust.company, job.customer_name, est.customer_name) AS contact_name,
  COALESCE(NULLIF(e.contact_type, ''), CASE WHEN cust.id IS NOT NULL THEN 'customer' ELSE 'unknown' END) AS contact_type,
  COALESCE(e.related_customer_id, cust.id, job.customer_id, est.customer_id) AS customer_id,
  COALESCE(e.related_job_id, job.id) AS job_id,
  COALESCE(e.related_estimate_id, est.id) AS estimate_id,
  job.hcp_job_number,
  job.job_number,
  est.estimate_number,
  COALESCE(e.body, e.ai_summary, e.transcription, '') AS summary_text,
  e.body,
  e.transcription,
  e.ai_summary,
  e.recording_url,
  e.media_urls,
  e.twilio_sid,
  e.message_sid,
  e.delivery_status,
  e.status,
  e.error_code,
  e.error_message,
  e.is_read,
  e.source_function,
  e.template_key,
  COALESCE(thread.status, 'open') AS intake_status,
  thread.handled_by_user_id,
  thread.handled_by_name,
  thread.handled_at,
  thread.updated_at AS intake_status_updated_at,
  e.metadata
FROM events e
LEFT JOIN public.intake_thread_status thread
  ON thread.channel = e.intake_channel
 AND thread.phone_last10 = e.phone_last10
LEFT JOIN public.customers cust ON cust.id = e.related_customer_id
LEFT JOIN public.jobs job ON job.id = e.related_job_id
LEFT JOIN public.estimates est ON est.id = e.related_estimate_id;

CREATE INDEX IF NOT EXISTS sms_log_phone_last10_idx
  ON public.sms_log (public.phone_last10(phone_number));

CREATE INDEX IF NOT EXISTS call_log_phone_last10_idx
  ON public.call_log (public.phone_last10(phone_number));

CREATE INDEX IF NOT EXISTS voicemails_phone_last10_idx
  ON public.voicemails (public.phone_last10(phone_number));

CREATE INDEX IF NOT EXISTS jobs_customer_phone_last10_idx
  ON public.jobs (public.phone_last10(customer_phone));

CREATE INDEX IF NOT EXISTS estimates_customer_phone_last10_idx
  ON public.estimates (public.phone_last10(customer_phone));

CREATE OR REPLACE VIEW public.v_customer_timeline
WITH (security_invoker = true)
AS
SELECT
  ('communication:' || uc.communication_id) AS timeline_id,
  uc.event_at,
  'communication'::text AS event_group,
  uc.source_type AS event_type,
  uc.customer_id,
  uc.contact_name AS customer_name,
  uc.phone_number,
  uc.job_id,
  uc.estimate_id,
  CASE
    WHEN uc.source_type = 'sms' THEN CASE WHEN uc.direction = 'inbound' THEN 'Customer texted us' ELSE 'We texted customer' END
    WHEN uc.source_type = 'voicemail' THEN 'Customer left voicemail'
    WHEN uc.direction = 'inbound' THEN 'Customer called us'
    ELSE 'We called customer'
  END AS title,
  NULLIF(uc.summary_text, '') AS body,
  jsonb_build_object(
    'source_table', uc.source_table,
    'source_id', uc.source_id,
    'recording_url', uc.recording_url,
    'media_urls', uc.media_urls,
    'intake_status', uc.intake_status
  ) AS metadata
FROM public.v_unified_communications uc
UNION ALL
SELECT
  ('job:' || j.id::text) AS timeline_id,
  COALESCE(j.arrival_start, j.created_at) AS event_at,
  'work'::text AS event_group,
  'job'::text AS event_type,
  j.customer_id,
  j.customer_name,
  j.customer_phone,
  j.id,
  j.estimate_id,
  COALESCE('Job #' || NULLIF(COALESCE(j.job_number, j.hcp_job_number), ''), j.job_type, 'Job') AS title,
  j.description AS body,
  jsonb_build_object(
    'status', j.status,
    'job_type', j.job_type,
    'scheduled_date', j.scheduled_date,
    'assigned_to', j.assigned_to,
    'address', j.address
  ) AS metadata
FROM public.jobs j
UNION ALL
SELECT
  ('estimate:' || e.id::text) AS timeline_id,
  COALESCE(e.arrival_start, e.created_at) AS event_at,
  'quote'::text AS event_group,
  'estimate'::text AS event_type,
  e.customer_id,
  e.customer_name,
  e.customer_phone,
  e.source_job_id,
  e.id,
  COALESCE('Estimate #' || NULLIF(e.estimate_number, ''), 'Estimate') AS title,
  e.description AS body,
  jsonb_build_object(
    'status', COALESCE(e.status, e.work_status),
    'estimate_type', e.estimate_type,
    'scheduled_date', e.scheduled_date,
    'total_amount', e.total_amount,
    'customer_approved_at', e.customer_approved_at
  ) AS metadata
FROM public.estimates e
UNION ALL
SELECT
  ('invoice:' || i.id::text) AS timeline_id,
  COALESCE(i.paid_at, i.sent_at, i.created_at) AS event_at,
  'money'::text AS event_group,
  'invoice'::text AS event_type,
  j.customer_id,
  j.customer_name,
  j.customer_phone,
  i.job_id,
  j.estimate_id,
  COALESCE('Invoice #' || NULLIF(i.invoice_number, ''), 'Invoice') AS title,
  i.notes AS body,
  jsonb_build_object(
    'status', i.status,
    'total', i.total,
    'balance', i.balance,
    'amount_paid', i.amount_paid,
    'paid_at', i.paid_at
  ) AS metadata
FROM public.customer_invoices i
LEFT JOIN public.jobs j ON j.id = i.job_id
UNION ALL
SELECT
  ('attachment:' || a.id::text) AS timeline_id,
  a.created_at AS event_at,
  'file'::text AS event_group,
  'attachment'::text AS event_type,
  j.customer_id,
  j.customer_name,
  j.customer_phone,
  a.job_id,
  j.estimate_id,
  COALESCE(a.file_name, 'Job attachment') AS title,
  a.category AS body,
  jsonb_build_object(
    'file_path', a.file_path,
    'file_type', a.file_type,
    'storage_bucket', a.storage_bucket,
    'archive_status', a.archive_status
  ) AS metadata
FROM public.job_attachments a
LEFT JOIN public.jobs j ON j.id = a.job_id;

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
    max(uc.event_at) AS latest_communication_at,
    (array_agg(uc.source_type ORDER BY uc.event_at DESC))[1] AS latest_communication_type,
    (array_agg(NULLIF(uc.summary_text, '') ORDER BY uc.event_at DESC))[1] AS latest_communication_summary
  FROM public.v_unified_communications uc
  WHERE uc.job_id = j.id
     OR (uc.job_id IS NULL AND public.phone_last10(uc.phone_number) = public.phone_last10(j.customer_phone))
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
    max(uc.event_at) AS latest_communication_at,
    (array_agg(uc.source_type ORDER BY uc.event_at DESC))[1] AS latest_communication_type,
    (array_agg(NULLIF(uc.summary_text, '') ORDER BY uc.event_at DESC))[1] AS latest_communication_summary
  FROM public.v_unified_communications uc
  WHERE uc.estimate_id = e.id
     OR (uc.estimate_id IS NULL AND public.phone_last10(uc.phone_number) = public.phone_last10(e.customer_phone))
) comm ON true;

CREATE OR REPLACE VIEW public.v_tech_work_summary
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
  j.scheduled_date,
  j.arrival_start,
  j.arrival_end,
  j.assigned_to,
  j.description,
  j.on_my_way_sent_at,
  j.arrival_time,
  j.photos_uploaded_at,
  j.completed_at,
  j.completion_form_sent_at,
  COALESCE(attachments.attachment_count, 0) AS attachment_count,
  attachments.latest_attachment_at,
  COALESCE(estimate_count.count, 0) AS estimate_count,
  estimate_count.latest_estimate_at,
  CASE
    WHEN j.completed_at IS NOT NULL THEN 'Submit complete'
    WHEN j.photos_uploaded_at IS NOT NULL THEN 'Review and send estimate or invoice'
    WHEN j.arrival_time IS NOT NULL THEN 'Diagnose and document'
    WHEN j.on_my_way_sent_at IS NOT NULL THEN 'Drive to customer'
    ELSE 'Get ready for visit'
  END AS tech_next_step
FROM public.jobs j
LEFT JOIN LATERAL (
  SELECT count(*)::integer AS attachment_count, max(created_at) AS latest_attachment_at
  FROM public.job_attachments a
  WHERE a.job_id = j.id
) attachments ON true
LEFT JOIN LATERAL (
  SELECT count(*)::integer AS count, max(created_at) AS latest_estimate_at
  FROM public.estimates e
  WHERE e.source_job_id = j.id OR e.converted_job_id = j.id
) estimate_count ON true;

CREATE OR REPLACE FUNCTION public.mark_intake_communication_handled(
  _channel text,
  _phone_number text,
  _handled_by_name text DEFAULT NULL,
  _source_table text DEFAULT NULL,
  _source_event_id text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last10 text := public.phone_last10(_phone_number);
  v_channel text := lower(coalesce(_channel, ''));
BEGIN
  IF v_channel = 'voicemail' THEN
    v_channel := 'call';
  END IF;

  IF v_channel NOT IN ('sms', 'call') OR length(v_last10) <> 10 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Missing channel or phone number.');
  END IF;

  INSERT INTO public.intake_thread_status (
    channel,
    phone_last10,
    status,
    handled_by_user_id,
    handled_by_name,
    handled_at,
    last_signal_at,
    source_table,
    source_event_id,
    metadata,
    updated_at
  )
  VALUES (
    v_channel,
    v_last10,
    'handled',
    auth.uid(),
    _handled_by_name,
    now(),
    now(),
    _source_table,
    _source_event_id,
    COALESCE(_metadata, '{}'::jsonb),
    now()
  )
  ON CONFLICT (channel, phone_last10)
  DO UPDATE SET
    status = 'handled',
    handled_by_user_id = auth.uid(),
    handled_by_name = EXCLUDED.handled_by_name,
    handled_at = now(),
    source_table = COALESCE(EXCLUDED.source_table, public.intake_thread_status.source_table),
    source_event_id = COALESCE(EXCLUDED.source_event_id, public.intake_thread_status.source_event_id),
    metadata = COALESCE(public.intake_thread_status.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
    updated_at = now();

  RETURN jsonb_build_object('ok', true, 'channel', v_channel, 'phone_last10', v_last10);
END;
$$;

GRANT SELECT ON public.v_unified_communications TO authenticated;
GRANT SELECT ON public.v_customer_timeline TO authenticated;
GRANT SELECT ON public.v_dispatch_live_cards TO authenticated;
GRANT SELECT ON public.v_quote_pipeline TO authenticated;
GRANT SELECT ON public.v_tech_work_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_intake_communication_handled(text, text, text, text, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_unified_communications(
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0,
  p_view text DEFAULT 'all',
  p_search text DEFAULT NULL
)
RETURNS SETOF public.v_unified_communications
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT *
  FROM public.v_unified_communications uc
  WHERE
    (
      COALESCE(p_view, 'all') IN ('all', 'recent')
      OR (p_view = 'now' AND uc.intake_status = 'open')
      OR (p_view = 'handled' AND uc.intake_status = 'handled')
      OR (p_view = 'answering' AND (
        uc.contact_name ILIKE '%answering%'
        OR uc.summary_text ILIKE '%answering service%'
        OR uc.metadata::text ILIKE '%answering_service%'
      ))
    )
    AND (
      NULLIF(trim(COALESCE(p_search, '')), '') IS NULL
      OR uc.phone_number ILIKE '%' || p_search || '%'
      OR uc.phone_last10 ILIKE '%' || public.phone_last10(p_search) || '%'
      OR uc.contact_name ILIKE '%' || p_search || '%'
      OR uc.summary_text ILIKE '%' || p_search || '%'
    )
  ORDER BY uc.event_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

GRANT EXECUTE ON FUNCTION public.get_unified_communications(integer, integer, text, text) TO authenticated;

INSERT INTO public.database_retention_policies (
  table_name,
  category,
  business_use,
  retention_action,
  retention_days,
  enabled,
  notes,
  app_status,
  consolidation_group,
  architecture_note
)
VALUES
  ('v_unified_communications', 'Canonical read model', 'One clean call/text/voicemail window for Intake, NOW, Customer HQ, and Jarvis.', 'keep', NULL, true, 'View only. Do not prune; underlying tables own retention.', 'current', 'canonical_read_models', 'Use this instead of rebuilding separate SMS/call/voicemail lists in each screen.'),
  ('v_customer_timeline', 'Canonical read model', 'One customer history timeline across communications, jobs, estimates, invoices, and attachments.', 'keep', NULL, true, 'View only. Do not prune; underlying tables own retention.', 'current', 'canonical_read_models', 'Use this for Customer HQ and Jarvis customer memory.'),
  ('v_dispatch_live_cards', 'Canonical read model', 'One dispatch card window with job, technician, attachments, latest communication, and workflow alert context.', 'keep', NULL, true, 'View only. Do not prune; underlying tables own retention.', 'current', 'canonical_read_models', 'Use this for Dispatch HQ and Operations Brain cards.'),
  ('v_quote_pipeline', 'Canonical read model', 'One quote pipeline window with estimate stage, latest communication, and approval state.', 'keep', NULL, true, 'View only. Do not prune; underlying tables own retention.', 'current', 'canonical_read_models', 'Use this for Quote HQ and follow-up/drip decisions.'),
  ('v_tech_work_summary', 'Canonical read model', 'One technician work summary window with visit status, photos, estimates, and next step.', 'keep', NULL, true, 'View only. Do not prune; underlying tables own retention.', 'current', 'canonical_read_models', 'Use this for Tech HQ and office visibility into field progress.')
ON CONFLICT (table_name)
DO UPDATE SET
  category = EXCLUDED.category,
  business_use = EXCLUDED.business_use,
  retention_action = EXCLUDED.retention_action,
  retention_days = EXCLUDED.retention_days,
  enabled = EXCLUDED.enabled,
  notes = EXCLUDED.notes,
  app_status = EXCLUDED.app_status,
  consolidation_group = EXCLUDED.consolidation_group,
  architecture_note = EXCLUDED.architecture_note,
  updated_at = now();
