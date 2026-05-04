ALTER TABLE customer_invoices ADD COLUMN hcp_invoice_id text;
CREATE UNIQUE INDEX customer_invoices_hcp_invoice_id_key ON customer_invoices (hcp_invoice_id) WHERE hcp_invoice_id IS NOT NULL;