-- Fix invoices that got now() as paid_at because their job had null scheduled_date
-- Set paid_at to the job's created_at as a reasonable fallback (will be overwritten by backfill)
UPDATE customer_invoices ci
SET paid_at = j.created_at
FROM jobs j
WHERE ci.job_id = j.id
  AND ci.paid_at = '2026-03-06 17:21:54+00'
  AND ci.hcp_invoice_id LIKE 'hcp-%'
  AND j.scheduled_date IS NULL;