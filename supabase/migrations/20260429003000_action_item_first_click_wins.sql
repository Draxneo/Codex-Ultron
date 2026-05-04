CREATE OR REPLACE FUNCTION public.claim_action_item_once(
  p_id uuid,
  p_label text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_row public.action_items%ROWTYPE;
  v_claim jsonb;
  v_claimed_at timestamptz;
  v_claim_user uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Sign in before taking this action.');
  END IF;

  SELECT *
    INTO v_row
    FROM public.action_items
   WHERE id = p_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'That card no longer exists.');
  END IF;

  IF v_row.status <> 'pending' OR v_row.resolved_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'That card is already handled.');
  END IF;

  v_claim := COALESCE(v_row.metadata, '{}'::jsonb)->'shared_task_claim';

  IF v_claim IS NOT NULL AND jsonb_typeof(v_claim) = 'object' AND v_claim ? 'claimed_at' THEN
    BEGIN
      v_claimed_at := (v_claim->>'claimed_at')::timestamptz;
      v_claim_user := NULLIF(v_claim->>'user_id', '')::uuid;
    EXCEPTION WHEN others THEN
      v_claimed_at := NULL;
      v_claim_user := NULL;
    END;

    IF v_claimed_at IS NOT NULL
       AND v_claimed_at > v_now - interval '2 minutes'
       AND v_claim_user IS DISTINCT FROM v_uid THEN
      RETURN jsonb_build_object(
        'ok', false,
        'reason', COALESCE(v_claim->>'label', 'Someone else') || ' is already working this card.'
      );
    END IF;
  END IF;

  UPDATE public.action_items
     SET metadata = jsonb_set(
       COALESCE(metadata, '{}'::jsonb),
       '{shared_task_claim}',
       jsonb_build_object(
         'user_id', v_uid,
         'label', COALESCE(NULLIF(p_label, ''), 'Current user'),
         'claimed_at', v_now
       ),
       true
     )
   WHERE id = p_id
   RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'item_id', v_row.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_action_item_once(
  p_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_row public.action_items%ROWTYPE;
  v_claim jsonb;
  v_claimed_at timestamptz;
  v_claim_user uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Sign in before taking this action.');
  END IF;

  IF p_status NOT IN ('accepted', 'dismissed') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Unsupported action status.');
  END IF;

  SELECT *
    INTO v_row
    FROM public.action_items
   WHERE id = p_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'That card no longer exists.');
  END IF;

  IF v_row.status <> 'pending' OR v_row.resolved_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'That card is already handled.');
  END IF;

  v_claim := COALESCE(v_row.metadata, '{}'::jsonb)->'shared_task_claim';

  IF v_claim IS NOT NULL AND jsonb_typeof(v_claim) = 'object' AND v_claim ? 'claimed_at' THEN
    BEGIN
      v_claimed_at := (v_claim->>'claimed_at')::timestamptz;
      v_claim_user := NULLIF(v_claim->>'user_id', '')::uuid;
    EXCEPTION WHEN others THEN
      v_claimed_at := NULL;
      v_claim_user := NULL;
    END;

    IF v_claimed_at IS NOT NULL
       AND v_claimed_at > v_now - interval '2 minutes'
       AND v_claim_user IS DISTINCT FROM v_uid THEN
      RETURN jsonb_build_object(
        'ok', false,
        'reason', COALESCE(v_claim->>'label', 'Someone else') || ' is already working this card.'
      );
    END IF;
  END IF;

  UPDATE public.action_items
     SET status = p_status,
         resolved_at = v_now,
         resolved_by = v_uid,
         metadata = COALESCE(metadata, '{}'::jsonb) - 'shared_task_claim'
   WHERE id = p_id
   RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'item_id', v_row.id, 'status', v_row.status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_action_item_once(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_action_item_once(uuid, text) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'estimate_reviews'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.estimate_reviews;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'job_invoices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.job_invoices;
  END IF;
END $$;
