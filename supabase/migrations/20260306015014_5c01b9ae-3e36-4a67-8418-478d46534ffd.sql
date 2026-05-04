-- Fix discount/rebate/credit line items: negate their amounts
UPDATE customer_invoice_items
SET unit_price = -ABS(unit_price),
    total = -ABS(total)
WHERE (LOWER(description) LIKE '%discount%' 
    OR LOWER(description) LIKE '%rebate%' 
    OR LOWER(description) LIKE '%credit%')
  AND total > 0;

-- Recalculate invoice subtotals and totals from their line items
UPDATE customer_invoices ci
SET subtotal = sub.new_subtotal,
    total = sub.new_subtotal
FROM (
  SELECT invoice_id, SUM(total) as new_subtotal
  FROM customer_invoice_items
  GROUP BY invoice_id
) sub
WHERE ci.id = sub.invoice_id
  AND ci.hcp_invoice_id IS NOT NULL;