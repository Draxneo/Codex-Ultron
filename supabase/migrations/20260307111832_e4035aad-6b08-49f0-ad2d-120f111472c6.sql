
CREATE TABLE public.stripe_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text UNIQUE,
  event_type text NOT NULL,
  amount numeric DEFAULT 0,
  currency text DEFAULT 'usd',
  customer_email text,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'succeeded',
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.customer_invoices(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read stripe_events" ON public.stripe_events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can insert stripe_events" ON public.stripe_events
  FOR INSERT WITH CHECK (true);
