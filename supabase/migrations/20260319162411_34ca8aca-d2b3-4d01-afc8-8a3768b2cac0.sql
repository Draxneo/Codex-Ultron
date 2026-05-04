
-- Meta audience definitions
CREATE TABLE public.meta_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  meta_audience_id text,
  filter_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  last_sync_count integer DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_audiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view meta_audiences"
  ON public.meta_audiences FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert meta_audiences"
  ON public.meta_audiences FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update meta_audiences"
  ON public.meta_audiences FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete meta_audiences"
  ON public.meta_audiences FOR DELETE TO authenticated USING (true);

-- Meta audience sync history
CREATE TABLE public.meta_audience_syncs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience_id uuid NOT NULL REFERENCES public.meta_audiences(id) ON DELETE CASCADE,
  customers_synced integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_audience_syncs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view meta_audience_syncs"
  ON public.meta_audience_syncs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert meta_audience_syncs"
  ON public.meta_audience_syncs FOR INSERT TO authenticated WITH CHECK (true);
