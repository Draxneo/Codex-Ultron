ALTER TABLE public.job_carts
  ADD COLUMN IF NOT EXISTS source_presentation_id uuid REFERENCES public.estimate_presentations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS selected_option_key text,
  ADD COLUMN IF NOT EXISTS payment_timing text NOT NULL DEFAULT 'unspecified',
  ADD COLUMN IF NOT EXISTS approved_scope_snapshot jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_due_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_job_carts_source_presentation_id
  ON public.job_carts(source_presentation_id);

DROP INDEX IF EXISTS public.job_carts_one_active_per_job;
CREATE UNIQUE INDEX job_carts_one_active_per_job
  ON public.job_carts(job_id)
  WHERE status NOT IN ('canceled', 'declined', 'paid');

COMMENT ON COLUMN public.job_carts.payment_timing IS
  'How the customer chose to pay: pay_now, pay_after_completion, financing, cash, approve_only, unspecified.';

ALTER TABLE public.job_cart_items
  DROP CONSTRAINT IF EXISTS job_cart_items_tier_check;

ALTER TABLE public.job_cart_items
  ADD CONSTRAINT job_cart_items_tier_check
  CHECK (
    tier IS NULL
    OR tier IN ('good', 'better', 'best', 'critical', 'recommended', 'premium')
  );
