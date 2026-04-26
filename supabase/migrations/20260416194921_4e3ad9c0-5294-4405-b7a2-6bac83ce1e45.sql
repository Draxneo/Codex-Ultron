-- Cart Add-On Rules
CREATE TABLE public.cart_addon_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_kind text NOT NULL CHECK (trigger_kind IN ('equipment','repair','part','any')),
  trigger_source_id uuid,
  suggestion_kind text NOT NULL CHECK (suggestion_kind IN ('equipment','repair','part','custom')),
  suggestion_source_id uuid,
  name text NOT NULL,
  description text,
  image_url text,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  badge text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cart_addon_rules_trigger ON public.cart_addon_rules(trigger_kind, trigger_source_id) WHERE is_active = true;

ALTER TABLE public.cart_addon_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active addon rules"
  ON public.cart_addon_rules FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated can manage addon rules"
  ON public.cart_addon_rules FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_cart_addon_rules_updated_at
  BEFORE UPDATE ON public.cart_addon_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Cart Discounts (Promo Codes)
CREATE TABLE public.cart_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text,
  discount_type text NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value numeric(12,2) NOT NULL,
  min_total numeric(12,2) NOT NULL DEFAULT 0,
  max_uses int,
  use_count int NOT NULL DEFAULT 0,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  auto_apply_tag text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cart_discounts_code ON public.cart_discounts(code) WHERE is_active = true;

ALTER TABLE public.cart_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active discounts"
  ON public.cart_discounts FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated can manage discounts"
  ON public.cart_discounts FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_cart_discounts_updated_at
  BEFORE UPDATE ON public.cart_discounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add discount columns to job_carts
ALTER TABLE public.job_carts
  ADD COLUMN IF NOT EXISTS discount_code text,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT 0;

-- Update recalc function to factor discount
CREATE OR REPLACE FUNCTION public.recalc_job_cart_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _cart_id uuid;
  _subtotal numeric(12,2);
  _rate numeric(6,4);
  _tax numeric(12,2);
  _discount numeric(12,2);
BEGIN
  _cart_id := COALESCE(NEW.cart_id, OLD.cart_id);
  SELECT COALESCE(SUM(total_price), 0) INTO _subtotal FROM public.job_cart_items WHERE cart_id = _cart_id;
  SELECT tax_rate, COALESCE(discount_amount, 0) INTO _rate, _discount FROM public.job_carts WHERE id = _cart_id;
  _rate := COALESCE(_rate, 0.0825);
  _discount := LEAST(COALESCE(_discount, 0), _subtotal);
  _tax := round((_subtotal - _discount) * _rate, 2);
  UPDATE public.job_carts
  SET subtotal = _subtotal,
      tax_amount = _tax,
      total = (_subtotal - _discount) + _tax,
      updated_at = now()
  WHERE id = _cart_id;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Seed common HVAC add-on suggestions
INSERT INTO public.cart_addon_rules (trigger_kind, suggestion_kind, name, description, unit_price, badge, sort_order) VALUES
  ('equipment', 'custom', 'Whole-Home Surge Protector', 'Protects new HVAC + all appliances from power surges. One-time install.', 449, 'Most Added', 1),
  ('equipment', 'custom', 'Smart Wi-Fi Thermostat', 'Honeywell T9 with remote sensors. Save up to 23% on energy.', 389, 'Popular', 2),
  ('equipment', 'custom', 'Float Switch + Safety Drain Pan', 'Prevents costly water damage from clogged drains.', 189, NULL, 3),
  ('equipment', 'custom', 'UV Air Purification Light', 'Kills 99.9% of mold and bacteria in your air handler.', 599, NULL, 4),
  ('equipment', 'custom', '10-Year Labor Warranty', 'Full labor coverage on top of the factory parts warranty.', 695, 'Best Value', 5),
  ('equipment', 'custom', 'Annual Maintenance Membership', 'Two tune-ups per year + 15% off any repairs. ($199/yr value)', 0, 'Free 1st Year', 6),
  ('repair', 'custom', 'Capacitor Replacement', 'Replace aging capacitor while we''re here — prevents next breakdown.', 189, NULL, 1),
  ('repair', 'custom', 'Refrigerant Leak Search', 'Electronic leak detection + UV dye test.', 249, NULL, 2),
  ('repair', 'custom', 'Drain Line Flush', 'Clear and treat your condensate drain to prevent backup.', 99, NULL, 3),
  ('repair', 'custom', 'Tune-Up Special', 'Add a full system tune-up at the discounted bundle rate.', 89, 'Save $30', 4);

-- Seed a few starter discount codes
INSERT INTO public.cart_discounts (code, description, discount_type, discount_value, min_total) VALUES
  ('REPEAT10', 'Returning customer 10% off', 'percent', 10, 0),
  ('SENIOR50', 'Senior / Veteran $50 off', 'fixed', 50, 200),
  ('NEWCUSTOMER', 'First-time customer 5% off', 'percent', 5, 0);