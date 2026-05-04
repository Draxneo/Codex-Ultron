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
  _member jsonb;
  _plan_template jsonb;
  _pricing jsonb;
  _customer_id uuid;
BEGIN
  SELECT *
  INTO _cart
  FROM public.job_carts
  WHERE public_token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF to_regprocedure('public.refresh_job_cart_pricing(uuid)') IS NOT NULL THEN
    EXECUTE 'SELECT public.refresh_job_cart_pricing($1)' USING _cart.id INTO _pricing;

    SELECT *
    INTO _cart
    FROM public.job_carts
    WHERE id = _cart.id
    LIMIT 1;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.sort_order, i.created_at), '[]'::jsonb)
  INTO _items
  FROM public.job_cart_items i
  WHERE i.cart_id = _cart.id;

  SELECT j.customer_id,
         to_jsonb(public_job)
  INTO _customer_id,
       _job
  FROM public.jobs j
  CROSS JOIN LATERAL (
    SELECT j.customer_name, j.address, j.assigned_to, j.job_number
  ) public_job
  WHERE j.id = _cart.job_id;

  SELECT jsonb_build_object(
    'planName', m.name,
    'discountPercent', 15,
    'planAnnualPrice', COALESCE(NULLIF(m.price, 0), 199),
    'perks', COALESCE(m.perks, '[]'::jsonb)
  )
  INTO _plan_template
  FROM public.maintenance_plan_templates m
  WHERE m.is_active = true
  ORDER BY
    CASE WHEN lower(m.name) LIKE '%comfort%' THEN 0 ELSE 1 END,
    m.sort_order ASC
  LIMIT 1;

  _plan_template := COALESCE(
    _plan_template,
    jsonb_build_object(
      'planName', 'Comfort Club',
      'discountPercent', 15,
      'planAnnualPrice', 199,
      'perks', '[]'::jsonb
    )
  );

  SELECT jsonb_build_object(
    'hasAgreement', true,
    'discountPercent', COALESCE(NULLIF(sa.agreement_discount_percent, 0), 15),
    'planName', COALESCE(NULLIF(sa.plan_name, ''), _plan_template ->> 'planName', 'Comfort Club'),
    'planSource', sa.plan_source,
    'planAnnualPrice', COALESCE(NULLIF(sa.price, 0), NULLIF(_plan_template ->> 'planAnnualPrice', '')::numeric, 199),
    'perks', CASE
      WHEN t.perks IS NOT NULL AND jsonb_array_length(t.perks) > 0 THEN t.perks
      ELSE COALESCE(_plan_template -> 'perks', '[]'::jsonb)
    END,
    'endDate', sa.end_date
  )
  INTO _member
  FROM public.service_agreements sa
  LEFT JOIN public.maintenance_plan_templates t
    ON lower(t.name) = lower(sa.plan_name)
  WHERE sa.customer_id = _customer_id
    AND lower(COALESCE(sa.status, '')) = 'active'
    AND sa.end_date >= CURRENT_DATE
  ORDER BY sa.end_date DESC
  LIMIT 1;

  _member := COALESCE(
    _member,
    jsonb_build_object('hasAgreement', false) || _plan_template
  );

  SELECT public.get_public_company_settings()
  INTO _company;

  RETURN jsonb_build_object(
    'cart', to_jsonb(_cart),
    'items', COALESCE(_items, '[]'::jsonb),
    'job', _job,
    'company', COALESCE(_company, '{}'::jsonb),
    'pricing', COALESCE(_pricing, _cart.pricing_summary, '{}'::jsonb),
    'memberInfo', _member
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_job_cart(uuid) TO anon, authenticated;
