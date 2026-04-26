ALTER TABLE estimate_presentations
  ADD COLUMN IF NOT EXISTS cart_source text DEFAULT 'office',
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;