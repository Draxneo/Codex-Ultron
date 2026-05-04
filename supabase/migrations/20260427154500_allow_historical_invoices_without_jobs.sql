-- Historical HCP invoices are not always attached to a job record that exists
-- locally. Keep the invoice history and link it when a job is available.

ALTER TABLE public.customer_invoices
  ALTER COLUMN job_id DROP NOT NULL;

ALTER TABLE public.customer_invoices
  DROP CONSTRAINT IF EXISTS customer_invoices_job_id_fkey;

ALTER TABLE public.customer_invoices
  ADD CONSTRAINT customer_invoices_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;
