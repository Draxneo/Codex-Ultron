-- Fix public estimate presentation diagnosis photos to follow the actual
-- tech_forms -> tech_form_photos relationship.

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
