ALTER TABLE service_repair_items
  ADD COLUMN customer_description text,
  ADD COLUMN importance text,
  ADD COLUMN consequences text;