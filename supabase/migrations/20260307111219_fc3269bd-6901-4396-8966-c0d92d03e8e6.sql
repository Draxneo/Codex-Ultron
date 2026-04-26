
CREATE TABLE public.payment_plan_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL DEFAULT 'all',
  min_amount numeric NOT NULL DEFAULT 0,
  max_amount numeric,
  max_installments integer NOT NULL DEFAULT 2,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_plan_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to payment_plan_rules" ON public.payment_plan_rules FOR ALL USING (true) WITH CHECK (true);
