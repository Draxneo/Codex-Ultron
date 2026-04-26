CREATE TABLE public.outbound_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel TEXT NOT NULL DEFAULT 'sms',
  recipient TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  body_html TEXT,
  job_id UUID REFERENCES public.jobs(id),
  source TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID
);

ALTER TABLE public.outbound_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read outbound drafts"
  ON public.outbound_drafts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert outbound drafts"
  ON public.outbound_drafts FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update outbound drafts"
  ON public.outbound_drafts FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Service role full access on outbound_drafts"
  ON public.outbound_drafts FOR ALL TO service_role USING (true);