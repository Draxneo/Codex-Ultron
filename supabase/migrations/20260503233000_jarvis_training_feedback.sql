-- ===========================================================================
-- JARVIS Training Feedback (2026-05-03 PM)
-- ===========================================================================
-- Surface: Train JARVIS button on every action_item card. Lets the user say
-- "JARVIS got X wrong" with structured issue tags + free-form context, plus
-- an immutable snapshot of what JARVIS produced so we can later review the
-- input and tighten the prompts / extraction rules without database drift
-- changing the picture.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.jarvis_training_feedback (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  action_item_id  uuid        REFERENCES public.action_items(id) ON DELETE SET NULL,
  job_id          uuid,
  customer_id     uuid,
  related_call_id uuid,
  related_sms_id  uuid,
  issue_tags      text[]      NOT NULL DEFAULT '{}',
  user_feedback   text        NOT NULL,
  jarvis_output   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  reported_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_by_name text,
  source_function text,
  status          text        NOT NULL DEFAULT 'open',
  reviewed_at     timestamptz,
  reviewed_note   text,
  created_at      timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS jarvis_training_feedback_status_idx
  ON public.jarvis_training_feedback (status, created_at DESC)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS jarvis_training_feedback_action_item_idx
  ON public.jarvis_training_feedback (action_item_id)
  WHERE action_item_id IS NOT NULL;

ALTER TABLE public.jarvis_training_feedback ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'jarvis_training_feedback' AND policyname = 'staff_insert') THEN
    CREATE POLICY staff_insert ON public.jarvis_training_feedback
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'jarvis_training_feedback' AND policyname = 'staff_select') THEN
    CREATE POLICY staff_select ON public.jarvis_training_feedback
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'jarvis_training_feedback' AND policyname = 'service_role_full') THEN
    CREATE POLICY service_role_full ON public.jarvis_training_feedback
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
