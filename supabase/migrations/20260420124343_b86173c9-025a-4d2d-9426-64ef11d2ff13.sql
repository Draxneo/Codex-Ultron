-- Repair Pricing Matrix — flat-rate edition
CREATE TABLE public.repair_pricing_formulas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL,
  flat_rate_multiplier numeric NOT NULL DEFAULT 1.00,
  member_discount numeric NOT NULL DEFAULT 0.15,
  margin_floor numeric NOT NULL DEFAULT 0.65,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT repair_pricing_formulas_category_unique UNIQUE (category)
);

ALTER TABLE public.repair_pricing_formulas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view repair pricing formulas"
ON public.repair_pricing_formulas FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Admins can insert repair pricing formulas"
ON public.repair_pricing_formulas FOR INSERT
TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update repair pricing formulas"
ON public.repair_pricing_formulas FOR UPDATE
TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete repair pricing formulas"
ON public.repair_pricing_formulas FOR DELETE
TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_repair_pricing_formulas_updated_at
BEFORE UPDATE ON public.repair_pricing_formulas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed global default
INSERT INTO public.repair_pricing_formulas (category, flat_rate_multiplier, member_discount, margin_floor)
VALUES ('default', 1.00, 0.15, 0.65)
ON CONFLICT (category) DO NOTHING;