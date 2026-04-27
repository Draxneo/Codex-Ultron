-- HCP invoice items should be upsertable one by one. This keeps chunked
-- history normalization from deleting/reinserting invoice rows at boundaries.

CREATE UNIQUE INDEX IF NOT EXISTS customer_invoice_items_hcp_unique
  ON public.customer_invoice_items(hcp_invoice_id, hcp_line_item_id)
  WHERE hcp_invoice_id IS NOT NULL AND hcp_line_item_id IS NOT NULL;
