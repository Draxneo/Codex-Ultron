-- Universal technician vocabulary for JARVIS catalog matching.
-- This lets office/admin users teach field phrases like "35x5 run cap",
-- "two-pole contactor", or "Carrier Performance attic system" without
-- changing application code.

CREATE TABLE IF NOT EXISTS public.jarvis_catalog_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('repair', 'equipment')),
  target_id uuid NOT NULL,
  phrase text NOT NULL,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('suggested', 'approved', 'rejected')),
  source text NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'tech_correction', 'jarvis_suggestion', 'import')),
  confidence numeric NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
  hit_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  notes text,
  created_by uuid,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS jarvis_catalog_terms_unique_phrase_target
  ON public.jarvis_catalog_terms (target_type, target_id, lower(trim(phrase)));

CREATE INDEX IF NOT EXISTS idx_jarvis_catalog_terms_target
  ON public.jarvis_catalog_terms (target_type, target_id, status);

CREATE INDEX IF NOT EXISTS idx_jarvis_catalog_terms_phrase
  ON public.jarvis_catalog_terms USING gin (to_tsvector('simple', phrase));

CREATE OR REPLACE FUNCTION public.touch_jarvis_catalog_terms_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_jarvis_catalog_terms_updated_at ON public.jarvis_catalog_terms;
CREATE TRIGGER trg_touch_jarvis_catalog_terms_updated_at
BEFORE UPDATE ON public.jarvis_catalog_terms
FOR EACH ROW EXECUTE FUNCTION public.touch_jarvis_catalog_terms_updated_at();

ALTER TABLE public.jarvis_catalog_terms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read jarvis catalog terms" ON public.jarvis_catalog_terms;
DROP POLICY IF EXISTS "Authenticated users can insert jarvis catalog terms" ON public.jarvis_catalog_terms;
DROP POLICY IF EXISTS "Authenticated users can update jarvis catalog terms" ON public.jarvis_catalog_terms;
DROP POLICY IF EXISTS "Authenticated users can delete jarvis catalog terms" ON public.jarvis_catalog_terms;

CREATE POLICY "Authenticated users can read jarvis catalog terms"
  ON public.jarvis_catalog_terms
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert jarvis catalog terms"
  ON public.jarvis_catalog_terms
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update jarvis catalog terms"
  ON public.jarvis_catalog_terms
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete jarvis catalog terms"
  ON public.jarvis_catalog_terms
  FOR DELETE
  TO authenticated
  USING (true);
