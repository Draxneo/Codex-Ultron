CREATE TABLE public.quick_link_logos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text UNIQUE NOT NULL,
  logo_url text,
  fetched_at timestamptz DEFAULT now()
);

ALTER TABLE public.quick_link_logos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read quick_link_logos"
  ON public.quick_link_logos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert quick_link_logos"
  ON public.quick_link_logos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update quick_link_logos"
  ON public.quick_link_logos FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);