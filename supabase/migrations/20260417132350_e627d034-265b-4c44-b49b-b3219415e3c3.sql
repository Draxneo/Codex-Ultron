ALTER TABLE public.job_attachments
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS hidden_from_tech_share boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS classification_confidence numeric;

CREATE INDEX IF NOT EXISTS idx_job_attachments_hidden_from_tech_share
  ON public.job_attachments (job_id) WHERE hidden_from_tech_share = false;