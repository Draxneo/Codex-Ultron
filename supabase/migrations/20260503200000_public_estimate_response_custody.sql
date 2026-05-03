CREATE OR REPLACE FUNCTION public.submit_public_estimate_response(
  p_token text,
  p_action text,
  p_message text DEFAULT NULL,
  p_payment_preference text DEFAULT NULL,
  p_selected_tier text DEFAULT NULL,
  p_selected_addons jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _presentation public.estimate_presentations%ROWTYPE;
  _estimate public.estimates%ROWTYPE;
  _included text[];
  _response_id uuid;
  _approval_event_id uuid;
  _inserted_count integer := 0;
  _event_type text;
BEGIN
  IF p_action NOT IN ('approved', 'changes_requested', 'declined') THEN
    RAISE EXCEPTION 'Invalid response action';
  END IF;

  SELECT *
  INTO _presentation
  FROM public.estimate_presentations
  WHERE token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Presentation not found';
  END IF;

  SELECT *
  INTO _estimate
  FROM public.estimates
  WHERE id = _presentation.estimate_id
  LIMIT 1;

  INSERT INTO public.estimate_responses (
    estimate_id,
    presentation_id,
    action,
    message,
    payment_preference,
    selected_tier,
    selected_addons
  )
  VALUES (
    _presentation.estimate_id,
    _presentation.id,
    p_action,
    NULLIF(p_message, ''),
    NULLIF(p_payment_preference, ''),
    NULLIF(p_selected_tier, ''),
    p_selected_addons
  )
  RETURNING id INTO _response_id;

  _event_type := CASE p_action
    WHEN 'approved' THEN 'customer_approved'
    WHEN 'declined' THEN 'customer_declined'
    ELSE 'customer_contact_requested'
  END;

  INSERT INTO public.quote_cart_events (
    event_type,
    actor_type,
    job_id,
    estimate_id,
    presentation_id,
    metadata
  )
  VALUES (
    _event_type,
    'customer',
    _estimate.source_job_id,
    _presentation.estimate_id,
    _presentation.id,
    jsonb_build_object(
      'response_id', _response_id,
      'action', p_action,
      'selected_tier', NULLIF(p_selected_tier, ''),
      'payment_preference', NULLIF(p_payment_preference, ''),
      'has_message', NULLIF(p_message, '') IS NOT NULL
    )
  );

  IF p_action = 'approved' THEN
    _approval_event_id := public.record_estimate_approval_event(
      _presentation.estimate_id,
      'digital',
      'approved',
      NULLIF(p_selected_tier, ''),
      NULLIF(p_payment_preference, ''),
      NULLIF(p_message, ''),
      NULL,
      'customer',
      _presentation.id,
      NULL,
      jsonb_build_object('selected_addons', p_selected_addons),
      jsonb_build_object('response_id', _response_id, 'source', 'public_estimate_response')
    );

    IF _estimate.source_job_id IS NOT NULL
      AND _estimate.estimate_type = 'service_repair'
      AND NULLIF(p_selected_tier, '') IS NOT NULL THEN

      _included := CASE p_selected_tier
        WHEN 'necessary' THEN ARRAY['necessary']
        WHEN 'recommended' THEN ARRAY['necessary', 'recommended']
        WHEN 'deluxe' THEN ARRAY['necessary', 'recommended', 'deluxe']
        ELSE ARRAY[p_selected_tier]
      END;

      UPDATE public.service_repair_items
      SET approved = true,
          updated_at = now()
      WHERE job_id = _estimate.source_job_id
        AND severity = ANY(_included);

      INSERT INTO public.job_line_items (
        job_id,
        name,
        description,
        quantity,
        unit_price,
        total_price,
        kind,
        template_id,
        waived
      )
      SELECT
        r.job_id,
        r.description,
        r.description,
        1,
        COALESCE(r.final_price, 0),
        COALESCE(r.final_price, 0),
        'repair',
        NULL,
        false
      FROM public.service_repair_items r
      WHERE r.job_id = _estimate.source_job_id
        AND r.severity = ANY(_included)
        AND NOT EXISTS (
          SELECT 1
          FROM public.job_line_items li
          WHERE li.job_id = r.job_id
            AND li.kind = 'repair'
            AND li.description = r.description
            AND li.total_price = COALESCE(r.final_price, 0)
        );

      GET DIAGNOSTICS _inserted_count = ROW_COUNT;

      UPDATE public.job_line_items
      SET waived = true,
          waived_reason = COALESCE(waived_reason, 'Waived with repair')
      WHERE job_id = _estimate.source_job_id
        AND COALESCE(waived, false) = false
        AND lower(COALESCE(description, name, '')) LIKE '%service call%';
    END IF;
  ELSIF p_action = 'declined' THEN
    _approval_event_id := public.record_estimate_approval_event(
      _presentation.estimate_id,
      'digital',
      'declined',
      NULLIF(p_selected_tier, ''),
      NULLIF(p_payment_preference, ''),
      NULLIF(p_message, ''),
      NULL,
      'customer',
      _presentation.id,
      NULL,
      '{}'::jsonb,
      jsonb_build_object('response_id', _response_id, 'source', 'public_estimate_response')
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'response_id', _response_id,
    'approval_event_id', _approval_event_id,
    'line_items_created', _inserted_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_public_estimate_response(text, text, text, text, text, jsonb) TO anon, authenticated;
