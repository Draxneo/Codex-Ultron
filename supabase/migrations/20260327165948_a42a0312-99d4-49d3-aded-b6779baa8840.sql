
-- Add template_id to job_line_items (traces back to catalog template)
ALTER TABLE public.job_line_items
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.line_item_templates(id) ON DELETE SET NULL;

-- Add waived/waived_reason to job_line_items (for service-call-waived-with-repair flow)
ALTER TABLE public.job_line_items
  ADD COLUMN IF NOT EXISTS waived boolean NOT NULL DEFAULT false;

ALTER TABLE public.job_line_items
  ADD COLUMN IF NOT EXISTS waived_reason text;

-- Add source_line_item_id to customer_invoice_items (traces back to job line item)
ALTER TABLE public.customer_invoice_items
  ADD COLUMN IF NOT EXISTS source_line_item_id uuid REFERENCES public.job_line_items(id) ON DELETE SET NULL;
