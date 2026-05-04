CREATE TABLE public.call_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department text NOT NULL CHECK (department IN ('sales','service','billing','general')),
  employee_name text NOT NULL,
  priority int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_call_routing_rules_dept_priority
  ON public.call_routing_rules (department, priority)
  WHERE is_active = true;

ALTER TABLE public.call_routing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage call_routing_rules"
  ON public.call_routing_rules
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "authenticated read call_routing_rules"
  ON public.call_routing_rules
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER trg_call_routing_rules_updated_at
  BEFORE UPDATE ON public.call_routing_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.call_routing_rules (department, employee_name, priority) VALUES
  ('sales','Clint',1),
  ('service','Matt',1),
  ('service','Clint',2),
  ('general','Clint',1),
  ('billing','Clint',1);