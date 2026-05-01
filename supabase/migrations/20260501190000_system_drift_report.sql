-- Add a visual drift report for spotting old iteration residue before it confuses Jarvis or operators.

CREATE OR REPLACE FUNCTION public.get_system_drift_report()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH table_inventory AS (
    SELECT
      c.relname AS table_name,
      GREATEST(c.reltuples::bigint, 0) AS estimated_rows,
      pg_total_relation_size(c.oid) AS total_bytes,
      p.table_name IS NOT NULL AS has_owner_label,
      COALESCE(p.category, 'Needs owner label') AS policy_category,
      COALESCE(p.retention_action, 'review') AS retention_action,
      CASE
        WHEN c.relname LIKE 'hcp_%' THEN 'Housecall Pro import history'
        WHEN c.relname IN (
          'customers', 'customer_addresses', 'jobs', 'estimates', 'estimate_line_items',
          'customer_invoices', 'customer_invoice_items', 'invoice_payments',
          'payments', 'employees', 'profiles', 'job_attachments', 'job_media',
          'job_carts', 'job_cart_items', 'equipment', 'pricebook_items',
          'service_agreements'
        ) THEN 'Core company records'
        WHEN c.relname LIKE '%sms%' OR c.relname LIKE '%call%' OR c.relname LIKE '%phone%' OR c.relname LIKE '%ivr%' OR c.relname LIKE '%twilio%' THEN 'Communication records'
        WHEN c.relname LIKE '%workflow%' OR c.relname LIKE '%action_item%' OR c.relname LIKE '%owner_input%' THEN 'NOW and workflow'
        WHEN c.relname LIKE '%queue%' OR c.relname LIKE '%draft%' OR c.relname LIKE '%retry%' THEN 'Queues and drafts'
        WHEN c.relname LIKE '%log%' OR c.relname LIKE '%trace%' OR c.relname LIKE '%heartbeat%' OR c.relname LIKE '%usage%' THEN 'Logs and telemetry'
        WHEN c.relname LIKE '%archive%' OR c.relname LIKE '%snapshot%' THEN 'Archives'
        WHEN c.relname LIKE '%setting%' OR c.relname LIKE '%config%' OR c.relname LIKE '%template%' OR c.relname LIKE '%policy%' THEN 'Settings and templates'
        ELSE 'Unsorted app table'
      END AS inferred_category
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN public.database_retention_policies p ON p.table_name = c.relname
    WHERE c.relkind = 'r'
      AND n.nspname = 'public'
  ),
  function_inventory AS (
    SELECT
      r.routine_name,
      CASE
        WHEN r.routine_name LIKE '%jarvis%' OR r.routine_name LIKE '%ai%' OR r.routine_name LIKE '%copilot%' OR r.routine_name LIKE '%knowledge%' THEN 'Jarvis / AI'
        WHEN r.routine_name LIKE '%sms%' OR r.routine_name LIKE '%call%' OR r.routine_name LIKE '%phone%' OR r.routine_name LIKE '%voice%' OR r.routine_name LIKE '%ivr%' THEN 'Phone and SMS'
        WHEN r.routine_name LIKE '%workflow%' OR r.routine_name LIKE '%action_item%' OR r.routine_name LIKE '%owner_input%' THEN 'NOW and workflow'
        WHEN r.routine_name LIKE '%cleanup%' OR r.routine_name LIKE '%cron%' OR r.routine_name LIKE '%retry%' OR r.routine_name LIKE '%trace%' OR r.routine_name LIKE '%error%' THEN 'System cleanup and health'
        WHEN r.routine_name LIKE '%public%' OR r.routine_name LIKE '%cart%' OR r.routine_name LIKE '%quote%' OR r.routine_name LIKE '%estimate%' OR r.routine_name LIKE '%invoice%' OR r.routine_name LIKE '%stripe%' THEN 'Customer-facing money'
        WHEN r.routine_name LIKE '%customer%' OR r.routine_name LIKE '%job%' THEN 'Customer and job records'
        ELSE 'Other database helper'
      END AS inferred_category
    FROM information_schema.routines r
    WHERE r.specific_schema = 'public'
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'summary', jsonb_build_object(
      'public_tables', (SELECT count(*) FROM table_inventory),
      'labeled_tables', (SELECT count(*) FROM table_inventory WHERE has_owner_label),
      'unlabeled_tables', (SELECT count(*) FROM table_inventory WHERE NOT has_owner_label),
      'public_functions', (SELECT count(*) FROM function_inventory),
      'public_triggers', (
        SELECT count(*)
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND NOT t.tgisinternal
      ),
      'cron_jobs', (SELECT count(*) FROM cron.job),
      'jarvis_named_functions', (SELECT count(*) FROM function_inventory WHERE inferred_category = 'Jarvis / AI'),
      'jarvis_named_tables', (
        SELECT count(*)
        FROM table_inventory
        WHERE table_name LIKE '%jarvis%' OR table_name LIKE '%ai%' OR table_name LIKE '%copilot%' OR table_name LIKE '%knowledge%'
      )
    ),
    'table_categories', (
      SELECT COALESCE(jsonb_agg(row_to_json(grouped) ORDER BY grouped.table_count DESC), '[]'::jsonb)
      FROM (
        SELECT
          inferred_category,
          count(*) AS table_count,
          count(*) FILTER (WHERE NOT has_owner_label) AS unlabeled_count,
          sum(estimated_rows) AS estimated_rows,
          pg_size_pretty(sum(total_bytes)) AS total_size
        FROM table_inventory
        GROUP BY inferred_category
      ) grouped
    ),
    'unlabeled_tables', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total_bytes DESC), '[]'::jsonb)
      FROM (
        SELECT table_name, inferred_category, estimated_rows, total_bytes
        FROM table_inventory
        WHERE NOT has_owner_label
        ORDER BY total_bytes DESC
        LIMIT 30
      ) t
    ),
    'function_categories', (
      SELECT COALESCE(jsonb_agg(row_to_json(grouped) ORDER BY grouped.function_count DESC), '[]'::jsonb)
      FROM (
        SELECT inferred_category, count(*) AS function_count
        FROM function_inventory
        GROUP BY inferred_category
      ) grouped
    ),
    'cron_jobs', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'jobid', jobid,
        'jobname', jobname,
        'schedule', schedule,
        'active', active,
        'command', left(command, 180)
      ) ORDER BY jobname), '[]'::jsonb)
      FROM cron.job
    ),
    'guardrails', jsonb_build_array(
      jsonb_build_object(
        'title', 'Jarvis only uses current pathways',
        'helper', 'Old functions can exist while we audit, but Jarvis should route through the current context builder, action suggester, workflow cards, SMS composer, and approved send path.'
      ),
      jsonb_build_object(
        'title', 'No blind deletes',
        'helper', 'Housecall Pro raw import history stays protected until date, invoice, job, and attachment reconciliation are finished.'
      ),
      jsonb_build_object(
        'title', 'Every table needs a label',
        'helper', 'A table without an owner/use/retention label is not trusted yet. It may be useful, but it should not be invisible.'
      ),
      jsonb_build_object(
        'title', 'Queues expire',
        'helper', 'Drafts, retries, traces, and temporary queue rows should clean themselves up unless they are tied to customer history or an audit trail.'
      )
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_system_drift_report() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_system_drift_report() TO authenticated;
