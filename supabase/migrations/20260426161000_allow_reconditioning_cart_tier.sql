ALTER TABLE public.job_cart_items
  DROP CONSTRAINT IF EXISTS job_cart_items_tier_check;

ALTER TABLE public.job_cart_items
  ADD CONSTRAINT job_cart_items_tier_check
  CHECK (
    tier IS NULL
    OR tier IN ('good', 'better', 'best', 'critical', 'recommended', 'premium', 'reconditioning')
  );
