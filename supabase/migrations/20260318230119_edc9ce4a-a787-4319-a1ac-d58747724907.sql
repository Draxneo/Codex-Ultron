
CREATE TABLE public.workflow_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL UNIQUE,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workflow_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read workflow definitions"
  ON public.workflow_definitions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert workflow definitions"
  ON public.workflow_definitions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update workflow definitions"
  ON public.workflow_definitions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
