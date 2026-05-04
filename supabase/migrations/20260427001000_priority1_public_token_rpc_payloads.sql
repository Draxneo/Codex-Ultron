-- Priority 1 public token hardening:
-- public presentation/agreement/cart pages should use token-scoped SECURITY DEFINER RPCs
-- instead of direct anon reads/writes against operational tables.

CREATE OR REPLACE FUNCTION public.get_public_company_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
  FROM public.company_settings
  WHERE key IN ('company_name', 'company_phone', 'company_email', 'company_tagline', 'company_address', 'company_city', 'company_state', 'company_zip', 'tacla_number');
$$;

GRANT EXECUTE ON FUNCTION public.get_public_company_settings() TO anon, authenticated;

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

  SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.sort_order, i.created_at), '[]'::jsonb)
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
    'cart', to_jsonb(_cart),
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
  FROM public.tech_form_photos p
  WHERE p.job_id = ((_estimate ->> 'source_job_id')::uuid);

  RETURN to_jsonb(_presentation)
    || jsonb_build_object(
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

CREATE OR REPLACE FUNCTION public.get_public_agreement_presentation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _presentation public.agreement_presentations%ROWTYPE;
  _customer_name text;
  _company jsonb;
BEGIN
  SELECT *
  INTO _presentation
  FROM public.agreement_presentations
  WHERE token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT NULLIF(trim(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), '')
  INTO _customer_name
  FROM public.customers c
  WHERE c.id = _presentation.customer_id;

  SELECT public.get_public_company_settings()
  INTO _company;

  RETURN to_jsonb(_presentation)
    || jsonb_build_object(
      'customer_name', COALESCE(_customer_name, ''),
      'company', COALESCE(_company, '{}'::jsonb)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_agreement_presentation(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.track_public_agreement_presentation_view(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.agreement_presentations
  SET first_viewed_at = COALESCE(first_viewed_at, now()),
      last_viewed_at = now(),
      view_count = COALESCE(view_count, 0) + 1
  WHERE token = p_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_public_agreement_presentation_view(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_public_agreement_enrollment(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  UPDATE public.agreement_presentations
  SET enrolled_at = COALESCE(enrolled_at, now())
  WHERE token = p_token
  RETURNING id INTO _id;

  IF _id IS NULL THEN
    RAISE EXCEPTION 'Agreement presentation not found';
  END IF;

  RETURN jsonb_build_object('ok', true, 'presentation_id', _id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_public_agreement_enrollment(text) TO anon, authenticated;

DROP POLICY IF EXISTS "Public can insert responses" ON public.estimate_responses;
DROP POLICY IF EXISTS "Anyone can view agreement presentations by token" ON public.agreement_presentations;
DROP POLICY IF EXISTS "Anon can update agreement presentation views" ON public.agreement_presentations;
DROP POLICY IF EXISTS "Anon users can read service_repair_items" ON public.service_repair_items;
