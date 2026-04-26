CREATE TABLE public.pricing_formulas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand text NOT NULL,
  tier text,
  materials_fee numeric NOT NULL DEFAULT 300,
  tax_rate numeric NOT NULL DEFAULT 8.25,
  labor_fee numeric NOT NULL DEFAULT 1000,
  profit_fee numeric NOT NULL DEFAULT 4000,
  finance_rate numeric NOT NULL DEFAULT 16,
  cash_rebate numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(brand, tier)
);

ALTER TABLE public.pricing_formulas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read pricing_formulas"
  ON public.pricing_formulas FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage pricing_formulas"
  ON public.pricing_formulas FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));