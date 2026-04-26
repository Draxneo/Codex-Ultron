ALTER TABLE public.supply_houses 
ADD COLUMN IF NOT EXISTS ordering_url text,
ADD COLUMN IF NOT EXISTS brand_affinity text[] DEFAULT '{}'::text[];