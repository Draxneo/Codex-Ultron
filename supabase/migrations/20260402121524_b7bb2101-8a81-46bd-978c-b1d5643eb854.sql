CREATE TABLE public.employee_tab_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  allowed_tabs text[] NOT NULL DEFAULT ARRAY['jobs','phone','sms','chat','pay'],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (employee_id)
);
ALTER TABLE public.employee_tab_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read tab access"
  ON public.employee_tab_access FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage tab access"
  ON public.employee_tab_access FOR ALL TO authenticated USING (true);