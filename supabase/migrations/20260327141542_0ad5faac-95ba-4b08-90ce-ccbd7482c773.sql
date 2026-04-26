
CREATE OR REPLACE FUNCTION public.get_customers_paginated(
  p_search text DEFAULT '',
  p_sort_by text DEFAULT 'recent',
  p_page_num int DEFAULT 0,
  p_page_size int DEFAULT 50,
  p_letter text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  first_name text,
  last_name text,
  company text,
  email text,
  phone text,
  mobile_phone text,
  address text,
  city text,
  state text,
  zip text,
  notes text,
  tags text[],
  hcp_customer_id text,
  created_at timestamptz,
  updated_at timestamptz,
  -- enrichment
  job_count bigint,
  has_install boolean,
  last_job_date date,
  agreement_status text,
  agreement_plan_name text,
  agreement_end_date date,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH enriched AS (
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
      (p_search = '' OR p_search IS NULL OR
        c.first_name ILIKE '%' || p_search || '%' OR
        c.last_name ILIKE '%' || p_search || '%' OR
        c.company ILIKE '%' || p_search || '%' OR
        c.phone ILIKE '%' || p_search || '%' OR
        c.email ILIKE '%' || p_search || '%' OR
        c.address ILIKE '%' || p_search || '%')
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
$$;
