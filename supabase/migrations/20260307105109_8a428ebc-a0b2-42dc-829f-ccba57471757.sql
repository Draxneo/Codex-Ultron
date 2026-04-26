
-- Add Stripe columns to customer_invoices
ALTER TABLE public.customer_invoices
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_checkout_url text,
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'manual';

-- Add deposit columns to jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS deposit_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_paid_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS stripe_deposit_session_id text;

-- Add Stripe columns to service_agreements
ALTER TABLE public.service_agreements
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id text;
