
-- Function to find duplicate customers by phone matching
CREATE OR REPLACE FUNCTION public.find_duplicate_customers()
RETURNS TABLE(
  group_id int,
  customer_id uuid,
  first_name text,
  last_name text,
  phone text,
  mobile_phone text,
  email text,
  hcp_customer_id text,
  job_count bigint,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH normalized AS (
    SELECT
      c.id,
      c.first_name,
      c.last_name,
      c.phone,
      c.mobile_phone,
      c.email,
      c.hcp_customer_id,
      c.created_at,
      right(regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g'), 10) AS norm_phone,
      right(regexp_replace(COALESCE(c.mobile_phone, ''), '\D', '', 'g'), 10) AS norm_mobile
    FROM public.customers c
  ),
  phone_groups AS (
    SELECT
      a.id AS id_a,
      b.id AS id_b,
      COALESCE(NULLIF(a.norm_phone, ''), NULLIF(a.norm_mobile, '')) AS match_phone
    FROM normalized a
    JOIN normalized b ON a.id < b.id
    WHERE
      (length(a.norm_phone) = 10 AND a.norm_phone = b.norm_phone)
      OR (length(a.norm_phone) = 10 AND a.norm_phone = b.norm_mobile)
      OR (length(a.norm_mobile) = 10 AND a.norm_mobile = b.norm_phone)
      OR (length(a.norm_mobile) = 10 AND a.norm_mobile = b.norm_mobile)
  ),
  grouped AS (
    SELECT DISTINCT unnest(ARRAY[id_a, id_b]) AS cust_id,
      dense_rank() OVER (ORDER BY LEAST(id_a, id_b)) AS grp
    FROM phone_groups
  )
  SELECT
    grp::int AS group_id,
    c.id AS customer_id,
    c.first_name,
    c.last_name,
    c.phone,
    c.mobile_phone,
    c.email,
    c.hcp_customer_id,
    COALESCE(jc.cnt, 0) AS job_count,
    c.created_at
  FROM grouped g
  JOIN public.customers c ON c.id = g.cust_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt FROM public.jobs j WHERE j.customer_id = c.id
  ) jc ON true
  ORDER BY grp, c.created_at ASC;
$$;

-- Function to merge a duplicate customer into a keeper
CREATE OR REPLACE FUNCTION public.merge_customers(keep_id uuid, remove_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _keep record;
  _remove record;
  _moved jsonb := '{}'::jsonb;
  _cnt int;
BEGIN
  -- Validate both exist
  SELECT * INTO _keep FROM public.customers WHERE id = keep_id;
  SELECT * INTO _remove FROM public.customers WHERE id = remove_id;
  
  IF _keep IS NULL THEN
    RAISE EXCEPTION 'Keeper customer % not found', keep_id;
  END IF;
  IF _remove IS NULL THEN
    RAISE EXCEPTION 'Duplicate customer % not found', remove_id;
  END IF;
  IF keep_id = remove_id THEN
    RAISE EXCEPTION 'Cannot merge customer into itself';
  END IF;

  -- Re-link jobs
  UPDATE public.jobs SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT;
  _moved := _moved || jsonb_build_object('jobs', _cnt);

  -- Re-link estimates
  UPDATE public.estimates SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT;
  _moved := _moved || jsonb_build_object('estimates', _cnt);

  -- Re-link call_log
  UPDATE public.call_log SET related_customer_id = keep_id WHERE related_customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT;
  _moved := _moved || jsonb_build_object('call_log', _cnt);

  -- Re-link sms_log
  UPDATE public.sms_log SET related_customer_id = keep_id WHERE related_customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT;
  _moved := _moved || jsonb_build_object('sms_log', _cnt);

  -- Re-link service_agreements
  UPDATE public.service_agreements SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT;
  _moved := _moved || jsonb_build_object('service_agreements', _cnt);

  -- Re-link customer_equipment
  UPDATE public.customer_equipment SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT;
  _moved := _moved || jsonb_build_object('customer_equipment', _cnt);

  -- Re-link customer_certificates
  UPDATE public.customer_certificates SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT;
  _moved := _moved || jsonb_build_object('customer_certificates', _cnt);

  -- Re-link customer_addresses
  UPDATE public.customer_addresses SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT;
  _moved := _moved || jsonb_build_object('customer_addresses', _cnt);

  -- Re-link customer_discovery_answers
  UPDATE public.customer_discovery_answers SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT;
  _moved := _moved || jsonb_build_object('discovery_answers', _cnt);

  -- Re-link customer_portal_codes
  UPDATE public.customer_portal_codes SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT;
  _moved := _moved || jsonb_build_object('portal_codes', _cnt);

  -- Re-link customer_portal_sessions
  UPDATE public.customer_portal_sessions SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT;
  _moved := _moved || jsonb_build_object('portal_sessions', _cnt);

  -- Re-link customer_intake_tokens
  UPDATE public.customer_intake_tokens SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT;
  _moved := _moved || jsonb_build_object('intake_tokens', _cnt);

  -- Re-link agreement_presentations
  UPDATE public.agreement_presentations SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT;
  _moved := _moved || jsonb_build_object('agreement_presentations', _cnt);

  -- Re-link email_contacts
  UPDATE public.email_contacts SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT;
  _moved := _moved || jsonb_build_object('email_contacts', _cnt);

  -- Merge missing fields from dupe into keeper
  UPDATE public.customers SET
    email = COALESCE(_keep.email, _remove.email),
    phone = COALESCE(_keep.phone, _remove.phone),
    mobile_phone = COALESCE(_keep.mobile_phone, _remove.mobile_phone),
    address = COALESCE(_keep.address, _remove.address),
    city = COALESCE(_keep.city, _remove.city),
    state = COALESCE(_keep.state, _remove.state),
    zip = COALESCE(_keep.zip, _remove.zip),
    company = COALESCE(_keep.company, _remove.company),
    notes = CASE
      WHEN _keep.notes IS NOT NULL AND _remove.notes IS NOT NULL
      THEN _keep.notes || E'\n[Merged] ' || _remove.notes
      ELSE COALESCE(_keep.notes, _remove.notes)
    END,
    hcp_customer_id = COALESCE(_keep.hcp_customer_id, _remove.hcp_customer_id),
    tags = CASE
      WHEN _keep.tags IS NOT NULL AND _remove.tags IS NOT NULL
      THEN (SELECT array_agg(DISTINCT t) FROM unnest(_keep.tags || _remove.tags) t)
      ELSE COALESCE(_keep.tags, _remove.tags)
    END,
    updated_at = now()
  WHERE id = keep_id;

  -- Delete the duplicate
  DELETE FROM public.customers WHERE id = remove_id;

  RETURN jsonb_build_object(
    'merged', true,
    'keeper_id', keep_id,
    'removed_id', remove_id,
    'keeper_name', COALESCE(_keep.first_name, '') || ' ' || COALESCE(_keep.last_name, ''),
    'removed_name', COALESCE(_remove.first_name, '') || ' ' || COALESCE(_remove.last_name, ''),
    'records_moved', _moved
  );
END;
$$;
