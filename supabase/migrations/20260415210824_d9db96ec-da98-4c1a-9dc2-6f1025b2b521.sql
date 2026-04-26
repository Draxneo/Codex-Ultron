DROP FUNCTION IF EXISTS public.get_customers_paginated(text, text, integer, integer, text);

CREATE OR REPLACE FUNCTION public.get_customers_paginated(
  p_search text DEFAULT '',
  p_sort_by text DEFAULT 'recent',
  p_page_num integer DEFAULT 0,
  p_page_size integer DEFAULT 50,
  p_letter text DEFAULT NULL
)
RETURNS TABLE(
  id uuid, first_name text, last_name text, company text, email text,
  phone text, mobile_phone text, address text, city text, state text, zip text,
  notes text, tags text[], hcp_customer_id text,
  created_at timestamptz, updated_at timestamptz,
  job_count bigint, has_install boolean, last_job_date date,
  agreement_status text, agreement_plan_name text, agreement_end_date date,
  agreement_plan_source text,
  total_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH search_params AS (
    SELECT
      COALESCE(NULLIF(trim(p_search), ''), NULL) AS raw_search,
      regexp_replace(COALESCE(NULLIF(trim(p_search), ''), ''), '\D', '', 'g') AS digits_only,
      string_to_array(lower(trim(p_search)), ' ') AS words
  ),
  enriched AS (
    SELECT
      c.*,
      COALESCE(jc.jcount, 0) AS job_count,
      COALESCE(jc.has_install, false) AS has_install,
      jc.last_job_date,
      CASE
        WHEN sa.status = 'active' AND sa.end_date >= CURRENT_DATE THEN 'active'
        WHEN sa.id IS NOT NULL THEN 'expired'
        ELSE 'none'
      END AS agreement_status,
      sa.plan_name AS agreement_plan_name,
      sa.end_date AS agreement_end_date,
      sa.plan_source AS agreement_plan_source,
      COALESCE(c.city, ca_city.city) AS resolved_city,
      CASE
        WHEN sp.raw_search IS NULL THEN 0
        WHEN array_length(sp.words, 1) >= 2
          AND lower(COALESCE(c.first_name, '')) LIKE sp.words[1] || '%'
          AND lower(COALESCE(c.last_name, '')) LIKE sp.words[2] || '%'
          THEN 3
        WHEN lower(COALESCE(c.first_name, '')) LIKE sp.words[1] || '%' THEN 2
        WHEN lower(COALESCE(c.last_name, '')) LIKE sp.words[1] || '%' THEN 2
        WHEN lower(COALESCE(c.company, '')) LIKE sp.words[1] || '%' THEN 1
        ELSE 0
      END AS relevance
    FROM public.customers c
    CROSS JOIN search_params sp
    LEFT JOIN LATERAL (
      SELECT
        count(*) AS jcount,
        bool_or(j.job_type = 'install') AS has_install,
        max(j.scheduled_date) AS last_job_date
      FROM public.jobs j
      WHERE j.customer_id = c.id
    ) jc ON true
    LEFT JOIN LATERAL (
      SELECT sa2.id, sa2.status, sa2.plan_name, sa2.end_date, sa2.plan_source
      FROM public.service_agreements sa2
      WHERE sa2.customer_id = c.id
      ORDER BY sa2.end_date DESC
      LIMIT 1
    ) sa ON true
    LEFT JOIN LATERAL (
      SELECT ca.city
      FROM public.customer_addresses ca
      WHERE ca.customer_id = c.id AND ca.city IS NOT NULL AND ca.city != ''
      ORDER BY ca.is_primary DESC, ca.created_at DESC
      LIMIT 1
    ) ca_city ON true
    WHERE
      (sp.raw_search IS NULL OR
       (length(sp.digits_only) >= 4 AND (
         right(regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g'), 10) LIKE '%' || sp.digits_only || '%'
         OR right(regexp_replace(COALESCE(c.mobile_phone, ''), '\D', '', 'g'), 10) LIKE '%' || sp.digits_only || '%'
       ))
       OR
       (sp.raw_search IS NOT NULL AND (
         (array_length(sp.words, 1) = 1 AND (
           lower(COALESCE(c.first_name, '')) LIKE sp.words[1] || '%'
           OR lower(COALESCE(c.last_name, '')) LIKE sp.words[1] || '%'
           OR lower(COALESCE(c.company, '')) LIKE sp.words[1] || '%'
           OR c.email ILIKE '%' || sp.raw_search || '%'
           OR c.address ILIKE '%' || sp.raw_search || '%'
           OR COALESCE(c.city, ca_city.city) ILIKE '%' || sp.raw_search || '%'
         ))
         OR
         (array_length(sp.words, 1) >= 2 AND (
           (lower(COALESCE(c.first_name, '')) LIKE sp.words[1] || '%'
            AND lower(COALESCE(c.last_name, '')) LIKE sp.words[2] || '%')
           OR
           (lower(COALESCE(c.last_name, '')) LIKE sp.words[1] || '%'
            AND lower(COALESCE(c.first_name, '')) LIKE sp.words[2] || '%')
           OR
           (lower(COALESCE(c.company, '')) LIKE '%' || sp.words[1] || '%'
            AND lower(COALESCE(c.company, '')) LIKE '%' || sp.words[2] || '%')
           OR
           (c.address ILIKE '%' || sp.raw_search || '%'
            OR COALESCE(c.city, ca_city.city) ILIKE '%' || sp.raw_search || '%')
         ))
       ))
      )
      AND (p_letter IS NULL OR p_letter = '' OR
        upper(left(COALESCE(c.last_name, c.company, c.first_name, ''), 1)) = upper(p_letter))
  ),
  counted AS (
    SELECT count(*) AS cnt FROM enriched
  )
  SELECT
    e.id, e.first_name, e.last_name, e.company, e.email, e.phone, e.mobile_phone,
    e.address, e.resolved_city AS city, e.state, e.zip, e.notes, e.tags, e.hcp_customer_id,
    e.created_at, e.updated_at,
    e.job_count, e.has_install, e.last_job_date,
    e.agreement_status, e.agreement_plan_name, e.agreement_end_date,
    e.agreement_plan_source,
    counted.cnt AS total_count
  FROM enriched e, counted
  ORDER BY
    e.relevance DESC,
    CASE WHEN p_sort_by = 'recent' THEN e.last_job_date END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'az' THEN lower(COALESCE(e.last_name, e.company, e.first_name, '')) END ASC,
    CASE WHEN p_sort_by = 'az' THEN lower(COALESCE(e.first_name, '')) END ASC,
    CASE WHEN p_sort_by = 'recent' THEN lower(COALESCE(e.last_name, e.company, '')) END ASC
  OFFSET p_page_num * p_page_size
  LIMIT p_page_size
$$;