-- Now HQ workflow lifecycle hardening.
-- Adds explicit alert ownership/retry state, durable identity links, and a
-- safe owner-input inbox for remote approvals/instructions.

ALTER TABLE public.workflow_alerts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS resolved_by_name text,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retry_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS retry_requested_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_event_id text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.workflow_alerts
SET status = CASE
  WHEN resolved_at IS NOT NULL OR is_active IS FALSE THEN 'resolved'
  ELSE 'open'
END
WHERE status IS NULL OR status = '';

CREATE INDEX IF NOT EXISTS workflow_alerts_open_status_idx
  ON public.workflow_alerts (status, created_at DESC)
  WHERE resolved_at IS NULL AND COALESCE(is_active, true) = true;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY COALESCE(job_id, '00000000-0000-0000-0000-000000000000'::uuid),
                        COALESCE(step_id, ''),
                        COALESCE(alert_type, '')
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM public.workflow_alerts
  WHERE resolved_at IS NULL AND COALESCE(is_active, true) = true
    AND alert_type IN ('blocked', 'escalated')
)
UPDATE public.workflow_alerts alert
SET resolved_at = now(),
    is_active = false,
    status = 'resolved',
    metadata = COALESCE(alert.metadata, '{}'::jsonb) || jsonb_build_object('auto_resolved_reason', 'duplicate_open_alert_before_unique_index')
FROM ranked
WHERE alert.id = ranked.id
  AND ranked.rn > 1;

CREATE INDEX IF NOT EXISTS workflow_alerts_one_open_per_step_idx
  ON public.workflow_alerts (
    COALESCE(job_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(step_id, ''),
    COALESCE(alert_type, '')
  )
  WHERE resolved_at IS NULL AND COALESCE(is_active, true) = true
    AND alert_type IN ('blocked', 'escalated');

CREATE OR REPLACE FUNCTION public.merge_open_workflow_alert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
BEGIN
  IF NEW.alert_type NOT IN ('blocked', 'escalated')
     OR NEW.resolved_at IS NOT NULL
     OR COALESCE(NEW.is_active, true) IS FALSE THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_existing_id
  FROM public.workflow_alerts
  WHERE COALESCE(job_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(NEW.job_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND COALESCE(step_id, '') = COALESCE(NEW.step_id, '')
    AND COALESCE(alert_type, '') = COALESCE(NEW.alert_type, '')
    AND resolved_at IS NULL
    AND COALESCE(is_active, true) = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.workflow_alerts
    SET details = NEW.details,
        message = COALESCE(NEW.message, message),
        missing_fields = COALESCE(NEW.missing_fields, missing_fields),
        status = 'open',
        last_seen_at = now(),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('last_duplicate_seen_at', now())
    WHERE id = v_existing_id;
    RETURN NULL;
  END IF;

  NEW.status = COALESCE(NULLIF(NEW.status, ''), 'open');
  NEW.is_active = COALESCE(NEW.is_active, true);
  NEW.last_seen_at = COALESCE(NEW.last_seen_at, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_merge_open_workflow_alert ON public.workflow_alerts;
CREATE TRIGGER trg_merge_open_workflow_alert
BEFORE INSERT ON public.workflow_alerts
FOR EACH ROW EXECUTE FUNCTION public.merge_open_workflow_alert();

ALTER TABLE public.sms_log
  ADD COLUMN IF NOT EXISTS related_customer_id uuid REFERENCES public.customers(id),
  ADD COLUMN IF NOT EXISTS related_estimate_id uuid REFERENCES public.estimates(id);

ALTER TABLE public.call_log
  ADD COLUMN IF NOT EXISTS related_estimate_id uuid REFERENCES public.estimates(id);

CREATE INDEX IF NOT EXISTS sms_log_related_customer_id_idx ON public.sms_log (related_customer_id);
CREATE INDEX IF NOT EXISTS sms_log_related_estimate_id_idx ON public.sms_log (related_estimate_id);
CREATE INDEX IF NOT EXISTS call_log_related_estimate_id_idx ON public.call_log (related_estimate_id);

ALTER TABLE public.intake_thread_status
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id),
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.jobs(id),
  ADD COLUMN IF NOT EXISTS estimate_id uuid REFERENCES public.estimates(id),
  ADD COLUMN IF NOT EXISTS source_event_id text,
  ADD COLUMN IF NOT EXISTS source_table text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS intake_thread_status_customer_id_idx ON public.intake_thread_status (customer_id);
CREATE INDEX IF NOT EXISTS intake_thread_status_job_id_idx ON public.intake_thread_status (job_id);
CREATE INDEX IF NOT EXISTS intake_thread_status_estimate_id_idx ON public.intake_thread_status (estimate_id);

CREATE TABLE IF NOT EXISTS public.owner_input_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  requested_by uuid REFERENCES auth.users(id),
  requested_by_name text,
  owner_phone_last10 text,
  prompt text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  response_text text,
  responded_at timestamptz,
  source_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_item_id uuid REFERENCES public.action_items(id)
);

ALTER TABLE public.owner_input_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read owner input requests" ON public.owner_input_requests;
CREATE POLICY "Staff can read owner input requests"
  ON public.owner_input_requests FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  );

DROP POLICY IF EXISTS "Office staff can manage owner input requests" ON public.owner_input_requests;
CREATE POLICY "Office staff can manage owner input requests"
  ON public.owner_input_requests FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  );

CREATE INDEX IF NOT EXISTS owner_input_requests_status_idx
  ON public.owner_input_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS owner_input_requests_owner_phone_idx
  ON public.owner_input_requests (owner_phone_last10, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'owner_input_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.owner_input_requests;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.resolve_workflow_alert_once(
  p_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_row public.workflow_alerts%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Sign in before resolving this workflow alert.');
  END IF;

  SELECT * INTO v_row
  FROM public.workflow_alerts
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'That workflow alert no longer exists.');
  END IF;

  IF v_row.resolved_at IS NOT NULL OR COALESCE(v_row.is_active, true) IS FALSE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'That workflow alert is already resolved.');
  END IF;

  UPDATE public.workflow_alerts
  SET resolved_at = v_now,
      resolved_by = v_uid,
      resolved_by_name = COALESCE(NULLIF(p_note, ''), resolved_by_name),
      is_active = false,
      status = 'resolved',
      last_seen_at = v_now,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('resolved_note', COALESCE(p_note, ''))
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'alert_id', v_row.id, 'status', v_row.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_workflow_alert_once(
  p_id uuid,
  p_last_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_row public.workflow_alerts%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Sign in before retrying this workflow alert.');
  END IF;

  SELECT * INTO v_row
  FROM public.workflow_alerts
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'That workflow alert no longer exists.');
  END IF;

  IF v_row.resolved_at IS NOT NULL OR COALESCE(v_row.is_active, true) IS FALSE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'That workflow alert is already resolved.');
  END IF;

  UPDATE public.workflow_alerts
  SET status = 'retrying',
      retry_requested_at = v_now,
      retry_requested_by = v_uid,
      attempt_count = COALESCE(attempt_count, 0) + 1,
      last_error = COALESCE(NULLIF(p_last_error, ''), last_error),
      last_seen_at = v_now
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'alert_id', v_row.id, 'status', v_row.status, 'attempt_count', v_row.attempt_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_workflow_alert_once(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retry_workflow_alert_once(uuid, text) TO authenticated;

CREATE INDEX IF NOT EXISTS action_items_team_message_idx
  ON public.action_items ((metadata->>'team_message_id'))
  WHERE source = 'team_communications' AND metadata ? 'team_message_id';

CREATE INDEX IF NOT EXISTS action_items_dispatch_live_job_idx
  ON public.action_items (job_id, category)
  WHERE source = 'dispatch_live_cards' AND status = 'pending' AND resolved_at IS NULL;
