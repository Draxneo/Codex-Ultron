-- HCP history cleanup:
-- Jobs are the operational record, invoices are the financial/detail truth,
-- and HCP estimates are kept only as conversion breadcrumbs when applicable.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS hcp_original_estimate_option_id text,
  ADD COLUMN IF NOT EXISTS hcp_original_estimate_option_ids text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS hcp_original_estimate_number text,
  ADD COLUMN IF NOT EXISTS primary_invoice_id uuid REFERENCES public.customer_invoices(id) ON DELETE SET NULL;

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS historical_role text NOT NULL DEFAULT 'proposal',
  ADD COLUMN IF NOT EXISTS converted_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_invoice_id uuid REFERENCES public.customer_invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hcp_original_estimate_option_id text,
  ADD COLUMN IF NOT EXISTS detail_source text NOT NULL DEFAULT 'estimate';

CREATE INDEX IF NOT EXISTS idx_jobs_hcp_original_estimate_option_id
  ON public.jobs(hcp_original_estimate_option_id)
  WHERE hcp_original_estimate_option_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_primary_invoice_id
  ON public.jobs(primary_invoice_id)
  WHERE primary_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_estimates_converted_job_id
  ON public.estimates(converted_job_id)
  WHERE converted_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_estimates_converted_invoice_id
  ON public.estimates(converted_invoice_id)
  WHERE converted_invoice_id IS NOT NULL;

CREATE OR REPLACE VIEW public.hcp_job_invoice_truth_map AS
SELECT
  j.id AS job_id,
  COALESCE(j.job_number, j.hcp_job_number) AS job_number,
  j.hcp_id AS hcp_job_id,
  j.customer_id,
  j.hcp_customer_id,
  j.customer_name,
  j.address,
  j.scheduled_date,
  j.hcp_original_estimate_option_id,
  e.id AS converted_from_estimate_id,
  e.estimate_number AS converted_from_estimate_number,
  e.hcp_id AS hcp_estimate_id,
  ci.id AS primary_invoice_id,
  ci.invoice_number AS primary_invoice_number,
  ci.hcp_invoice_id,
  ci.subtotal AS invoice_subtotal,
  ci.total AS invoice_total,
  ci.status AS invoice_status
FROM public.jobs j
LEFT JOIN public.estimates e
  ON e.id = j.estimate_id
  OR e.converted_job_id = j.id
  OR (
    j.hcp_original_estimate_option_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.estimate_line_items eli
      WHERE eli.estimate_id = e.id
        AND eli.hcp_option_id = j.hcp_original_estimate_option_id
    )
  )
LEFT JOIN public.customer_invoices ci
  ON ci.id = j.primary_invoice_id
  OR (
    j.primary_invoice_id IS NULL
    AND ci.job_id = j.id
    AND ci.id = (
      SELECT ci2.id
      FROM public.customer_invoices ci2
      WHERE ci2.job_id = j.id
      ORDER BY COALESCE(ci2.subtotal, ci2.total, 0) DESC, ci2.created_at DESC
      LIMIT 1
    )
  );

COMMENT ON VIEW public.hcp_job_invoice_truth_map IS
  'Historical HCP map: job is the work record, primary invoice is the line-item truth, estimate is only conversion provenance.';
