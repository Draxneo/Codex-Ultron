
UPDATE customer_invoices ci
SET paid_at = j.scheduled_date::timestamp with time zone
FROM jobs j
WHERE ci.job_id = j.id
  AND ci.hcp_invoice_id LIKE 'hcp-%'
  AND j.scheduled_date IS NOT NULL;
