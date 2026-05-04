-- Add estimate_type, repair_tiers, cash_discount_percent to estimates
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS estimate_type text NOT NULL DEFAULT 'system_replacement',
  ADD COLUMN IF NOT EXISTS repair_tiers jsonb,
  ADD COLUMN IF NOT EXISTS cash_discount_percent numeric NOT NULL DEFAULT 0;

-- Add agreement_discount_percent, total_visits, visits_used to service_agreements
ALTER TABLE public.service_agreements
  ADD COLUMN IF NOT EXISTS agreement_discount_percent numeric NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS total_visits integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS visits_used integer NOT NULL DEFAULT 0;