-- Centralized pricing foundation for job carts.
-- The frontend may display these values, but the database is the source of truth.

INSERT INTO public.company_settings (key, value) VALUES
  ('cart_cash_discount_percent', '15'),
  ('cart_comfort_club_discount_percent', '15'),
  ('cart_financing_36mo_factor', '0.0278'),
  ('cart_financing_120mo_factor', '0.0125'),
  ('cart_financing_disclaimer', 'Financing is subject to lender approval. Terms, rates, and promotions may vary.')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.job_carts
  ADD COLUMN IF NOT EXISTS repair_subtotal numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_eligible_subtotal numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_discount_percent numeric(6,2) NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS cash_discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comfort_club_discount_percent numeric(6,2) NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS comfort_club_discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_cash_total numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS financing_monthly_36 numeric(12,2),
  ADD COLUMN IF NOT EXISTS financing_monthly_120 numeric(12,2),
  ADD COLUMN IF NOT EXISTS pricing_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.job_cart_items.metadata IS
  'Cart-item metadata. discount_eligible=true/false controls repair/cash/Comfort Club discount eligibility; defaults to true for repair items.';

COMMENT ON COLUMN public.job_carts.pricing_summary IS
  'Server-calculated pricing snapshot for public cart and technician workflows.';

CREATE OR REPLACE FUNCTION public.normalize_job_cart_item_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.quantity := COALESCE(NEW.quantity, 1);
  NEW.unit_price := COALESCE(NEW.unit_price, 0);
  NEW.total_price := round(NEW.quantity * NEW.unit_price, 2);
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);

  IF NOT (NEW.metadata ? 'discount_eligible') THEN
    NEW.metadata := jsonb_set(
      NEW.metadata,
      '{discount_eligible}',
      to_jsonb(NEW.kind = 'repair'),
      true
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_job_cart_item_price ON public.job_cart_items;
CREATE TRIGGER trg_normalize_job_cart_item_price
  BEFORE INSERT OR UPDATE OF quantity, unit_price, total_price, kind, metadata
  ON public.job_cart_items
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_job_cart_item_price();

UPDATE public.job_cart_items
SET total_price = round(COALESCE(quantity, 1) * COALESCE(unit_price, 0), 2),
    metadata = CASE
      WHEN COALESCE(metadata, '{}'::jsonb) ? 'discount_eligible' THEN COALESCE(metadata, '{}'::jsonb)
      ELSE jsonb_set(COALESCE(metadata, '{}'::jsonb), '{discount_eligible}', to_jsonb(kind = 'repair'), true)
    END;

CREATE OR REPLACE FUNCTION public.refresh_job_cart_pricing(p_cart_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cart public.job_carts%ROWTYPE;
  _job_customer_id uuid;
  _subtotal numeric(12,2) := 0;
  _repair_subtotal numeric(12,2) := 0;
  _eligible_subtotal numeric(12,2) := 0;
  _tax_rate numeric(6,4) := 0.0825;
  _manual_discount numeric(12,2) := 0;
  _taxable_subtotal numeric(12,2) := 0;
  _tax_amount numeric(12,2) := 0;
  _total numeric(12,2) := 0;
  _cash_discount_percent numeric(6,2) := 15;
  _cash_discount_amount numeric(12,2) := 0;
  _settings_comfort_percent numeric(6,2) := 15;
  _comfort_percent numeric(6,2) := 15;
  _comfort_amount numeric(12,2) := 0;
  _comfort_member boolean := false;
  _comfort_plan text := NULL;
  _cash_taxable numeric(12,2) := 0;
  _cash_tax_amount numeric(12,2) := 0;
  _final_cash_total numeric(12,2) := 0;
  _financing_36_factor numeric := 0.0278;
  _financing_120_factor numeric := 0.0125;
  _monthly_36 numeric(12,2);
  _monthly_120 numeric(12,2);
  _summary jsonb;
BEGIN
  SELECT * INTO _cart
  FROM public.job_carts
  WHERE id = p_cart_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT j.customer_id
  INTO _job_customer_id
  FROM public.jobs j
  WHERE j.id = _cart.job_id;

  SELECT
    COALESCE(round(SUM(COALESCE(i.total_price, 0)), 2), 0),
    COALESCE(round(SUM(CASE WHEN i.kind = 'repair' THEN COALESCE(i.total_price, 0) ELSE 0 END), 2), 0),
    COALESCE(round(SUM(
      CASE
        WHEN CASE
          WHEN lower(COALESCE(i.metadata->>'discount_eligible', '')) IN ('true', 't', '1', 'yes') THEN true
          WHEN lower(COALESCE(i.metadata->>'discount_eligible', '')) IN ('false', 'f', '0', 'no') THEN false
          ELSE i.kind = 'repair'
        END
        THEN COALESCE(i.total_price, 0)
        ELSE 0
      END
    ), 2), 0)
  INTO _subtotal, _repair_subtotal, _eligible_subtotal
  FROM public.job_cart_items i
  WHERE i.cart_id = p_cart_id;

  SELECT
    COALESCE(MAX(CASE WHEN key = 'cart_cash_discount_percent' AND value ~ '^[0-9]+(\.[0-9]+)?$' THEN value::numeric END), 15),
    COALESCE(MAX(CASE WHEN key = 'cart_comfort_club_discount_percent' AND value ~ '^[0-9]+(\.[0-9]+)?$' THEN value::numeric END), 15),
    COALESCE(MAX(CASE WHEN key = 'cart_financing_36mo_factor' AND value ~ '^[0-9]+(\.[0-9]+)?$' THEN value::numeric END), 0.0278),
    COALESCE(MAX(CASE WHEN key = 'cart_financing_120mo_factor' AND value ~ '^[0-9]+(\.[0-9]+)?$' THEN value::numeric END), 0.0125)
  INTO _cash_discount_percent, _settings_comfort_percent, _financing_36_factor, _financing_120_factor
  FROM public.company_settings
  WHERE key IN (
    'cart_cash_discount_percent',
    'cart_comfort_club_discount_percent',
    'cart_financing_36mo_factor',
    'cart_financing_120mo_factor'
  );

  _comfort_percent := _settings_comfort_percent;

  IF _job_customer_id IS NOT NULL THEN
    SELECT true, COALESCE(sa.agreement_discount_percent, _comfort_percent), sa.plan_name
    INTO _comfort_member, _comfort_percent, _comfort_plan
    FROM public.service_agreements sa
    WHERE sa.customer_id = _job_customer_id
      AND sa.status = 'active'
      AND sa.end_date >= CURRENT_DATE
    ORDER BY sa.end_date DESC
    LIMIT 1;

    IF NOT FOUND THEN
      _comfort_member := false;
      _comfort_percent := _settings_comfort_percent;
      _comfort_plan := NULL;
    END IF;
  END IF;

  _tax_rate := COALESCE(_cart.tax_rate, 0.0825);
  _manual_discount := LEAST(GREATEST(COALESCE(_cart.discount_amount, 0), 0), _subtotal);
  _taxable_subtotal := GREATEST(_subtotal - _manual_discount, 0);
  _tax_amount := round(_taxable_subtotal * _tax_rate, 2);
  _total := _taxable_subtotal + _tax_amount;

  _cash_discount_amount := round(_eligible_subtotal * (_cash_discount_percent / 100), 2);
  _comfort_amount := CASE
    WHEN COALESCE(_comfort_member, false) THEN round(_eligible_subtotal * (_comfort_percent / 100), 2)
    ELSE 0
  END;
  _cash_taxable := GREATEST(_subtotal - _manual_discount - _cash_discount_amount - _comfort_amount, 0);
  _cash_tax_amount := round(_cash_taxable * _tax_rate, 2);
  _final_cash_total := _cash_taxable + _cash_tax_amount;
  _monthly_36 := round(_total * _financing_36_factor, 2);
  _monthly_120 := round(_total * _financing_120_factor, 2);

  _summary := jsonb_build_object(
    'subtotal', _subtotal,
    'repair_subtotal', _repair_subtotal,
    'discount_eligible_subtotal', _eligible_subtotal,
    'manual_discount_amount', _manual_discount,
    'tax_rate', _tax_rate,
    'tax_amount', _tax_amount,
    'total', _total,
    'cash_discount_percent', _cash_discount_percent,
    'cash_discount_amount', _cash_discount_amount,
    'comfort_club', jsonb_build_object(
      'eligible', COALESCE(_comfort_member, false),
      'plan_name', _comfort_plan,
      'discount_percent', _comfort_percent,
      'discount_amount', _comfort_amount
    ),
    'final_cash_total', _final_cash_total,
    'final_cash_tax_amount', _cash_tax_amount,
    'financing', jsonb_build_object(
      'monthly_36', _monthly_36,
      'monthly_120', _monthly_120,
      'factor_36', _financing_36_factor,
      'factor_120', _financing_120_factor
    ),
    'calculated_at', now()
  );

  UPDATE public.job_carts
  SET subtotal = _subtotal,
      repair_subtotal = _repair_subtotal,
      discount_eligible_subtotal = _eligible_subtotal,
      tax_amount = _tax_amount,
      total = _total,
      cash_discount_percent = _cash_discount_percent,
      cash_discount_amount = _cash_discount_amount,
      comfort_club_discount_percent = _comfort_percent,
      comfort_club_discount_amount = _comfort_amount,
      final_cash_total = _final_cash_total,
      financing_monthly_36 = _monthly_36,
      financing_monthly_120 = _monthly_120,
      pricing_summary = _summary,
      updated_at = now()
  WHERE id = p_cart_id;

  RETURN _summary;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_job_cart_pricing(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.recalc_job_cart_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cart_id uuid;
BEGIN
  _cart_id := COALESCE(NEW.cart_id, OLD.cart_id);
  PERFORM public.refresh_job_cart_pricing(_cart_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_job_cart_pricing_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_job_cart_pricing(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_job_cart_pricing_fields ON public.job_carts;
CREATE TRIGGER trg_refresh_job_cart_pricing_fields
  AFTER UPDATE OF tax_rate, discount_amount, discount_code
  ON public.job_carts
  FOR EACH ROW
  WHEN (
    OLD.tax_rate IS DISTINCT FROM NEW.tax_rate
    OR OLD.discount_amount IS DISTINCT FROM NEW.discount_amount
    OR OLD.discount_code IS DISTINCT FROM NEW.discount_code
  )
  EXECUTE FUNCTION public.refresh_job_cart_pricing_trigger();

CREATE OR REPLACE FUNCTION public.get_public_company_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
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
  _pricing jsonb;
BEGIN
  SELECT *
  INTO _cart
  FROM public.job_carts
  WHERE public_token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT public.refresh_job_cart_pricing(_cart.id)
  INTO _pricing;

  SELECT *
  INTO _cart
  FROM public.job_carts
  WHERE id = _cart.id
  LIMIT 1;

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
    'company', COALESCE(_company, '{}'::jsonb),
    'pricing', COALESCE(_pricing, _cart.pricing_summary, '{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_job_cart(uuid) TO anon, authenticated;

SELECT public.refresh_job_cart_pricing(id)
FROM public.job_carts;
