CREATE TABLE public.workflow_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  step_id text NOT NULL,
  alert_type text NOT NULL,
  details text,
  missing_fields text[],
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.workflow_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage workflow_alerts"
  ON public.workflow_alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);