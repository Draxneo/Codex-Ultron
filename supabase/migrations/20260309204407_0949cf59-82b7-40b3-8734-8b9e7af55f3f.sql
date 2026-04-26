
-- Track completed visits against service agreements
CREATE TABLE public.agreement_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.service_agreements(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  visit_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.agreement_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to agreement_visits"
  ON public.agreement_visits FOR ALL
  TO public
  USING (true) WITH CHECK (true);

-- Enable realtime for portal updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.agreement_visits;
