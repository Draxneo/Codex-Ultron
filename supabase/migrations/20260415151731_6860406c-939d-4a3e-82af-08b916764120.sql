
CREATE OR REPLACE FUNCTION public.merge_customers(keep_id uuid, remove_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _keep record;
  _remove record;
  _moved jsonb := '{}'::jsonb;
  _cnt int;
BEGIN
  SELECT * INTO _keep FROM public.customers WHERE id = keep_id;
  SELECT * INTO _remove FROM public.customers WHERE id = remove_id;
  
  IF _keep IS NULL THEN RAISE EXCEPTION 'Keeper customer % not found', keep_id; END IF;
  IF _remove IS NULL THEN RAISE EXCEPTION 'Duplicate customer % not found', remove_id; END IF;
  IF keep_id = remove_id THEN RAISE EXCEPTION 'Cannot merge customer into itself'; END IF;

  -- Re-link all FK tables
  UPDATE public.jobs SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _moved := _moved || jsonb_build_object('jobs', _cnt);

  UPDATE public.estimates SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _moved := _moved || jsonb_build_object('estimates', _cnt);

  UPDATE public.call_log SET related_customer_id = keep_id WHERE related_customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _moved := _moved || jsonb_build_object('call_log', _cnt);

  UPDATE public.service_agreements SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _moved := _moved || jsonb_build_object('service_agreements', _cnt);

  UPDATE public.customer_equipment SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _moved := _moved || jsonb_build_object('customer_equipment', _cnt);

  UPDATE public.customer_certificates SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _moved := _moved || jsonb_build_object('customer_certificates', _cnt);

  UPDATE public.customer_addresses SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _moved := _moved || jsonb_build_object('customer_addresses', _cnt);

  UPDATE public.customer_discovery_answers SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _moved := _moved || jsonb_build_object('discovery_answers', _cnt);

  UPDATE public.customer_portal_codes SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _moved := _moved || jsonb_build_object('portal_codes', _cnt);

  UPDATE public.customer_portal_sessions SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _moved := _moved || jsonb_build_object('portal_sessions', _cnt);

  UPDATE public.customer_intake_tokens SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _moved := _moved || jsonb_build_object('intake_tokens', _cnt);

  UPDATE public.agreement_presentations SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _moved := _moved || jsonb_build_object('agreement_presentations', _cnt);

  UPDATE public.email_contacts SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _moved := _moved || jsonb_build_object('email_contacts', _cnt);

  -- Previously missing tables causing FK errors:
  UPDATE public.emails SET linked_customer_id = keep_id WHERE linked_customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _moved := _moved || jsonb_build_object('emails', _cnt);

  UPDATE public.referral_codes SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _moved := _moved || jsonb_build_object('referral_codes', _cnt);

  UPDATE public.portal_requests SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _moved := _moved || jsonb_build_object('portal_requests', _cnt);

  UPDATE public.plan_perk_usage SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _moved := _moved || jsonb_build_object('plan_perk_usage', _cnt);

  UPDATE public.leads SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _moved := _moved || jsonb_build_object('leads', _cnt);

  UPDATE public.todos SET customer_id = keep_id WHERE customer_id = remove_id;
  GET DIAGNOSTICS _cnt = ROW_COUNT; _moved := _moved || jsonb_build_object('todos', _cnt);

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
    END
  WHERE id = keep_id;

  -- Delete the duplicate
  DELETE FROM public.customers WHERE id = remove_id;

  RETURN jsonb_build_object(
    'status', 'merged',
    'kept', keep_id,
    'removed', remove_id,
    'moved', _moved
  );
END;
$$;
