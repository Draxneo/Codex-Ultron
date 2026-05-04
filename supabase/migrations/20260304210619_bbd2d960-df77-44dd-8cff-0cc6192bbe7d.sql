
-- Per-employee pay rates (overrides default pay_rates)
CREATE TABLE public.employee_pay_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  job_type text NOT NULL,
  rate numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, job_type)
);
ALTER TABLE public.employee_pay_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read employee_pay_rates" ON public.employee_pay_rates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage employee_pay_rates" ON public.employee_pay_rates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
