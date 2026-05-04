
-- Add skip-logic fields for install workflow
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS permit_required boolean NOT NULL DEFAULT true;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS rebate_eligible boolean NOT NULL DEFAULT true;

-- Payment failure tracking — set by Stripe webhook, cleared on success
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS last_payment_error text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS last_payment_error_at timestamptz;
