-- Add job_id (source job context) and auto-create tracking to quick_quote_links
ALTER TABLE public.quick_quote_links
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_create_status text,
  ADD COLUMN IF NOT EXISTS auto_create_result jsonb,
  ADD COLUMN IF NOT EXISTS hcp_job_id text;

CREATE INDEX IF NOT EXISTS idx_quick_quote_links_job ON public.quick_quote_links(job_id);
