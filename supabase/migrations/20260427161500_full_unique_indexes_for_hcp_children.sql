-- PostgREST upsert needs a non-partial unique index/constraint that exactly
-- matches the onConflict target. These nullable columns still allow multiple
-- null rows, while HCP-backed rows get deterministic upserts.

CREATE UNIQUE INDEX IF NOT EXISTS customer_invoice_items_hcp_full_unique
  ON public.customer_invoice_items(hcp_invoice_id, hcp_line_item_id);

CREATE UNIQUE INDEX IF NOT EXISTS job_attachments_hcp_attachment_id_full_unique
  ON public.job_attachments(hcp_attachment_id);
