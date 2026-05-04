ALTER TABLE public.job_attachments
  ADD COLUMN IF NOT EXISTS parent_attachment_id uuid REFERENCES public.job_attachments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_annotated boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_job_attachments_parent ON public.job_attachments(parent_attachment_id) WHERE parent_attachment_id IS NOT NULL;