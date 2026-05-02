-- Add business-unit branding to public estimate presentations without exposing
-- raw estimate/cart rows.

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
  _company jsonb := '{}'::jsonb;
  _business_unit_id uuid;
BEGIN
  SELECT *
  INTO _presentation
  FROM public.estimate_presentations
  WHERE token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT to_jsonb(e), e.public_business_unit_id
  INTO _estimate, _business_unit_id
  FROM (
    SELECT
      estimates.id,
      estimates.customer_id,
      estimates.customer_name,
      estimates.customer_email,
      estimates.customer_phone,
      estimates.address,
      estimates.assigned_to,
      estimates.estimate_number,
      estimates.description,
      estimates.estimate_type,
      estimates.repair_tiers,
      estimates.cash_discount_percent,
      estimates.source_job_id,
      estimates.presentation_sent_at,
      estimates.customer_approved_at,
      COALESCE(j.business_unit_id, c.primary_business_unit_id) AS public_business_unit_id
    FROM public.estimates
    LEFT JOIN public.jobs j ON j.id = estimates.source_job_id
    LEFT JOIN public.customers c ON c.id = estimates.customer_id
    WHERE estimates.id = _presentation.estimate_id
  ) e;

  SELECT public.get_public_business_unit_settings(_business_unit_id)
  INTO _company;

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
    'company', COALESCE(_company, '{}'::jsonb),
    'blocks', COALESCE(_blocks, '[]'::jsonb),
    'comparisonBlocks', COALESCE(_comparison_blocks, '[]'::jsonb),
    'addons', COALESCE(_addons, '[]'::jsonb),
    'memberInfo', _member,
    'diagnosisPhotos', COALESCE(_photos, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_estimate_presentation(text) TO anon, authenticated;
