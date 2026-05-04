-- Every live action card needs a landing spot: either a named person/calendar
-- handoff or a shared office queue. Keep this in metadata so we do not create
-- a second task system beside NOW/action_items.

CREATE OR REPLACE FUNCTION public.normalize_action_item_owner_metadata()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_meta jsonb := COALESCE(NEW.metadata, '{}'::jsonb);
  v_text text;
  v_queue text := 'dispatch';
  v_label text := 'Dispatch queue';
  v_requires_schedule boolean := false;
BEGIN
  IF v_meta ? 'owner_type' THEN
    NEW.metadata := v_meta;
    RETURN NEW;
  END IF;

  v_text := lower(concat_ws(' ',
    NEW.category,
    NEW.title,
    NEW.description,
    NEW.suggested_action,
    v_meta->>'jarvis_intent',
    v_meta->>'workflow_type',
    v_meta->>'job_type',
    v_meta->>'quote_subject',
    v_meta->>'description',
    v_meta->>'inbound_message',
    v_meta->>'thread_snippet'
  ));

  v_requires_schedule :=
    NEW.category = 'new_appointment'
    OR COALESCE((v_meta->>'needs_schedule_before_accept')::boolean, false)
    OR v_meta ? 'follow_up_date'
    OR v_meta ? 'scheduled_date'
    OR v_text ~ '\m(quote|bid|estimate|follow[-[:space:]]?up|callback|call back|appointment|book|schedule)\M';

  IF v_requires_schedule THEN
    NEW.metadata := v_meta || jsonb_build_object(
      'owner_type', 'person',
      'owner_label', COALESCE(NULLIF(v_meta->>'assigned_to', ''), 'Pick a person'),
      'owner_required', true,
      'needs_schedule_before_accept', true
    );
    RETURN NEW;
  END IF;

  IF v_text ~ '\m(cps|rebate|warranty|registered|registration|permit|inspection|paperwork|certificate)\M' THEN
    v_queue := 'closeout';
    v_label := 'Closeout queue';
  ELSIF v_text ~ '\m(invoice|payment|billing|receipt|paid|balance|stripe)\M' THEN
    v_queue := 'billing';
    v_label := 'Billing queue';
  ELSIF v_text ~ '\m(reply|text|call|question|follow)\M' THEN
    v_queue := 'customer_follow_up';
    v_label := 'Customer follow-up';
  END IF;

  NEW.metadata := v_meta || jsonb_build_object(
    'owner_type', 'office_queue',
    'owner_queue', v_queue,
    'owner_label', v_label,
    'owner_required', true
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_action_item_owner_metadata ON public.action_items;
CREATE TRIGGER trg_normalize_action_item_owner_metadata
BEFORE INSERT OR UPDATE OF category, title, description, suggested_action, metadata
ON public.action_items
FOR EACH ROW
EXECUTE FUNCTION public.normalize_action_item_owner_metadata();

UPDATE public.action_items
SET metadata = COALESCE(metadata, '{}'::jsonb)
WHERE status = 'pending'
  AND NOT (COALESCE(metadata, '{}'::jsonb) ? 'owner_type');

