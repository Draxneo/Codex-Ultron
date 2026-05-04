
CREATE TABLE public.tech_form_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tech_form_id uuid NOT NULL,
  responses jsonb NOT NULL DEFAULT '{}',
  snapshot_reason text NOT NULL DEFAULT 'undo',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tech_form_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access to tech_form_versions"
  ON public.tech_form_versions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can insert tech_form_versions"
  ON public.tech_form_versions
  FOR INSERT
  TO anon
  WITH CHECK (true);
