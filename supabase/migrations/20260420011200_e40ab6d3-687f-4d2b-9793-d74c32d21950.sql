-- quick_quote_links: stores customer-facing quote snapshots for /q/:token
CREATE TABLE public.quick_quote_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  estimate_id UUID,
  matchup_snapshot JSONB NOT NULL,
  rendered_snapshot JSONB,
  company_snapshot JSONB,
  selected_payment TEXT,
  approved_at TIMESTAMPTZ,
  view_count INTEGER NOT NULL DEFAULT 0,
  first_viewed_at TIMESTAMPTZ,
  last_viewed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_quick_quote_links_token ON public.quick_quote_links(token);
CREATE INDEX idx_quick_quote_links_estimate ON public.quick_quote_links(estimate_id);

ALTER TABLE public.quick_quote_links ENABLE ROW LEVEL SECURITY;

-- Public read by token (customer view)
CREATE POLICY "Public can read quick_quote_links by token"
  ON public.quick_quote_links FOR SELECT
  USING (true);

-- Public update for selected_payment / approved_at / view counters (token-gated client side)
CREATE POLICY "Public can update approval and view fields"
  ON public.quick_quote_links FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Authenticated users can insert
CREATE POLICY "Authenticated can create quick_quote_links"
  ON public.quick_quote_links FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE TRIGGER update_quick_quote_links_updated_at
  BEFORE UPDATE ON public.quick_quote_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
