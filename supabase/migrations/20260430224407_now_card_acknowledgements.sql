-- Now HQ derived-card acknowledgements.
-- These are intentionally not "workflow complete" records. They let an office
-- user say "I saw this derived card" without mutating the underlying job,
-- estimate, lead, invoice, or cart truth.

CREATE TABLE IF NOT EXISTS public.workflow_card_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  card_id text NOT NULL,
  record_type text NOT NULL,
  record_id text NOT NULL,
  workflow_type text NOT NULL,
  step_key text,
  acknowledged_by uuid REFERENCES auth.users(id),
  acknowledged_by_name text,
  note text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

ALTER TABLE public.workflow_card_acknowledgements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read workflow card acknowledgements" ON public.workflow_card_acknowledgements;
CREATE POLICY "Staff can read workflow card acknowledgements"
  ON public.workflow_card_acknowledgements
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
    OR public.has_role(auth.uid(), 'tech'::app_role)
  );

DROP POLICY IF EXISTS "Office staff can create workflow card acknowledgements" ON public.workflow_card_acknowledgements;
CREATE POLICY "Office staff can create workflow card acknowledgements"
  ON public.workflow_card_acknowledgements
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  );

CREATE INDEX IF NOT EXISTS workflow_card_ack_open_idx
  ON public.workflow_card_acknowledgements (card_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS workflow_card_ack_record_idx
  ON public.workflow_card_acknowledgements (record_type, record_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.acknowledge_workflow_card_once(
  p_card_id text,
  p_record_type text,
  p_record_id text,
  p_workflow_type text,
  p_step_key text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_acknowledged_by_name text DEFAULT NULL,
  p_hours integer DEFAULT 24
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.workflow_card_acknowledgements%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Sign in before acknowledging this workflow card.');
  END IF;

  IF COALESCE(NULLIF(p_card_id, ''), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Missing card id.');
  END IF;

  INSERT INTO public.workflow_card_acknowledgements (
    card_id,
    record_type,
    record_id,
    workflow_type,
    step_key,
    acknowledged_by,
    acknowledged_by_name,
    note,
    expires_at
  )
  VALUES (
    p_card_id,
    COALESCE(NULLIF(p_record_type, ''), 'unknown'),
    COALESCE(NULLIF(p_record_id, ''), 'unknown'),
    COALESCE(NULLIF(p_workflow_type, ''), 'unknown'),
    NULLIF(p_step_key, ''),
    v_uid,
    NULLIF(p_acknowledged_by_name, ''),
    NULLIF(p_note, ''),
    now() + make_interval(hours => GREATEST(1, LEAST(COALESCE(p_hours, 24), 168)))
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'ack_id', v_row.id, 'expires_at', v_row.expires_at);
END;
$$;

GRANT EXECUTE ON FUNCTION public.acknowledge_workflow_card_once(text, text, text, text, text, text, text, integer) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'workflow_card_acknowledgements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_card_acknowledgements;
  END IF;
END $$;
