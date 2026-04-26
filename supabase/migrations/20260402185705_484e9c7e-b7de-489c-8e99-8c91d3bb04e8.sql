
-- Geocode cache: store address → lat/lng permanently to avoid repeat Google API calls
CREATE TABLE public.geocode_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address_input text NOT NULL,
  address_hash text GENERATED ALWAYS AS (md5(lower(trim(address_input)))) STORED,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  formatted_address text,
  source text DEFAULT 'google',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique on normalized hash so we never store the same address twice
CREATE UNIQUE INDEX idx_geocode_cache_hash ON public.geocode_cache (address_hash);

-- Fast lookup index
CREATE INDEX idx_geocode_cache_address ON public.geocode_cache (address_input);

-- RLS: edge functions use service role, so just enable RLS with permissive read
ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.geocode_cache
  FOR ALL USING (true) WITH CHECK (true);
