-- Keep public subcontractor links locked to the company that owns the job,
-- and narrow anonymous job-photo writes to subcontractor token folders only.

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
    c.primary_business_unit_id
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

  SELECT public.get_public_business_unit_settings(v_link.primary_business_unit_id)
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

GRANT EXECUTE ON FUNCTION public.get_public_subcontractor_job(text) TO anon, authenticated;

DROP POLICY IF EXISTS "Allow insert job-photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow delete job-photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated or token-scoped public job photo uploads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete job photos" ON storage.objects;

CREATE POLICY "Authenticated or token-scoped public job photo uploads"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'job-photos'
    AND (
      auth.role() = 'authenticated'
      OR name LIKE 'subcontractor/%'
    )
  );

CREATE POLICY "Authenticated can delete job photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'job-photos');
