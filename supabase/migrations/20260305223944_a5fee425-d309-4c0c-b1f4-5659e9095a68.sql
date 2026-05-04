CREATE TABLE public.job_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  hcp_line_item_id text UNIQUE,
  name text NOT NULL,
  description text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  kind text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to job_line_items"
  ON public.job_line_items
  FOR ALL
  USING (true)
  WITH CHECK (true);