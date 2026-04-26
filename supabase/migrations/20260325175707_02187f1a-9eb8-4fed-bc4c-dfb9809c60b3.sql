
ALTER TABLE public.job_invoices
  ADD COLUMN IF NOT EXISTS match_confidence text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS match_status text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS match_reason text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_ref_id uuid,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE public.tech_form_photos
  ADD COLUMN IF NOT EXISTS job_invoice_id uuid REFERENCES public.job_invoices(id);

ALTER TABLE public.emails
  ADD COLUMN IF NOT EXISTS job_invoice_id uuid REFERENCES public.job_invoices(id);
