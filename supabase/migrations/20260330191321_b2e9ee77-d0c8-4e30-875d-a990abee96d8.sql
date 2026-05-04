
-- Add LSA-specific columns to leads table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lsa_lead_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS lsa_lead_type text,
  ADD COLUMN IF NOT EXISTS lsa_category text,
  ADD COLUMN IF NOT EXISTS lsa_charged boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS drip_sequence_id uuid REFERENCES public.message_sequences(id),
  ADD COLUMN IF NOT EXISTS drip_step_index integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS drip_next_at timestamptz;

-- Index for drip cron queries
CREATE INDEX IF NOT EXISTS idx_leads_drip_next ON public.leads (drip_next_at) WHERE drip_next_at IS NOT NULL;

-- Index for LSA source filtering
CREATE INDEX IF NOT EXISTS idx_leads_source ON public.leads (source) WHERE source = 'google_lsa';
