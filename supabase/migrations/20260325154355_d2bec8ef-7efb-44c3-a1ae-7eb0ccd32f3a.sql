
CREATE TABLE public.customer_intake_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL DEFAULT gen_random_uuid()::text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  completed_at timestamptz,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX idx_customer_intake_tokens_token ON public.customer_intake_tokens(token);

ALTER TABLE public.customer_intake_tokens ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to read non-expired tokens
CREATE POLICY "Anyone can read valid tokens" ON public.customer_intake_tokens
  FOR SELECT TO anon, authenticated
  USING (expires_at > now());

-- Allow anonymous users to update (complete) tokens
CREATE POLICY "Anyone can complete tokens" ON public.customer_intake_tokens
  FOR UPDATE TO anon, authenticated
  USING (expires_at > now() AND completed_at IS NULL)
  WITH CHECK (completed_at IS NOT NULL);

-- Allow authenticated users to insert tokens
CREATE POLICY "Authenticated users can create tokens" ON public.customer_intake_tokens
  FOR INSERT TO authenticated
  WITH CHECK (true);
