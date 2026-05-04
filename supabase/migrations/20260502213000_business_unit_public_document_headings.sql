-- Customer-facing document headings should follow the company line attached
-- to the customer/job, not the old single-company global default.

CREATE OR REPLACE FUNCTION public.get_public_business_unit_settings(p_business_unit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings jsonb;
  _unit public.business_units%ROWTYPE;
BEGIN
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
  INTO _settings
  FROM public.company_settings
  WHERE key IN (
    'company_name',
    'company_phone',
    'company_email',
    'company_tagline',
    'company_address',
    'company_city',
    'company_state',
    'company_zip',
    'tacla_number',
    'cart_financing_disclaimer'
  );

  IF p_business_unit_id IS NOT NULL THEN
    SELECT *
    INTO _unit
    FROM public.business_units
    WHERE id = p_business_unit_id
      AND is_active = true
    LIMIT 1;
  END IF;

  IF _unit.id IS NULL THEN
    SELECT *
    INTO _unit
    FROM public.business_units
    WHERE is_default = true
      AND is_active = true
    LIMIT 1;
  END IF;

  IF _unit.id IS NULL THEN
    RETURN COALESCE(_settings, '{}'::jsonb);
  END IF;

  RETURN COALESCE(_settings, '{}'::jsonb)
    || jsonb_build_object(
      'company_name', COALESCE(_unit.legal_name, _unit.display_name),
      'company_display_name', _unit.display_name,
      'company_phone', _unit.primary_phone_number,
      'business_unit_id', _unit.id,
      'business_unit_slug', _unit.slug,
      'business_unit_tag', COALESCE(_unit.customer_tag, _unit.display_name)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_business_unit_settings(uuid) TO anon, authenticated;

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
  _business_unit_id uuid;
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

  SELECT to_jsonb(j), j.primary_business_unit_id
  INTO _job, _business_unit_id
  FROM (
    SELECT
      jobs.customer_name,
      jobs.address,
      jobs.assigned_to,
      jobs.job_number,
      customers.primary_business_unit_id
    FROM public.jobs
    LEFT JOIN public.customers ON customers.id = jobs.customer_id
    WHERE jobs.id = _cart.job_id
  ) j;

  SELECT public.get_public_business_unit_settings(_business_unit_id)
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
