
CREATE TABLE public.auto_assign_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_type, employee_id)
);

ALTER TABLE public.auto_assign_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read auto_assign_rules"
  ON public.auto_assign_rules FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage auto_assign_rules"
  ON public.auto_assign_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);
