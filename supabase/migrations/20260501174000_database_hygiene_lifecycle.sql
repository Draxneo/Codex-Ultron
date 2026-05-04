-- Database hygiene lifecycle foundation.
-- Keeps temporary queues and debug data from becoming permanent business state,
-- while preserving customer/job/communication history.

CREATE TABLE IF NOT EXISTS public.database_retention_policies (
  table_name text PRIMARY KEY,
  category text NOT NULL,
  business_use text NOT NULL,
  retention_action text NOT NULL CHECK (retention_action IN ('keep', 'archive_delete', 'delete', 'rollup_delete', 'normalize', 'review')),
  retention_days integer,
  enabled boolean NOT NULL DEFAULT true,
  owner_visible boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.database_retention_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read database retention policies" ON public.database_retention_policies;
CREATE POLICY "Staff can read database retention policies"
  ON public.database_retention_policies
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
  );

DROP POLICY IF EXISTS "Admins can manage database retention policies" ON public.database_retention_policies;
CREATE POLICY "Admins can manage database retention policies"
  ON public.database_retention_policies
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.database_row_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  row_pk text,
  source_created_at timestamptz,
  archived_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  row_data jsonb NOT NULL
);

ALTER TABLE public.database_row_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read database row archive" ON public.database_row_archive;
CREATE POLICY "Admins can read database row archive"
  ON public.database_row_archive
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.database_cleanup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  dry_run boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'running',
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  triggered_by text NOT NULL DEFAULT 'system'
);

ALTER TABLE public.database_cleanup_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read database cleanup runs" ON public.database_cleanup_runs;
CREATE POLICY "Staff can read database cleanup runs"
  ON public.database_cleanup_runs
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
  );

INSERT INTO public.database_retention_policies (
  table_name,
  category,
  business_use,
  retention_action,
  retention_days,
  enabled,
  notes
)
VALUES
  ('customers', 'Permanent business record', 'Customer master record and lookup history.', 'keep', NULL, true, 'Do not delete automatically.'),
  ('jobs', 'Permanent business record', 'Job history, workflow state, dispatch record.', 'keep', NULL, true, 'Normalize statuses instead of deleting jobs.'),
  ('estimates', 'Permanent business record', 'Quote history and customer approval trail.', 'keep', NULL, true, 'Do not delete automatically.'),
  ('customer_invoices', 'Permanent business record', 'Invoice/payment history.', 'keep', NULL, true, 'Do not delete automatically.'),
  ('job_attachments', 'Permanent business record', 'Job photos and documents.', 'keep', NULL, true, 'Do not delete automatically.'),
  ('sms_log', 'Customer communication history', 'Customer text history and delivery proof.', 'keep', NULL, true, 'Keep full history for now; future pass can redact very old message bodies.'),
  ('call_log', 'Customer communication history', 'Customer call history, transcripts, recordings, and summaries.', 'keep', NULL, true, 'Keep full history for now; future pass can archive old recordings.'),
  ('outbound_drafts', 'Temporary queue', 'Draft texts prepared by Jarvis or automation before sending.', 'archive_delete', 14, true, 'Stale unsent auto drafts should not live forever.'),
  ('workflow_alerts', 'Temporary workflow exception', 'Things Jarvis could not safely move forward.', 'normalize', 90, true, 'Resolved alerts are normalized, then old resolved rows can be archived.'),
  ('workflow_card_acknowledgements', 'Temporary workflow visibility', 'Cards hidden or snoozed from NOW.', 'delete', 7, true, 'Expired acknowledgement markers can be removed.'),
  ('owner_input_requests', 'Temporary approval request', 'Questions sent to an owner/manager for approval.', 'archive_delete', 90, true, 'Pending requests older than 14 days are expired; completed history kept 90 days.'),
  ('route_sms_queue', 'Temporary queue', 'ETA/route messages waiting for approval or sending.', 'archive_delete', 14, true, 'Finished route messages can be archived after two weeks.'),
  ('retry_queue', 'Temporary queue', 'Backend retries for transient failures.', 'archive_delete', 30, true, 'Finished/dead retry rows are kept briefly for troubleshooting.'),
  ('api_usage_log', 'Operational log', 'Raw API call receipts for cost tracking.', 'rollup_delete', 14, true, 'Rolled into daily summaries by cleanup_operational_logs.'),
  ('api_usage_daily_rollups', 'Admin summary', 'Daily API cost summaries.', 'delete', 400, true, 'Longer-lived summary; old rows eventually removed.'),
  ('system_trace_events', 'Operational log', 'Debug trace events for phone/system troubleshooting.', 'delete', 14, true, 'Short-lived debug trace.'),
  ('system_error_log', 'Operational log', 'System errors and resolution notes.', 'delete', 90, true, 'Only resolved errors are pruned.'),
  ('hcp_raw_objects', 'Import staging', 'Raw Housecall Pro import JSON used for reconciliation.', 'review', 30, false, 'Do not auto-delete until import reconciliation is visually approved.'),
  ('hcp_import_runs', 'Import staging', 'Housecall Pro import run history.', 'review', 30, false, 'Keep until raw import cleanup is approved.')
ON CONFLICT (table_name) DO UPDATE SET
  category = EXCLUDED.category,
  business_use = EXCLUDED.business_use,
  retention_action = EXCLUDED.retention_action,
  retention_days = EXCLUDED.retention_days,
  enabled = EXCLUDED.enabled,
  owner_visible = EXCLUDED.owner_visible,
  notes = EXCLUDED.notes,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.get_database_hygiene_report()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_count integer := 0;
  v_total_bytes bigint := 0;
  v_result jsonb;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT count(*), COALESCE(sum(pg_total_relation_size(c.oid)), 0)
  INTO v_table_count, v_total_bytes
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r'
    AND n.nspname = 'public';

  SELECT jsonb_build_object(
    'generated_at', now(),
    'table_count', v_table_count,
    'total_bytes', v_total_bytes,
    'top_tables', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total_bytes DESC), '[]'::jsonb)
      FROM (
        SELECT
          c.relname AS table_name,
          GREATEST(c.reltuples::bigint, 0) AS estimated_rows,
          pg_total_relation_size(c.oid) AS total_bytes,
          pg_relation_size(c.oid) AS table_bytes,
          pg_indexes_size(c.oid) AS index_bytes,
          COALESCE(p.category, 'Uncategorized') AS category,
          COALESCE(p.retention_action, 'review') AS retention_action,
          p.retention_days,
          COALESCE(p.enabled, false) AS policy_enabled,
          p.business_use
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN public.database_retention_policies p ON p.table_name = c.relname
        WHERE c.relkind = 'r'
          AND n.nspname = 'public'
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT 25
      ) t
    ),
    'cleanup_candidates', jsonb_build_array(
      jsonb_build_object(
        'key', 'stale_auto_sms_drafts',
        'label', 'Stale auto text drafts',
        'table_name', 'outbound_drafts',
        'action', 'Archive then delete',
        'count', (SELECT count(*) FROM public.outbound_drafts WHERE status = 'auto_pending' AND sent_at IS NULL AND reviewed_at IS NULL AND job_id IS NULL AND created_at < now() - interval '14 days'),
        'helper', 'Jarvis-generated texts that never got reviewed, sent, or tied to a job.'
      ),
      jsonb_build_object(
        'key', 'old_rejected_sms_drafts',
        'label', 'Old rejected text drafts',
        'table_name', 'outbound_drafts',
        'action', 'Archive then delete',
        'count', (SELECT count(*) FROM public.outbound_drafts WHERE status = 'rejected' AND created_at < now() - interval '30 days'),
        'helper', 'Texts a human already rejected and no longer needs to see.'
      ),
      jsonb_build_object(
        'key', 'resolved_alerts_mislabeled_open',
        'label', 'Resolved workflow alerts mislabeled open',
        'table_name', 'workflow_alerts',
        'action', 'Mark resolved',
        'count', (SELECT count(*) FROM public.workflow_alerts WHERE (resolved_at IS NOT NULL OR is_active = false) AND status <> 'resolved'),
        'helper', 'Workflow alerts already finished but still wearing an open label.'
      ),
      jsonb_build_object(
        'key', 'expired_now_hides',
        'label', 'Expired hidden NOW cards',
        'table_name', 'workflow_card_acknowledgements',
        'action', 'Delete',
        'count', (SELECT count(*) FROM public.workflow_card_acknowledgements WHERE expires_at < now() - interval '7 days'),
        'helper', 'Old hide/snooze markers that no longer affect the board.'
      ),
      jsonb_build_object(
        'key', 'old_hcp_raw_staging',
        'label', 'HCP raw import staging',
        'table_name', 'hcp_raw_objects',
        'action', 'Review before cleanup',
        'count', (SELECT count(*) FROM public.hcp_raw_objects WHERE created_at < now() - interval '30 days'),
        'helper', 'Large raw import JSON. Keep until we visually approve import reconciliation.'
      )
    ),
    'policies', (
      SELECT COALESCE(jsonb_agg(row_to_json(p) ORDER BY p.category, p.table_name), '[]'::jsonb)
      FROM public.database_retention_policies p
      WHERE p.owner_visible = true
    ),
    'last_runs', (
      SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.started_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, started_at, finished_at, dry_run, status, result, error_message, triggered_by
        FROM public.database_cleanup_runs
        ORDER BY started_at DESC
        LIMIT 5
      ) r
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_database_hygiene_report() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_database_hygiene_report() TO authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_database_hygiene(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  v_run_id uuid;
  v_result jsonb := '{}'::jsonb;
  v_count integer := 0;
  v_operational jsonb := '{}'::jsonb;
  v_stale_chunks integer := 0;
BEGIN
  INSERT INTO public.database_cleanup_runs (dry_run, status, triggered_by)
  VALUES (p_dry_run, 'running', CASE WHEN p_dry_run THEN 'dry-run' ELSE 'scheduled-cleanup' END)
  RETURNING id INTO v_run_id;

  SELECT count(*) INTO v_count
  FROM public.outbound_drafts
  WHERE status = 'auto_pending'
    AND sent_at IS NULL
    AND reviewed_at IS NULL
    AND job_id IS NULL
    AND created_at < now() - interval '14 days';
  v_result := v_result || jsonb_build_object('stale_auto_sms_drafts', v_count);
  IF NOT p_dry_run AND v_count > 0 THEN
    WITH moved AS (
      INSERT INTO public.database_row_archive (table_name, row_pk, source_created_at, reason, row_data)
      SELECT 'outbound_drafts', id::text, created_at, 'stale auto_pending SMS draft with no job/review/send', to_jsonb(d)
      FROM public.outbound_drafts d
      WHERE status = 'auto_pending'
        AND sent_at IS NULL
        AND reviewed_at IS NULL
        AND job_id IS NULL
        AND created_at < now() - interval '14 days'
      RETURNING row_pk
    )
    DELETE FROM public.outbound_drafts d
    USING moved
    WHERE d.id::text = moved.row_pk;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.outbound_drafts
  WHERE status IN ('rejected', 'failed')
    AND sent_at IS NULL
    AND created_at < now() - interval '30 days';
  v_result := v_result || jsonb_build_object('old_rejected_or_failed_sms_drafts', v_count);
  IF NOT p_dry_run AND v_count > 0 THEN
    WITH moved AS (
      INSERT INTO public.database_row_archive (table_name, row_pk, source_created_at, reason, row_data)
      SELECT 'outbound_drafts', id::text, created_at, 'old rejected/failed SMS draft', to_jsonb(d)
      FROM public.outbound_drafts d
      WHERE status IN ('rejected', 'failed')
        AND sent_at IS NULL
        AND created_at < now() - interval '30 days'
      RETURNING row_pk
    )
    DELETE FROM public.outbound_drafts d
    USING moved
    WHERE d.id::text = moved.row_pk;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.workflow_alerts
  WHERE (resolved_at IS NOT NULL OR is_active = false)
    AND status <> 'resolved';
  v_result := v_result || jsonb_build_object('workflow_alerts_normalized', v_count);
  IF NOT p_dry_run AND v_count > 0 THEN
    UPDATE public.workflow_alerts
    SET
      status = 'resolved',
      is_active = false,
      resolved_at = COALESCE(resolved_at, now()),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('normalized_by_cleanup_at', now())
    WHERE (resolved_at IS NOT NULL OR is_active = false)
      AND status <> 'resolved';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.workflow_card_acknowledgements
  WHERE expires_at < now() - interval '7 days';
  v_result := v_result || jsonb_build_object('expired_workflow_acknowledgements_deleted', v_count);
  IF NOT p_dry_run AND v_count > 0 THEN
    DELETE FROM public.workflow_card_acknowledgements
    WHERE expires_at < now() - interval '7 days';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.owner_input_requests
  WHERE status = 'pending'
    AND created_at < now() - interval '14 days';
  v_result := v_result || jsonb_build_object('owner_requests_expired', v_count);
  IF NOT p_dry_run AND v_count > 0 THEN
    UPDATE public.owner_input_requests
    SET status = 'expired', updated_at = now()
    WHERE status = 'pending'
      AND created_at < now() - interval '14 days';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.owner_input_requests
  WHERE status IN ('completed', 'responded', 'closed', 'dismissed', 'expired', 'cancelled', 'canceled')
    AND COALESCE(responded_at, updated_at, created_at) < now() - interval '90 days';
  v_result := v_result || jsonb_build_object('old_owner_requests_archived_deleted', v_count);
  IF NOT p_dry_run AND v_count > 0 THEN
    WITH moved AS (
      INSERT INTO public.database_row_archive (table_name, row_pk, source_created_at, reason, row_data)
      SELECT 'owner_input_requests', id::text, created_at, 'old completed owner input request', to_jsonb(r)
      FROM public.owner_input_requests r
      WHERE status IN ('completed', 'responded', 'closed', 'dismissed', 'expired', 'cancelled', 'canceled')
        AND COALESCE(responded_at, updated_at, created_at) < now() - interval '90 days'
      RETURNING row_pk
    )
    DELETE FROM public.owner_input_requests r
    USING moved
    WHERE r.id::text = moved.row_pk;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.route_sms_queue
  WHERE (
      status IN ('sent', 'closed', 'dismissed', 'cancelled', 'canceled')
      AND created_at < now() - interval '14 days'
    )
    OR (
      status NOT IN ('sent', 'closed', 'dismissed', 'cancelled', 'canceled')
      AND created_at < now() - interval '30 days'
    );
  v_result := v_result || jsonb_build_object('route_sms_queue_archived_deleted', v_count);
  IF NOT p_dry_run AND v_count > 0 THEN
    WITH moved AS (
      INSERT INTO public.database_row_archive (table_name, row_pk, source_created_at, reason, row_data)
      SELECT 'route_sms_queue', id::text, created_at, 'old route SMS queue row', to_jsonb(q)
      FROM public.route_sms_queue q
      WHERE (
          status IN ('sent', 'closed', 'dismissed', 'cancelled', 'canceled')
          AND created_at < now() - interval '14 days'
        )
        OR (
          status NOT IN ('sent', 'closed', 'dismissed', 'cancelled', 'canceled')
          AND created_at < now() - interval '30 days'
        )
      RETURNING row_pk
    )
    DELETE FROM public.route_sms_queue q
    USING moved
    WHERE q.id::text = moved.row_pk;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.retry_queue
  WHERE status IN ('succeeded', 'dead_lettered', 'cancelled', 'canceled')
    AND COALESCE(succeeded_at, dead_lettered_at, last_attempt_at, created_at) < now() - interval '30 days';
  v_result := v_result || jsonb_build_object('retry_queue_archived_deleted', v_count);
  IF NOT p_dry_run AND v_count > 0 THEN
    WITH moved AS (
      INSERT INTO public.database_row_archive (table_name, row_pk, source_created_at, reason, row_data)
      SELECT 'retry_queue', id::text, created_at, 'old finished retry queue row', to_jsonb(q)
      FROM public.retry_queue q
      WHERE status IN ('succeeded', 'dead_lettered', 'cancelled', 'canceled')
        AND COALESCE(succeeded_at, dead_lettered_at, last_attempt_at, created_at) < now() - interval '30 days'
      RETURNING row_pk
    )
    DELETE FROM public.retry_queue q
    USING moved
    WHERE q.id::text = moved.row_pk;
  END IF;

  IF NOT p_dry_run THEN
    SELECT public.cleanup_operational_logs() INTO v_operational;
    IF to_regprocedure('public.cleanup_stale_chunks(integer)') IS NOT NULL THEN
      SELECT public.cleanup_stale_chunks(12) INTO v_stale_chunks;
    END IF;
  END IF;

  v_result := v_result || jsonb_build_object(
    'operational_log_cleanup', v_operational,
    'stale_knowledge_chunks_deleted', v_stale_chunks,
    'hcp_raw_objects_review_only', (
      SELECT count(*) FROM public.hcp_raw_objects WHERE created_at < now() - interval '30 days'
    )
  );

  UPDATE public.database_cleanup_runs
  SET finished_at = now(), status = 'completed', result = v_result
  WHERE id = v_run_id;

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.database_cleanup_runs
  SET finished_at = now(), status = 'failed', error_message = SQLERRM
  WHERE id = v_run_id;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_database_hygiene(boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_database_hygiene(boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_database_hygiene(boolean) TO service_role;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'database-hygiene-daily') THEN
      PERFORM cron.unschedule('database-hygiene-daily');
    END IF;

    PERFORM cron.schedule(
      'database-hygiene-daily',
      '41 3 * * *',
      $sql$SELECT public.cleanup_database_hygiene(false);$sql$
    );
  END IF;
END;
$do$;
