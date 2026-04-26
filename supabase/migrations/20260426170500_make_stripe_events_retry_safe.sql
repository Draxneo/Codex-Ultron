ALTER TABLE public.stripe_events
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'processed',
  ADD COLUMN IF NOT EXISTS processing_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_processing_error text,
  ADD COLUMN IF NOT EXISTS last_processing_error_at timestamptz;

UPDATE public.stripe_events
SET
  processing_status = COALESCE(processing_status, 'processed'),
  processed_at = COALESCE(processed_at, created_at)
WHERE processing_status IS NULL OR processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stripe_events_processing_status
  ON public.stripe_events(processing_status);

CREATE UNIQUE INDEX IF NOT EXISTS customer_invoices_stripe_payment_intent_id_unique
  ON public.customer_invoices(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

ALTER TABLE public.stripe_events
  DROP CONSTRAINT IF EXISTS stripe_events_processing_status_check;

ALTER TABLE public.stripe_events
  ADD CONSTRAINT stripe_events_processing_status_check
  CHECK (processing_status IN ('processing', 'processed', 'failed'));

CREATE OR REPLACE FUNCTION public.increment_stripe_event_attempts(p_stripe_event_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.stripe_events
  SET processing_attempts = COALESCE(processing_attempts, 0) + 1
  WHERE stripe_event_id = p_stripe_event_id;
$$;
