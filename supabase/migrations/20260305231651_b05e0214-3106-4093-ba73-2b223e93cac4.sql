
-- Drop the partial unique index and replace with a proper unique constraint
DROP INDEX IF EXISTS customer_invoices_hcp_invoice_id_key;
ALTER TABLE customer_invoices ADD CONSTRAINT customer_invoices_hcp_invoice_id_unique UNIQUE (hcp_invoice_id);
