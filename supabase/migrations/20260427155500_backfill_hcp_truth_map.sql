-- Set-based backfill for the HCP historical truth map.

UPDATE public.jobs j
SET
  hcp_original_estimate_option_id = COALESCE(
    j.hcp_original_estimate_option_id,
    NULLIF(j.raw_hcp_json ->> 'original_estimate_id', ''),
    NULLIF(j.raw_hcp_json #>> '{original_estimate_uuids,0}', '')
  ),
  hcp_original_estimate_option_ids = CASE
    WHEN COALESCE(array_length(j.hcp_original_estimate_option_ids, 1), 0) > 0
      THEN j.hcp_original_estimate_option_ids
    WHEN jsonb_typeof(j.raw_hcp_json -> 'original_estimate_uuids') = 'array'
      THEN ARRAY(
        SELECT jsonb_array_elements_text(j.raw_hcp_json -> 'original_estimate_uuids')
      )
    WHEN NULLIF(j.raw_hcp_json ->> 'original_estimate_id', '') IS NOT NULL
      THEN ARRAY[j.raw_hcp_json ->> 'original_estimate_id']
    ELSE '{}'::text[]
  END
WHERE j.raw_hcp_json IS NOT NULL;

UPDATE public.jobs j
SET primary_invoice_id = (
  SELECT ci.id
  FROM public.customer_invoices ci
  WHERE ci.job_id = j.id
  ORDER BY COALESCE(ci.subtotal, ci.total, 0) DESC, ci.created_at DESC
  LIMIT 1
)
WHERE j.primary_invoice_id IS DISTINCT FROM (
  SELECT ci.id
  FROM public.customer_invoices ci
  WHERE ci.job_id = j.id
  ORDER BY COALESCE(ci.subtotal, ci.total, 0) DESC, ci.created_at DESC
  LIMIT 1
);

UPDATE public.estimates e
SET
  historical_role = 'legacy_hcp_conversion_breadcrumb',
  detail_source = 'job_invoice',
  converted_job_id = j.id,
  converted_invoice_id = j.primary_invoice_id,
  hcp_original_estimate_option_id = COALESCE(e.hcp_original_estimate_option_id, j.hcp_original_estimate_option_id)
FROM public.jobs j
WHERE j.estimate_id = e.id
  AND e.hcp_id IS NOT NULL;

UPDATE public.estimates e
SET
  historical_role = 'legacy_hcp_conversion_breadcrumb',
  detail_source = 'job_invoice',
  converted_job_id = j.id,
  converted_invoice_id = j.primary_invoice_id,
  hcp_original_estimate_option_id = COALESCE(e.hcp_original_estimate_option_id, j.hcp_original_estimate_option_id)
FROM public.jobs j
WHERE e.hcp_id IS NOT NULL
  AND e.converted_job_id IS NULL
  AND j.hcp_original_estimate_option_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.estimate_line_items eli
    WHERE eli.estimate_id = e.id
      AND eli.hcp_option_id = j.hcp_original_estimate_option_id
  );

UPDATE public.estimates e
SET
  historical_role = 'legacy_hcp_estimate_shell',
  detail_source = 'hcp_estimate_shell'
WHERE e.hcp_id IS NOT NULL
  AND e.converted_job_id IS NULL;
