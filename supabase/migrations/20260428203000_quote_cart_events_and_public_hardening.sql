-- Quote/cart lifecycle events and public-token payload hardening.

CREATE TABLE IF NOT EXISTS public.quote_cart_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  actor_type text NOT NULL DEFAULT 'system',
  cart_id uuid REFERENCES public.job_carts(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  estimate_id uuid REFERENCES public.estimates(id) ON DELETE SET NULL,
  presentation_id uuid REFERENCES public.estimate_presentations(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_quote_cart_events_created_at
  ON public.quote_cart_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quote_cart_events_cart_id
  ON public.quote_cart_events (cart_id, created_at DESC)
  WHERE cart_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quote_cart_events_job_id
  ON public.quote_cart_events (job_id, created_at DESC)
  WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quote_cart_events_estimate_id
  ON public.quote_cart_events (estimate_id, created_at DESC)
  WHERE estimate_id IS NOT NULL;

ALTER TABLE public.quote_cart_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read quote_cart_events" ON public.quote_cart_events;
CREATE POLICY "Authenticated can read quote_cart_events"
  ON public.quote_cart_events FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated can insert quote_cart_events" ON public.quote_cart_events;

CREATE OR REPLACE FUNCTION public.log_quote_cart_event(
  p_event_type text,
  p_cart_id uuid DEFAULT NULL,
  p_public_token uuid DEFAULT NULL,
  p_job_id uuid DEFAULT NULL,
  p_estimate_id uuid DEFAULT NULL,
  p_presentation_id uuid DEFAULT NULL,
  p_actor_type text DEFAULT 'system',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cart record;
  _cart_id uuid := NULL;
  _cart_job_id uuid := NULL;
  _cart_presentation_id uuid := NULL;
  _event_type text := lower(trim(COALESCE(p_event_type, '')));
  _actor_type text := lower(trim(COALESCE(p_actor_type, 'system')));
  _jwt_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
  _id uuid;
BEGIN
  IF _event_type NOT IN (
    'cart_sent',
    'public_cart_viewed',
    'public_quote_viewed',
    'customer_approved',
    'customer_declined',
    'customer_contact_requested',
    'payment_started'
  ) THEN
    RAISE EXCEPTION 'Invalid quote/cart event type';
  END IF;

  IF _actor_type NOT IN ('customer', 'staff', 'system', 'stripe') THEN
    _actor_type := 'system';
  END IF;

  IF p_public_token IS NOT NULL THEN
    SELECT id, job_id, source_presentation_id
    INTO _cart
    FROM public.job_carts
    WHERE public_token = p_public_token
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cart not found';
    END IF;

    _cart_id := _cart.id;
    _cart_job_id := _cart.job_id;
    _cart_presentation_id := _cart.source_presentation_id;
  ELSIF p_cart_id IS NOT NULL THEN
    IF _jwt_role NOT IN ('authenticated', 'service_role') THEN
      RAISE EXCEPTION 'Not authorized to log cart event by id';
    END IF;

    SELECT id, job_id, source_presentation_id
    INTO _cart
    FROM public.job_carts
    WHERE id = p_cart_id
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cart not found';
    END IF;

    _cart_id := _cart.id;
    _cart_job_id := _cart.job_id;
    _cart_presentation_id := _cart.source_presentation_id;
  ELSIF p_job_id IS NULL AND p_estimate_id IS NULL AND p_presentation_id IS NULL THEN
    RAISE EXCEPTION 'Missing event entity';
  END IF;

  INSERT INTO public.quote_cart_events (
    event_type,
    actor_type,
    cart_id,
    job_id,
    estimate_id,
    presentation_id,
    metadata
  )
  VALUES (
    _event_type,
    _actor_type,
    COALESCE(_cart_id, p_cart_id),
    COALESCE(p_job_id, _cart_job_id),
    p_estimate_id,
    COALESCE(p_presentation_id, _cart_presentation_id),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_quote_cart_event(text, uuid, uuid, uuid, uuid, uuid, text, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.track_cart_view(p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cart_id uuid;
  _job_id uuid;
  _presentation_id uuid;
  _view_count integer;
BEGIN
  UPDATE public.job_carts
  SET first_viewed_at = COALESCE(first_viewed_at, now()),
      last_viewed_at = now(),
      view_count = view_count + 1
  WHERE public_token = p_token
    AND status NOT IN ('paid','canceled','declined')
  RETURNING id, job_id, source_presentation_id, view_count
  INTO _cart_id, _job_id, _presentation_id, _view_count;

  IF _cart_id IS NOT NULL THEN
    INSERT INTO public.quote_cart_events (
      event_type,
      actor_type,
      cart_id,
      job_id,
      presentation_id,
      metadata
    )
    VALUES (
      'public_cart_viewed',
      'customer',
      _cart_id,
      _job_id,
      _presentation_id,
      jsonb_build_object('view_count', _view_count)
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_cart_view(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_job_cart(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cart public.job_carts%ROWTYPE;
  _items jsonb;
  _job jsonb;
  _company jsonb;
BEGIN
  SELECT *
  INTO _cart
  FROM public.job_carts
  WHERE public_token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'kind', i.kind,
    'name', i.name,
    'description', i.description,
    'image_url', i.image_url,
    'quantity', i.quantity,
    'unit_price', i.unit_price,
    'total_price', i.total_price,
    'tier', i.tier,
    'sort_order', i.sort_order
  ) ORDER BY i.sort_order, i.created_at), '[]'::jsonb)
  INTO _items
  FROM public.job_cart_items i
  WHERE i.cart_id = _cart.id;

  SELECT to_jsonb(j)
  INTO _job
  FROM (
    SELECT customer_name, address, assigned_to, job_number
    FROM public.jobs
    WHERE id = _cart.job_id
  ) j;

  SELECT public.get_public_company_settings()
  INTO _company;

  RETURN jsonb_build_object(
    'cart', jsonb_build_object(
      'status', _cart.status,
      'subtotal', _cart.subtotal,
      'tax_amount', _cart.tax_amount,
      'total', _cart.total,
      'sent_at', _cart.sent_at,
      'approved_at', _cart.approved_at,
      'paid_at', _cart.paid_at,
      'payment_method', _cart.payment_method,
      'payment_timing', _cart.payment_timing,
      'estimate_number', _cart.estimate_number,
      'first_viewed_at', _cart.first_viewed_at,
      'last_viewed_at', _cart.last_viewed_at,
      'view_count', _cart.view_count,
      'discount_code', _cart.discount_code,
      'discount_amount', _cart.discount_amount
    ),
    'items', COALESCE(_items, '[]'::jsonb),
    'job', _job,
    'company', COALESCE(_company, '{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_job_cart(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_estimate_presentation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _presentation public.estimate_presentations%ROWTYPE;
  _estimate jsonb;
  _blocks jsonb;
  _comparison_blocks jsonb;
  _addons jsonb;
  _member jsonb := jsonb_build_object('hasAgreement', false);
  _photos jsonb := '[]'::jsonb;
BEGIN
  SELECT *
  INTO _presentation
  FROM public.estimate_presentations
  WHERE token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT to_jsonb(e)
  INTO _estimate
  FROM (
    SELECT
      id,
      customer_id,
      customer_name,
      customer_email,
      customer_phone,
      address,
      assigned_to,
      estimate_number,
      description,
      estimate_type,
      repair_tiers,
      cash_discount_percent,
      source_job_id,
      presentation_sent_at,
      customer_approved_at
    FROM public.estimates
    WHERE id = _presentation.estimate_id
  ) e;

  SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.sort_order), '[]'::jsonb)
  INTO _blocks
  FROM public.brochure_blocks b;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.sort_order), '[]'::jsonb)
  INTO _comparison_blocks
  FROM public.comparison_blocks c;

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.sort_order), '[]'::jsonb)
  INTO _addons
  FROM public.addons a
  WHERE a.active = true;

  SELECT jsonb_build_object(
    'hasAgreement', true,
    'discountPercent', COALESCE(sa.agreement_discount_percent, 15),
    'planName', sa.plan_name
  )
  INTO _member
  FROM public.service_agreements sa
  WHERE sa.customer_id = ((_estimate ->> 'customer_id')::uuid)
    AND sa.status = 'active'
    AND sa.end_date >= CURRENT_DATE
  ORDER BY sa.end_date DESC
  LIMIT 1;

  _member := COALESCE(_member, jsonb_build_object('hasAgreement', false));

  SELECT COALESCE(jsonb_agg(jsonb_build_object('url', p.file_path, 'label', p.photo_type) ORDER BY p.created_at), '[]'::jsonb)
  INTO _photos
  FROM public.tech_forms f
  JOIN public.tech_form_photos p ON p.tech_form_id = f.id
  WHERE f.job_id = ((_estimate ->> 'source_job_id')::uuid);

  RETURN jsonb_build_object(
    'id', _presentation.id,
    'estimate_id', _presentation.estimate_id,
    'token', _presentation.token,
    'customer_email', _presentation.customer_email,
    'pricing_snapshot', _presentation.pricing_snapshot,
    'selected_tiers', _presentation.selected_tiers,
    'created_at', _presentation.created_at,
    'first_viewed_at', _presentation.first_viewed_at,
    'last_viewed_at', _presentation.last_viewed_at,
    'view_count', _presentation.view_count,
    'status', _presentation.status,
    'customer_phone', _presentation.customer_phone,
    'selected_option_key', _presentation.selected_option_key,
    'payment_method', _presentation.payment_method,
    'approved_at', _presentation.approved_at,
    'paid_at', _presentation.paid_at,
    'total_amount', _presentation.total_amount,
    'estimate', _estimate,
    'blocks', COALESCE(_blocks, '[]'::jsonb),
    'comparisonBlocks', COALESCE(_comparison_blocks, '[]'::jsonb),
    'addons', COALESCE(_addons, '[]'::jsonb),
    'memberInfo', _member,
    'diagnosisPhotos', COALESCE(_photos, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_estimate_presentation(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.track_estimate_presentation_view(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _presentation_id uuid;
  _estimate_id uuid;
  _job_id uuid;
  _view_count integer;
BEGIN
  UPDATE public.estimate_presentations
  SET
    first_viewed_at = COALESCE(first_viewed_at, now()),
    last_viewed_at = now(),
    view_count = COALESCE(view_count, 0) + 1,
    status = CASE WHEN status = 'pending' THEN 'viewed' ELSE status END
  WHERE token = p_token
  RETURNING id, estimate_id, view_count
  INTO _presentation_id, _estimate_id, _view_count;

  IF _presentation_id IS NOT NULL THEN
    SELECT source_job_id
    INTO _job_id
    FROM public.estimates
    WHERE id = _estimate_id;

    INSERT INTO public.quote_cart_events (
      event_type,
      actor_type,
      job_id,
      estimate_id,
      presentation_id,
      metadata
    )
    VALUES (
      'public_quote_viewed',
      'customer',
      _job_id,
      _estimate_id,
      _presentation_id,
      jsonb_build_object('view_count', _view_count)
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_estimate_presentation_view(text) TO anon, authenticated;

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
    UPDATE public.estimates
    SET customer_approved_at = COALESCE(customer_approved_at, now())
    WHERE id = _presentation.estimate_id;

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
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'response_id', _response_id,
    'line_items_created', _inserted_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_public_estimate_response(text, text, text, text, text, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_quick_quote_link(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _quote public.quick_quote_links%ROWTYPE;
BEGIN
  SELECT *
  INTO _quote
  FROM public.quick_quote_links
  WHERE token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', _quote.id,
    'token', _quote.token,
    'customer_name', _quote.customer_name,
    'matchup_snapshot', _quote.matchup_snapshot,
    'rendered_snapshot', _quote.rendered_snapshot,
    'company_snapshot', _quote.company_snapshot,
    'selected_payment', _quote.selected_payment,
    'approved_at', _quote.approved_at,
    'view_count', _quote.view_count,
    'first_viewed_at', _quote.first_viewed_at,
    'last_viewed_at', _quote.last_viewed_at,
    'created_at', _quote.created_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_quick_quote_link(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.track_quick_quote_view(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _quote_id uuid;
  _estimate_id uuid;
  _job_id uuid;
  _view_count integer;
BEGIN
  UPDATE public.quick_quote_links
  SET first_viewed_at = COALESCE(first_viewed_at, now()),
      last_viewed_at = now(),
      view_count = COALESCE(view_count, 0) + 1
  WHERE token = p_token
  RETURNING id, estimate_id, job_id, view_count
  INTO _quote_id, _estimate_id, _job_id, _view_count;

  IF _quote_id IS NOT NULL THEN
    INSERT INTO public.quote_cart_events (
      event_type,
      actor_type,
      job_id,
      estimate_id,
      metadata
    )
    VALUES (
      'public_quote_viewed',
      'customer',
      _job_id,
      _estimate_id,
      jsonb_build_object('quick_quote_id', _quote_id, 'view_count', _view_count)
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_quick_quote_view(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.approve_public_quick_quote(
  p_token text,
  p_option text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _quote public.quick_quote_links%ROWTYPE;
BEGIN
  IF p_option NOT IN ('A', 'B', 'C') THEN
    RAISE EXCEPTION 'Invalid payment option';
  END IF;

  UPDATE public.quick_quote_links
  SET selected_payment = p_option,
      approved_at = COALESCE(approved_at, now())
  WHERE token = p_token
  RETURNING *
  INTO _quote;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  INSERT INTO public.quote_cart_events (
    event_type,
    actor_type,
    job_id,
    estimate_id,
    metadata
  )
  VALUES (
    'customer_approved',
    'customer',
    _quote.job_id,
    _quote.estimate_id,
    jsonb_build_object('quick_quote_id', _quote.id, 'selected_payment', p_option)
  );

  RETURN public.get_public_quick_quote_link(p_token);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_public_quick_quote(text, text) TO anon, authenticated;

DROP POLICY IF EXISTS "Public can read quick_quote_links by token" ON public.quick_quote_links;
DROP POLICY IF EXISTS "Public can update approval and view fields" ON public.quick_quote_links;
DROP POLICY IF EXISTS "Authenticated can create quick_quote_links" ON public.quick_quote_links;
DROP POLICY IF EXISTS "Authenticated can manage quick_quote_links" ON public.quick_quote_links;
CREATE POLICY "Authenticated can manage quick_quote_links"
  ON public.quick_quote_links FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
