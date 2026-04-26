-- Tier presets: lets admins curate which equipment_matchups map to Good/Better/Best per scope
CREATE TABLE public.tier_presets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope text NOT NULL,
  tier text NOT NULL CHECK (tier IN ('good', 'better', 'best')),
  matchup_id uuid NOT NULL REFERENCES public.equipment_matchups(id) ON DELETE CASCADE,
  label text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, tier)
);

CREATE INDEX idx_tier_presets_scope ON public.tier_presets(scope);

ALTER TABLE public.tier_presets ENABLE ROW LEVEL SECURITY;

-- Public can read (customer-facing quote pages need this without auth)
CREATE POLICY "Tier presets are viewable by everyone"
ON public.tier_presets FOR SELECT
USING (true);

-- Only authenticated staff can write
CREATE POLICY "Authenticated users can insert tier presets"
ON public.tier_presets FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update tier presets"
ON public.tier_presets FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete tier presets"
ON public.tier_presets FOR DELETE
TO authenticated
USING (true);

CREATE TRIGGER update_tier_presets_updated_at
BEFORE UPDATE ON public.tier_presets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();