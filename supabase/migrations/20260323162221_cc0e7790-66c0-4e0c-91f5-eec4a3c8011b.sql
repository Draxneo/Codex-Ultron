ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS sale_source text NOT NULL DEFAULT 'on_site';
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS site_visit_missing boolean NOT NULL DEFAULT false;