
CREATE OR REPLACE FUNCTION public.get_customers_paginated(p_search text DEFAULT ''::text, p_sort_by text DEFAULT 'recent'::text, p_page_num integer DEFAULT 0, p_page_size integer DEFAULT 50, p_letter text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, first_name text, last_name text, company text, email text, phone text, mobile_phone text, address text, city text, state text, zip text, notes text, tags text[], hcp_customer_id text, created_at timestamp with time zone, updated_at timestamp with time zone, job_count bigint, has_install boolean, last_job_date date, agreement_status text, agreement_plan_name text, agreement_end_date date, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      sa.end_date AS agreement_end_date
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
      SELECT sa2.id, sa2.status, sa2.plan_name, sa2.end_date
      FROM public.service_agreements sa2
      WHERE sa2.customer_id = c.id
      ORDER BY sa2.end_date DESC
      LIMIT 1
    ) sa ON true
    WHERE
      -- No search: return all
      (sp.raw_search IS NULL OR
       -- Phone search: if 4+ digits, match against normalized phone columns
       (length(sp.digits_only) >= 4 AND (
         right(regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g'), 10) LIKE '%' || sp.digits_only || '%'
         OR right(regexp_replace(COALESCE(c.mobile_phone, ''), '\D', '', 'g'), 10) LIKE '%' || sp.digits_only || '%'
       ))
       OR
       -- Multi-word search: every word must match at least one field
       (sp.raw_search IS NOT NULL AND (
         -- Single word: classic ILIKE across all fields
         (array_length(sp.words, 1) = 1 AND (
           c.first_name ILIKE '%' || sp.raw_search || '%'
           OR c.last_name ILIKE '%' || sp.raw_search || '%'
           OR c.company ILIKE '%' || sp.raw_search || '%'
           OR c.email ILIKE '%' || sp.raw_search || '%'
           OR c.address ILIKE '%' || sp.raw_search || '%'
           OR c.city ILIKE '%' || sp.raw_search || '%'
         ))
         OR
         -- Multi-word: each word must hit at least one column
         (array_length(sp.words, 1) > 1 AND (
           SELECT bool_and(
             c.first_name ILIKE '%' || w || '%'
             OR c.last_name ILIKE '%' || w || '%'
             OR c.company ILIKE '%' || w || '%'
             OR c.email ILIKE '%' || w || '%'
             OR c.address ILIKE '%' || w || '%'
             OR c.city ILIKE '%' || w || '%'
           )
           FROM unnest(sp.words) AS w
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
    e.address, e.city, e.state, e.zip, e.notes, e.tags, e.hcp_customer_id,
    e.created_at, e.updated_at,
    e.job_count, e.has_install, e.last_job_date,
    e.agreement_status, e.agreement_plan_name, e.agreement_end_date,
    counted.cnt AS total_count
  FROM enriched e, counted
  ORDER BY
    CASE WHEN p_sort_by = 'recent' THEN e.last_job_date END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'az' THEN lower(COALESCE(e.last_name, e.company, e.first_name, '')) END ASC,
    CASE WHEN p_sort_by = 'az' THEN lower(COALESCE(e.first_name, '')) END ASC,
    CASE WHEN p_sort_by = 'recent' THEN lower(COALESCE(e.last_name, e.company, '')) END ASC
  OFFSET p_page_num * p_page_size
  LIMIT p_page_size
$function$
