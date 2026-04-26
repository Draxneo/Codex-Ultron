
-- estimate_presentations: tracks each sales presentation sent to a customer
CREATE TABLE public.estimate_presentations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL,
  token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  customer_email text,
  pricing_snapshot jsonb,
  selected_tiers text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer NOT NULL DEFAULT 0,
  UNIQUE(token)
);

-- estimate_responses: tracks customer actions on presentations
CREATE TABLE public.estimate_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL,
  presentation_id uuid REFERENCES public.estimate_presentations(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('approved','changes_requested','declined')),
  message text,
  payment_preference text,
  responded_at timestamptz NOT NULL DEFAULT now()
);

-- Add presentation_sent_at to estimates
ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS presentation_sent_at timestamptz;
ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS customer_approved_at timestamptz;

-- RLS for estimate_presentations
ALTER TABLE public.estimate_presentations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage presentations" ON public.estimate_presentations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public can view by token" ON public.estimate_presentations FOR SELECT TO anon USING (true);
CREATE POLICY "Public can update view tracking" ON public.estimate_presentations FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- RLS for estimate_responses
ALTER TABLE public.estimate_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view responses" ON public.estimate_responses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public can insert responses" ON public.estimate_responses FOR INSERT TO anon WITH CHECK (true);
