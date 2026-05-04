ALTER TABLE public.repair_catalog
  ADD COLUMN IF NOT EXISTS manual_price_override boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_repair_catalog_manual_override
  ON public.repair_catalog (manual_price_override) WHERE manual_price_override = true;