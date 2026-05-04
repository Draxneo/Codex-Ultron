CREATE TABLE public.job_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','approved','paid','declined','canceled')),
  public_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax_rate numeric(6,4) NOT NULL DEFAULT 0.0825,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_by text,
  sent_at timestamptz,
  approved_at timestamptz,
  paid_at timestamptz,
  payment_method text,
  stripe_checkout_url text,
  stripe_payment_intent_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX job_carts_one_active_per_job
  ON public.job_carts(job_id)
  WHERE status NOT IN ('canceled','declined');

CREATE INDEX idx_job_carts_job_id ON public.job_carts(job_id);
CREATE INDEX idx_job_carts_status ON public.job_carts(status);
CREATE INDEX idx_job_carts_public_token ON public.job_carts(public_token);

CREATE TABLE public.job_cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES public.job_carts(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('equipment','repair','part','custom')),
  source_id uuid,
  name text NOT NULL,
  description text,
  image_url text,
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  total_price numeric(12,2) NOT NULL DEFAULT 0,
  tier text CHECK (tier IS NULL OR tier IN ('good','better','best')),
  metadata jsonb DEFAULT '{}'::jsonb,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_cart_items_cart_id ON public.job_cart_items(cart_id);

CREATE TRIGGER trg_job_carts_updated_at
  BEFORE UPDATE ON public.job_carts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_job_cart_items_updated_at
  BEFORE UPDATE ON public.job_cart_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.recalc_job_cart_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cart_id uuid;
  _subtotal numeric(12,2);
  _rate numeric(6,4);
  _tax numeric(12,2);
BEGIN
  _cart_id := COALESCE(NEW.cart_id, OLD.cart_id);
  SELECT COALESCE(SUM(total_price), 0) INTO _subtotal FROM public.job_cart_items WHERE cart_id = _cart_id;
  SELECT tax_rate INTO _rate FROM public.job_carts WHERE id = _cart_id;
  _rate := COALESCE(_rate, 0.0825);
  _tax := round(_subtotal * _rate, 2);
  UPDATE public.job_carts
  SET subtotal = _subtotal, tax_amount = _tax, total = _subtotal + _tax, updated_at = now()
  WHERE id = _cart_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_recalc_job_cart_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.job_cart_items
  FOR EACH ROW EXECUTE FUNCTION public.recalc_job_cart_totals();

CREATE OR REPLACE FUNCTION public.auto_create_job_cart()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.job_carts (job_id, status, created_by)
  VALUES (NEW.id, 'draft', NEW.assigned_to)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_create_job_cart
  AFTER INSERT ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_job_cart();

INSERT INTO public.job_carts (job_id, status)
SELECT j.id, 'draft'
FROM public.jobs j
LEFT JOIN public.job_carts jc ON jc.job_id = j.id AND jc.status NOT IN ('canceled','declined')
WHERE jc.id IS NULL
ON CONFLICT DO NOTHING;

ALTER TABLE public.job_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access to job_carts"
ON public.job_carts FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated full access to job_cart_items"
ON public.job_cart_items FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Public read job_carts"
ON public.job_carts FOR SELECT
USING (true);

CREATE POLICY "Public read job_cart_items"
ON public.job_cart_items FOR SELECT
USING (true);