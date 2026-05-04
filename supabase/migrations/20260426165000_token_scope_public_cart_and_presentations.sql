-- Public customer-facing pages should only read rows through token-scoped
-- SECURITY DEFINER functions. Do not expose whole cart/proposal tables to anon.

DROP POLICY IF EXISTS "Public read job_carts" ON public.job_carts;
DROP POLICY IF EXISTS "Public read job_cart_items" ON public.job_cart_items;
DROP POLICY IF EXISTS "Public can view by token" ON public.estimate_presentations;
DROP POLICY IF EXISTS "Public can update view tracking" ON public.estimate_presentations;

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

  RETURN jsonb_build_object(
    'cart', to_jsonb(_cart),
    'items', COALESCE(_items, '[]'::jsonb),
    'job', _job
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
BEGIN
  SELECT *
  INTO _presentation
  FROM public.estimate_presentations
  WHERE token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(_presentation);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_estimate_presentation(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.track_estimate_presentation_view(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.estimate_presentations
  SET
    first_viewed_at = COALESCE(first_viewed_at, now()),
    last_viewed_at = now(),
    view_count = COALESCE(view_count, 0) + 1,
    status = CASE WHEN status = 'pending' THEN 'viewed' ELSE status END
  WHERE token = p_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_estimate_presentation_view(text) TO anon, authenticated;
