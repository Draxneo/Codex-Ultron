-- Estimate / quote approval custody chain.
-- Jobs are authorized work. Estimates are proposed work. This table records
-- exactly how proposed work became authorized: customer link, verbal approval,
-- selected option, source job, and who recorded it.

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS approval_status text,
  ADD COLUMN IF NOT EXISTS approval_method text,
  ADD COLUMN IF NOT EXISTS approval_recorded_by uuid,
  ADD COLUMN IF NOT EXISTS approval_recorded_by_name text,
  ADD COLUMN IF NOT EXISTS approval_note text,
  ADD COLUMN IF NOT EXISTS approved_scope_snapshot jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS approved_option_key text,
  ADD COLUMN IF NOT EXISTS authorized_work_label text;

CREATE TABLE IF NOT EXISTS public.estimate_approval_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  source_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  authorized_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  presentation_id uuid REFERENCES public.estimate_presentations(id) ON DELETE SET NULL,
  job_cart_id uuid REFERENCES public.job_carts(id) ON DELETE SET NULL,
  approval_method text NOT NULL CHECK (approval_method IN ('digital', 'verbal', 'office', 'import')),
  approval_status text NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('approved', 'declined', 'changes_requested', 'revoked')),
  selected_option_key text,
  payment_method text,
  customer_name text,
  customer_phone text,
  actor_type text NOT NULL DEFAULT 'office' CHECK (actor_type IN ('customer', 'technician', 'office', 'system')),
  recorded_by uuid,
  recorded_by_name text,
  note text,
  approved_scope_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.estimate_approval_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage estimate approval events" ON public.estimate_approval_events;
CREATE POLICY "Authenticated users can manage estimate approval events"
  ON public.estimate_approval_events
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_estimate_approval_events_estimate_created
  ON public.estimate_approval_events (estimate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_estimate_approval_events_source_job
  ON public.estimate_approval_events (source_job_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.estimate_authorized_work_label(p_estimate_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _estimate public.estimates%ROWTYPE;
  _job_number text;
  _seq integer;
BEGIN
  SELECT *
  INTO _estimate
  FROM public.estimates
  WHERE id = p_estimate_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF _estimate.source_job_id IS NULL THEN
    RETURN COALESCE(_estimate.estimate_number, p_estimate_id::text);
  END IF;

  SELECT COALESCE(job_number, hcp_job_number, id::text)
  INTO _job_number
  FROM public.jobs
  WHERE id = _estimate.source_job_id;

  SELECT COUNT(*) + 1
  INTO _seq
  FROM public.estimates e
  WHERE e.source_job_id = _estimate.source_job_id
    AND e.created_at < COALESCE(_estimate.created_at, now());

  RETURN COALESCE(_job_number, _estimate.source_job_id::text) || '-' || GREATEST(_seq + 1, 2)::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_estimate_approval_event(
  p_estimate_id uuid,
  p_approval_method text,
  p_approval_status text DEFAULT 'approved',
  p_selected_option_key text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_recorded_by_name text DEFAULT NULL,
  p_actor_type text DEFAULT 'office',
  p_presentation_id uuid DEFAULT NULL,
  p_job_cart_id uuid DEFAULT NULL,
  p_scope_snapshot jsonb DEFAULT '{}'::jsonb,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _estimate public.estimates%ROWTYPE;
  _event_id uuid;
  _user_id uuid := auth.uid();
  _label text;
BEGIN
  IF p_approval_method NOT IN ('digital', 'verbal', 'office', 'import') THEN
    RAISE EXCEPTION 'Invalid approval method';
  END IF;

  IF p_approval_status NOT IN ('approved', 'declined', 'changes_requested', 'revoked') THEN
    RAISE EXCEPTION 'Invalid approval status';
  END IF;

  SELECT *
  INTO _estimate
  FROM public.estimates
  WHERE id = p_estimate_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estimate not found';
  END IF;

  _label := COALESCE(_estimate.authorized_work_label, public.estimate_authorized_work_label(p_estimate_id));

  INSERT INTO public.estimate_approval_events (
    estimate_id,
    source_job_id,
    authorized_job_id,
    presentation_id,
    job_cart_id,
    approval_method,
    approval_status,
    selected_option_key,
    payment_method,
    customer_name,
    customer_phone,
    actor_type,
    recorded_by,
    recorded_by_name,
    note,
    approved_scope_snapshot,
    metadata,
    approved_at
  )
  VALUES (
    p_estimate_id,
    _estimate.source_job_id,
    COALESCE(_estimate.converted_job_id, _estimate.source_job_id),
    p_presentation_id,
    p_job_cart_id,
    p_approval_method,
    p_approval_status,
    NULLIF(p_selected_option_key, ''),
    NULLIF(p_payment_method, ''),
    _estimate.customer_name,
    _estimate.customer_phone,
    COALESCE(NULLIF(p_actor_type, ''), 'office'),
    _user_id,
    NULLIF(p_recorded_by_name, ''),
    NULLIF(p_note, ''),
    COALESCE(p_scope_snapshot, '{}'::jsonb),
    COALESCE(p_metadata, '{}'::jsonb),
    now()
  )
  RETURNING id INTO _event_id;

  UPDATE public.estimates
  SET
    approval_status = p_approval_status,
    approval_method = p_approval_method,
    approval_recorded_by = _user_id,
    approval_recorded_by_name = NULLIF(p_recorded_by_name, ''),
    approval_note = NULLIF(p_note, ''),
    approved_scope_snapshot = COALESCE(p_scope_snapshot, approved_scope_snapshot, '{}'::jsonb),
    approved_option_key = COALESCE(NULLIF(p_selected_option_key, ''), approved_option_key),
    authorized_work_label = _label,
    customer_approved_at = CASE WHEN p_approval_status = 'approved' THEN COALESCE(customer_approved_at, now()) ELSE customer_approved_at END,
    status = CASE
      WHEN p_approval_status = 'approved' THEN 'approved'
      WHEN p_approval_status = 'declined' THEN 'declined'
      ELSE COALESCE(status, work_status)
    END,
    work_status = CASE
      WHEN p_approval_status = 'approved' THEN 'approved'
      WHEN p_approval_status = 'declined' THEN 'declined'
      ELSE COALESCE(work_status, status)
    END
  WHERE id = p_estimate_id;

  RETURN _event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.estimate_authorized_work_label(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_estimate_approval_event(uuid, text, text, text, text, text, text, text, uuid, uuid, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_public_estimate_response(
  p_token text,
  p_action text,
  p_message text DEFAULT NULL,
  p_payment_preference text DEFAULT NULL,
  p_selected_tier text DEFAULT NULL,
  p_selected_addons jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _presentation public.estimate_presentations%ROWTYPE;
  _estimate public.estimates%ROWTYPE;
  _included text[];
  _response_id uuid;
  _approval_event_id uuid;
  _inserted_count integer := 0;
  _event_type text;
BEGIN
  IF p_action NOT IN ('approved', 'changes_requested', 'declined') THEN
    RAISE EXCEPTION 'Invalid response action';
  END IF;

  SELECT *
  INTO _presentation
  FROM public.estimate_presentations
  WHERE token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Presentation not found';
  END IF;

  SELECT *
  INTO _estimate
  FROM public.estimates
  WHERE id = _presentation.estimate_id
  LIMIT 1;

  INSERT INTO public.estimate_responses (
    estimate_id,
    presentation_id,
    action,
    message,
    payment_preference,
    selected_tier,
    selected_addons
  )
  VALUES (
    _presentation.estimate_id,
    _presentation.id,
    p_action,
    NULLIF(p_message, ''),
    NULLIF(p_payment_preference, ''),
    NULLIF(p_selected_tier, ''),
    p_selected_addons
  )
  RETURNING id INTO _response_id;

  _event_type := CASE p_action
    WHEN 'approved' THEN 'customer_approved'
    WHEN 'declined' THEN 'customer_declined'
    ELSE 'customer_contact_requested'
  END;

  INSERT INTO public.quote_cart_events (
    event_type,
    actor_type,
    job_id,
    estimate_id,
    presentation_id,
    metadata
  )
  VALUES (
    _event_type,
    'customer',
    _estimate.source_job_id,
    _presentation.estimate_id,
    _presentation.id,
    jsonb_build_object(
      'response_id', _response_id,
      'action', p_action,
      'selected_tier', NULLIF(p_selected_tier, ''),
      'payment_preference', NULLIF(p_payment_preference, ''),
      'has_message', NULLIF(p_message, '') IS NOT NULL
    )
  );

  IF p_action = 'approved' THEN
    _approval_event_id := public.record_estimate_approval_event(
      _presentation.estimate_id,
      'digital',
      'approved',
      NULLIF(p_selected_tier, ''),
      NULLIF(p_payment_preference, ''),
      NULLIF(p_message, ''),
      NULL,
      'customer',
      _presentation.id,
      NULL,
      jsonb_build_object('selected_addons', p_selected_addons),
      jsonb_build_object('response_id', _response_id, 'source', 'public_estimate_response')
    );

    IF _estimate.source_job_id IS NOT NULL
      AND _estimate.estimate_type = 'service_repair'
      AND NULLIF(p_selected_tier, '') IS NOT NULL THEN

      _included := CASE p_selected_tier
        WHEN 'necessary' THEN ARRAY['necessary']
        WHEN 'recommended' THEN ARRAY['necessary', 'recommended']
        WHEN 'deluxe' THEN ARRAY['necessary', 'recommended', 'deluxe']
        ELSE ARRAY[p_selected_tier]
      END;

      UPDATE public.service_repair_items
      SET approved = true,
          updated_at = now()
      WHERE job_id = _estimate.source_job_id
        AND severity = ANY(_included);

      INSERT INTO public.job_line_items (
        job_id,
        name,
        description,
        quantity,
        unit_price,
        total_price,
        kind,
        template_id,
        waived
      )
      SELECT
        r.job_id,
        r.description,
        r.description,
        1,
        COALESCE(r.final_price, 0),
        COALESCE(r.final_price, 0),
        'repair',
        NULL,
        false
      FROM public.service_repair_items r
      WHERE r.job_id = _estimate.source_job_id
        AND r.severity = ANY(_included)
        AND NOT EXISTS (
          SELECT 1
          FROM public.job_line_items li
          WHERE li.job_id = r.job_id
            AND li.kind = 'repair'
            AND li.description = r.description
            AND li.total_price = COALESCE(r.final_price, 0)
        );

      GET DIAGNOSTICS _inserted_count = ROW_COUNT;

      UPDATE public.job_line_items
      SET waived = true,
          waived_reason = COALESCE(waived_reason, 'Waived with repair')
      WHERE job_id = _estimate.source_job_id
        AND COALESCE(waived, false) = false
        AND lower(COALESCE(description, name, '')) LIKE '%service call%';
    END IF;
  ELSIF p_action = 'declined' THEN
    _approval_event_id := public.record_estimate_approval_event(
      _presentation.estimate_id,
      'digital',
      'declined',
      NULLIF(p_selected_tier, ''),
      NULLIF(p_payment_preference, ''),
      NULLIF(p_message, ''),
      NULL,
      'customer',
      _presentation.id,
      NULL,
      '{}'::jsonb,
      jsonb_build_object('response_id', _response_id, 'source', 'public_estimate_response')
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'response_id', _response_id,
    'approval_event_id', _approval_event_id,
    'line_items_created', _inserted_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_public_estimate_response(text, text, text, text, text, jsonb) TO anon, authenticated;

CREATE OR REPLACE VIEW public.v_quote_pipeline
WITH (security_invoker = true)
AS
SELECT
  e.id AS estimate_id,
  e.customer_id,
  e.source_job_id,
  e.converted_job_id,
  e.estimate_number,
  e.customer_name,
  e.customer_phone,
  e.customer_email,
  e.address,
  e.estimate_type,
  COALESCE(e.status, e.work_status, e.hcp_status) AS status,
  e.total_amount,
  e.scheduled_date,
  e.arrival_start,
  e.arrival_end,
  e.assigned_to,
  e.presentation_sent_at,
  e.customer_approved_at,
  e.brochure_sent,
  e.created_at,
  comm.latest_communication_at,
  comm.latest_communication_type,
  comm.latest_communication_summary,
  CASE
    WHEN e.customer_approved_at IS NOT NULL OR e.approval_status = 'approved' THEN 'Approved'
    WHEN e.presentation_sent_at IS NOT NULL THEN 'Waiting on customer'
    WHEN e.scheduled_date IS NOT NULL THEN 'Estimate visit scheduled'
    ELSE 'Needs next step'
  END AS pipeline_stage,
  e.approval_status,
  e.approval_method,
  e.approved_option_key,
  e.authorized_work_label,
  approval.latest_approval_at,
  approval.latest_approval_method,
  approval.latest_approval_note
FROM public.estimates e
LEFT JOIN LATERAL (
  SELECT
    a.approved_at AS latest_approval_at,
    a.approval_method AS latest_approval_method,
    a.note AS latest_approval_note
  FROM public.estimate_approval_events a
  WHERE a.estimate_id = e.id
  ORDER BY a.approved_at DESC NULLS LAST, a.created_at DESC
  LIMIT 1
) approval ON true
LEFT JOIN LATERAL (
  SELECT
    x.event_at AS latest_communication_at,
    x.source_type AS latest_communication_type,
    x.summary_text AS latest_communication_summary
  FROM (
    SELECT
      s.created_at AS event_at,
      'sms'::text AS source_type,
      NULLIF(s.body, '') AS summary_text
    FROM public.sms_log s
    WHERE s.related_estimate_id = e.id
    UNION ALL
    SELECT
      COALESCE(c.started_at, c.created_at) AS event_at,
      'call'::text AS source_type,
      NULLIF(COALESCE(c.ai_summary, c.summary, c.transcription), '') AS summary_text
    FROM public.call_log c
    WHERE c.related_estimate_id = e.id
  ) x
  ORDER BY x.event_at DESC NULLS LAST
  LIMIT 1
) comm ON true;

GRANT SELECT ON public.v_quote_pipeline TO authenticated;
