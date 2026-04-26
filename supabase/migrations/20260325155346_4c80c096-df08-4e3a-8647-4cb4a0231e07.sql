
CREATE TABLE public.customer_discovery_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  field_label text NOT NULL,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_cda_customer_field ON public.customer_discovery_answers (customer_id, field_label);

ALTER TABLE public.customer_discovery_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view discovery answers"
  ON public.customer_discovery_answers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert discovery answers"
  ON public.customer_discovery_answers FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update discovery answers"
  ON public.customer_discovery_answers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
