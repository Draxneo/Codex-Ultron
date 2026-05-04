-- Refine database hygiene so testing/blank Jarvis drafts clear quickly while
-- Housecall Pro raw import data remains protected for reconciliation.

UPDATE public.database_retention_policies
SET
  business_use = 'Raw Housecall Pro import JSON used to verify dates, invoices, jobs, photos, and missing records.',
  retention_action = 'review',
  enabled = false,
  owner_visible = true,
  notes = 'Protected until the Housecall Pro import audit is complete. Do not auto-delete.',
  updated_at = now()
WHERE table_name = 'hcp_raw_objects';

UPDATE public.database_retention_policies
SET
  business_use = 'Housecall Pro import run history used to verify what was fetched and normalized.',
  retention_action = 'review',
  enabled = false,
  owner_visible = true,
  notes = 'Protected until the Housecall Pro import audit is complete. Do not auto-delete.',
  updated_at = now()
WHERE table_name = 'hcp_import_runs';

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
        'key', 'blank_auto_sms_drafts',
        'label', 'Blank auto text drafts',
        'table_name', 'outbound_drafts',
        'action', 'Archive then delete',
        'count', (SELECT count(*) FROM public.outbound_drafts WHERE status = 'auto_pending' AND sent_at IS NULL AND reviewed_at IS NULL AND job_id IS NULL AND NULLIF(btrim(COALESCE(body, '')), '') IS NULL AND created_at < now() - interval '1 day'),
        'helper', 'Empty Jarvis/testing drafts that were never real customer messages.'
      ),
      jsonb_build_object(
        'key', 'stale_auto_sms_drafts',
        'label', 'Stale auto text drafts',
        'table_name', 'outbound_drafts',
        'action', 'Archive then delete',
        'count', (SELECT count(*) FROM public.outbound_drafts WHERE status = 'auto_pending' AND sent_at IS NULL AND reviewed_at IS NULL AND job_id IS NULL AND NULLIF(btrim(COALESCE(body, '')), '') IS NOT NULL AND created_at < now() - interval '14 days'),
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
        'key', 'old_hcp_raw_staging',
        'label', 'Protected HCP raw import staging',
        'table_name', 'hcp_raw_objects',
        'action', 'Review only - do not delete',
        'count', (SELECT count(*) FROM public.hcp_raw_objects),
        'helper', 'Raw Housecall Pro data stays protected until we finish import/date reconciliation.'
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
    AND NULLIF(btrim(COALESCE(body, '')), '') IS NULL
    AND created_at < now() - interval '1 day';
  v_result := v_result || jsonb_build_object('blank_auto_sms_drafts', v_count);
  IF NOT p_dry_run AND v_count > 0 THEN
    WITH moved AS (
      INSERT INTO public.database_row_archive (table_name, row_pk, source_created_at, reason, row_data)
      SELECT 'outbound_drafts', id::text, created_at, 'blank auto_pending SMS draft with no job/review/send', to_jsonb(d)
      FROM public.outbound_drafts d
      WHERE status = 'auto_pending'
        AND sent_at IS NULL
        AND reviewed_at IS NULL
        AND job_id IS NULL
        AND NULLIF(btrim(COALESCE(body, '')), '') IS NULL
        AND created_at < now() - interval '1 day'
      RETURNING row_pk
    )
    DELETE FROM public.outbound_drafts d
    USING moved
    WHERE d.id::text = moved.row_pk;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.outbound_drafts
  WHERE status = 'auto_pending'
    AND sent_at IS NULL
    AND reviewed_at IS NULL
    AND job_id IS NULL
    AND NULLIF(btrim(COALESCE(body, '')), '') IS NOT NULL
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
        AND NULLIF(btrim(COALESCE(body, '')), '') IS NOT NULL
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
    'hcp_raw_objects_protected_review_only', (
      SELECT count(*) FROM public.hcp_raw_objects
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
