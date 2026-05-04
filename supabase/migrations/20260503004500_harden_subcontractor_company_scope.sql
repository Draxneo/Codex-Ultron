-- Subcontractor links are office/admin tools. Keep management away from basic
-- tech accounts and brand public links from the job's company first.

DROP POLICY IF EXISTS "Staff can manage subcontractor links" ON public.subcontractor_job_links;

CREATE POLICY "Office staff can manage subcontractor links"
  ON public.subcontractor_job_links
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  );

CREATE OR REPLACE FUNCTION public.create_subcontractor_job_link(
  p_job_id uuid,
  p_subcontractor_name text DEFAULT NULL,
  p_subcontractor_phone text DEFAULT NULL,
  p_scope text DEFAULT NULL,
  p_equipment_summary text DEFAULT NULL,
  p_required_photo_slots text[] DEFAULT NULL,
  p_expires_days integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.subcontractor_job_links;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'office'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  ) THEN
    RAISE EXCEPTION 'Subcontractor links require office permission';
  END IF;

  INSERT INTO public.subcontractor_job_links (
    job_id,
    subcontractor_name,
    subcontractor_phone,
    scope,
    equipment_summary,
    required_photo_slots,
    expires_at,
    created_by
  )
  VALUES (
    p_job_id,
    NULLIF(trim(COALESCE(p_subcontractor_name, '')), ''),
    NULLIF(trim(COALESCE(p_subcontractor_phone, '')), ''),
    NULLIF(trim(COALESCE(p_scope, '')), ''),
    NULLIF(trim(COALESCE(p_equipment_summary, '')), ''),
    COALESCE(p_required_photo_slots, ARRAY['before', 'after']::text[]),
    now() + make_interval(days => greatest(COALESCE(p_expires_days, 14), 1)),
    auth.uid()
  )
  RETURNING * INTO v_link;

  RETURN jsonb_build_object(
    'id', v_link.id,
    'token', v_link.token,
    'path', '/subcontractor/' || v_link.token,
    'expires_at', v_link.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_subcontractor_job(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link record;
  v_photos jsonb;
  v_inspection_photos jsonb;
  v_company jsonb;
BEGIN
  SELECT
    l.*,
    j.job_number,
    j.hcp_job_number,
    j.customer_name,
    j.customer_phone,
    j.address,
    j.scheduled_date,
    j.arrival_start,
    j.arrival_end,
    j.description,
    j.job_type,
    j.brand,
    j.tonnage,
    j.system_type,
    j.orientation,
    COALESCE(j.business_unit_id, c.primary_business_unit_id) AS public_business_unit_id
  INTO v_link
  FROM public.subcontractor_job_links l
  JOIN public.jobs j ON j.id = l.job_id
  LEFT JOIN public.customers c ON c.id = j.customer_id
  WHERE l.token = p_token
    AND l.revoked_at IS NULL
    AND l.expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.subcontractor_job_links
  SET last_viewed_at = now()
  WHERE id = v_link.id;

  SELECT public.get_public_business_unit_settings(v_link.public_business_unit_id)
  INTO v_company;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ja.id,
    'file_name', ja.file_name,
    'file_path', ja.file_path,
    'file_type', ja.file_type,
    'category', ja.category,
    'created_at', ja.created_at
  ) ORDER BY ja.created_at DESC), '[]'::jsonb)
  INTO v_photos
  FROM public.job_attachments ja
  WHERE ja.job_id = v_link.job_id
    AND ja.category LIKE 'subcontractor_%';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', source_rows.id,
    'file_name', source_rows.file_name,
    'file_path', source_rows.file_path,
    'file_type', source_rows.file_type,
    'category', source_rows.category,
    'created_at', source_rows.created_at,
    'bucket', source_rows.bucket,
    'source', source_rows.source
  ) ORDER BY source_rows.created_at DESC), '[]'::jsonb)
  INTO v_inspection_photos
  FROM (
    SELECT
      ja.id,
      ja.file_name,
      ja.file_path,
      COALESCE(ja.file_type, 'image/jpeg') AS file_type,
      ja.category,
      ja.created_at,
      'job-photos'::text AS bucket,
      'Job photo'::text AS source
    FROM public.job_attachments ja
    WHERE ja.job_id = v_link.job_id
      AND COALESCE(ja.hidden_from_tech_share, false) = false
      AND COALESCE(ja.category, '') NOT LIKE 'subcontractor_%'

    UNION ALL

    SELECT
      tfp.id,
      COALESCE(NULLIF(regexp_replace(tfp.file_path, '^.*/', ''), ''), 'Tech inspection photo') AS file_name,
      tfp.file_path,
      'image/jpeg'::text AS file_type,
      tfp.photo_type AS category,
      tfp.created_at,
      'tech-form-photos'::text AS bucket,
      'Tech inspection'::text AS source
    FROM public.tech_form_photos tfp
    JOIN public.tech_forms tf ON tf.id = tfp.tech_form_id
    WHERE tf.job_id = v_link.job_id
  ) source_rows;

  RETURN jsonb_build_object(
    'token', v_link.token,
    'job_id', v_link.job_id,
    'job_number', COALESCE(v_link.job_number, v_link.hcp_job_number),
    'customer_name', v_link.customer_name,
    'customer_phone', v_link.customer_phone,
    'address', v_link.address,
    'scheduled_date', v_link.scheduled_date,
    'arrival_start', v_link.arrival_start,
    'arrival_end', v_link.arrival_end,
    'job_type', v_link.job_type,
    'brand', v_link.brand,
    'tonnage', v_link.tonnage,
    'system_type', v_link.system_type,
    'orientation', v_link.orientation,
    'scope', COALESCE(v_link.scope, v_link.description),
    'equipment_summary', v_link.equipment_summary,
    'subcontractor_name', v_link.subcontractor_name,
    'required_photo_slots', v_link.required_photo_slots,
    'completed_at', v_link.completed_at,
    'expires_at', v_link.expires_at,
    'company', COALESCE(v_company, '{}'::jsonb),
    'photos', v_photos,
    'inspection_photos', v_inspection_photos
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_subcontractor_job_link(uuid, text, text, text, text, text[], integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_subcontractor_job(text) TO anon, authenticated;
