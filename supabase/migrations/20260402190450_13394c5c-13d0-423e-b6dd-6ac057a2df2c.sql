
-- Directions cache: store driving directions results to avoid repeat API calls
CREATE TABLE public.directions_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_lat double precision NOT NULL,
  origin_lng double precision NOT NULL,
  dest_lat double precision NOT NULL,
  dest_lng double precision NOT NULL,
  -- Hash of rounded coords for fast lookup (~100m precision)
  route_hash text GENERATED ALWAYS AS (
    md5(round(origin_lat::numeric, 3)::text || ',' || round(origin_lng::numeric, 3)::text || '>' || round(dest_lat::numeric, 3)::text || ',' || round(dest_lng::numeric, 3)::text)
  ) STORED,
  duration_seconds integer NOT NULL,
  distance_meters integer NOT NULL,
  duration_in_traffic_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_directions_cache_hash ON public.directions_cache (route_hash);

ALTER TABLE public.directions_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.directions_cache
  FOR ALL USING (true) WITH CHECK (true);
