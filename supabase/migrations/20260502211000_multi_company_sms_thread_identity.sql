-- Multi-company SMS/call thread identity.
-- Keep customer phone identity, but scope it to the company line so the same
-- customer can have separate Carnes and FIX intake threads.

CREATE OR REPLACE FUNCTION public.communication_thread_key(
  _channel text,
  _phone_last10 text,
  _company_phone_last10 text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(coalesce(_channel, 'unknown'))
    || ':'
    || coalesce(nullif(_company_phone_last10, ''), 'legacy')
    || ':'
    || coalesce(nullif(_phone_last10, ''), 'unknown')
$$;

ALTER TABLE public.intake_thread_status
  ADD COLUMN IF NOT EXISTS business_unit_id uuid REFERENCES public.business_units(id),
  ADD COLUMN IF NOT EXISTS company_phone_number text,
  ADD COLUMN IF NOT EXISTS company_phone_last10 text,
  ADD COLUMN IF NOT EXISTS thread_key text;

ALTER TABLE public.sms_thread_settings
  ADD COLUMN IF NOT EXISTS business_unit_id uuid REFERENCES public.business_units(id),
  ADD COLUMN IF NOT EXISTS company_phone_number text,
  ADD COLUMN IF NOT EXISTS company_phone_last10 text,
  ADD COLUMN IF NOT EXISTS thread_key text;

UPDATE public.intake_thread_status t
SET
  business_unit_id = COALESCE(t.business_unit_id, b.id),
  company_phone_number = COALESCE(t.company_phone_number, b.primary_phone_number),
  company_phone_last10 = COALESCE(t.company_phone_last10, public.phone_last10(COALESCE(t.company_phone_number, b.primary_phone_number))),
  thread_key = public.communication_thread_key(
    t.channel,
    t.phone_last10,
    COALESCE(t.company_phone_last10, public.phone_last10(COALESCE(t.company_phone_number, b.primary_phone_number)))
  )
FROM public.business_units b
WHERE b.is_default = true
  AND (
    t.business_unit_id IS NULL
    OR t.company_phone_number IS NULL
    OR t.company_phone_last10 IS NULL
    OR t.thread_key IS NULL
  );

UPDATE public.sms_thread_settings s
SET
  business_unit_id = COALESCE(s.business_unit_id, b.id),
  company_phone_number = COALESCE(s.company_phone_number, b.primary_phone_number),
  company_phone_last10 = COALESCE(s.company_phone_last10, public.phone_last10(COALESCE(s.company_phone_number, b.primary_phone_number))),
  thread_key = public.communication_thread_key(
    'sms',
    s.phone_last10,
    COALESCE(s.company_phone_last10, public.phone_last10(COALESCE(s.company_phone_number, b.primary_phone_number)))
  )
FROM public.business_units b
WHERE b.is_default = true
  AND (
    s.business_unit_id IS NULL
    OR s.company_phone_number IS NULL
    OR s.company_phone_last10 IS NULL
    OR s.thread_key IS NULL
  );

CREATE OR REPLACE FUNCTION public.set_intake_thread_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_unit public.business_units%ROWTYPE;
BEGIN
  NEW.channel := lower(coalesce(NEW.channel, ''));
  IF NEW.channel = 'voicemail' THEN
    NEW.channel := 'call';
  END IF;

  NEW.phone_last10 := public.phone_last10(NEW.phone_last10);
  NEW.company_phone_last10 := public.phone_last10(NEW.company_phone_last10);

  IF NEW.business_unit_id IS NOT NULL THEN
    SELECT * INTO v_unit
    FROM public.business_units
    WHERE id = NEW.business_unit_id;
  END IF;

  IF v_unit.id IS NULL AND NULLIF(NEW.company_phone_last10, '') IS NOT NULL THEN
    SELECT * INTO v_unit
    FROM public.business_units
    WHERE public.phone_last10(primary_phone_number) = NEW.company_phone_last10
      AND is_active = true
    LIMIT 1;
  END IF;

  IF v_unit.id IS NULL THEN
    SELECT * INTO v_unit
    FROM public.business_units
    WHERE is_default = true
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  NEW.business_unit_id := COALESCE(NEW.business_unit_id, v_unit.id);
  NEW.company_phone_number := COALESCE(NULLIF(NEW.company_phone_number, ''), v_unit.primary_phone_number);
  NEW.company_phone_last10 := public.phone_last10(COALESCE(NEW.company_phone_number, v_unit.primary_phone_number));
  NEW.thread_key := public.communication_thread_key(NEW.channel, NEW.phone_last10, NEW.company_phone_last10);
  NEW.updated_at := COALESCE(NEW.updated_at, now());

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_sms_thread_settings_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_unit public.business_units%ROWTYPE;
BEGIN
  NEW.phone_last10 := public.phone_last10(NEW.phone_last10);
  NEW.company_phone_last10 := public.phone_last10(NEW.company_phone_last10);

  IF NEW.business_unit_id IS NOT NULL THEN
    SELECT * INTO v_unit
    FROM public.business_units
    WHERE id = NEW.business_unit_id;
  END IF;

  IF v_unit.id IS NULL AND NULLIF(NEW.company_phone_last10, '') IS NOT NULL THEN
    SELECT * INTO v_unit
    FROM public.business_units
    WHERE public.phone_last10(primary_phone_number) = NEW.company_phone_last10
      AND is_active = true
    LIMIT 1;
  END IF;

  IF v_unit.id IS NULL THEN
    SELECT * INTO v_unit
    FROM public.business_units
    WHERE is_default = true
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  NEW.business_unit_id := COALESCE(NEW.business_unit_id, v_unit.id);
  NEW.company_phone_number := COALESCE(NULLIF(NEW.company_phone_number, ''), v_unit.primary_phone_number);
  NEW.company_phone_last10 := public.phone_last10(COALESCE(NEW.company_phone_number, v_unit.primary_phone_number));
  NEW.thread_key := public.communication_thread_key('sms', NEW.phone_last10, NEW.company_phone_last10);
  NEW.updated_at := COALESCE(NEW.updated_at, now());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_intake_thread_identity_before_write ON public.intake_thread_status;
CREATE TRIGGER set_intake_thread_identity_before_write
BEFORE INSERT OR UPDATE OF channel, phone_last10, business_unit_id, company_phone_number, company_phone_last10
ON public.intake_thread_status
FOR EACH ROW
EXECUTE FUNCTION public.set_intake_thread_identity();

DROP TRIGGER IF EXISTS set_sms_thread_settings_identity_before_write ON public.sms_thread_settings;
CREATE TRIGGER set_sms_thread_settings_identity_before_write
BEFORE INSERT OR UPDATE OF phone_last10, business_unit_id, company_phone_number, company_phone_last10
ON public.sms_thread_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_sms_thread_settings_identity();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'intake_thread_status_pkey'
      AND conrelid = 'public.intake_thread_status'::regclass
  ) THEN
    ALTER TABLE public.intake_thread_status DROP CONSTRAINT intake_thread_status_pkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'intake_thread_status_thread_key_pkey'
      AND conrelid = 'public.intake_thread_status'::regclass
  ) THEN
    ALTER TABLE public.intake_thread_status
      ADD CONSTRAINT intake_thread_status_thread_key_pkey PRIMARY KEY (thread_key);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sms_thread_settings_pkey'
      AND conrelid = 'public.sms_thread_settings'::regclass
  ) THEN
    ALTER TABLE public.sms_thread_settings DROP CONSTRAINT sms_thread_settings_pkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sms_thread_settings_user_thread_key_pkey'
      AND conrelid = 'public.sms_thread_settings'::regclass
  ) THEN
    ALTER TABLE public.sms_thread_settings
      ADD CONSTRAINT sms_thread_settings_user_thread_key_pkey PRIMARY KEY (user_id, thread_key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS intake_thread_status_business_unit_idx
  ON public.intake_thread_status (business_unit_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS intake_thread_status_company_phone_idx
  ON public.intake_thread_status (channel, company_phone_last10, phone_last10);

CREATE INDEX IF NOT EXISTS sms_thread_settings_business_unit_idx
  ON public.sms_thread_settings (user_id, business_unit_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS sms_thread_settings_company_phone_idx
  ON public.sms_thread_settings (user_id, company_phone_last10, phone_last10);

CREATE OR REPLACE VIEW public.v_unified_communications
WITH (security_invoker = true)
AS
WITH default_business_unit AS (
  SELECT *
  FROM public.business_units
  WHERE is_default = true
  ORDER BY created_at ASC
  LIMIT 1
),
sms_events AS (
  SELECT
    ('sms:' || s.id::text) AS communication_id,
    s.id AS source_id,
    'sms_log'::text AS source_table,
    'sms'::text AS source_type,
    'sms'::text AS intake_channel,
    s.direction,
    s.created_at AS event_at,
    s.phone_number,
    public.phone_last10(s.phone_number) AS phone_last10,
    s.contact_name,
    s.contact_type,
    s.related_customer_id,
    s.related_job_id,
    s.related_estimate_id,
    s.body AS body,
    NULL::text AS transcription,
    NULL::text AS ai_summary,
    NULL::text AS recording_url,
    s.media_urls,
    s.twilio_sid,
    s.message_sid,
    s.delivery_status,
    s.status,
    s.error_code,
    s.error_message,
    s.is_read,
    s.source_function,
    s.template_key,
    jsonb_build_object(
      'to_number', s.to_number,
      'num_media', s.num_media,
      'num_segments', s.num_segments,
      'client_id', s.client_id
    ) AS metadata,
    COALESCE(s.business_unit_id, line_bu.id, default_bu.id) AS business_unit_id,
    COALESCE(unit_bu.primary_phone_number, line_bu.primary_phone_number, s.to_number, default_bu.primary_phone_number) AS company_phone_number,
    public.phone_last10(COALESCE(unit_bu.primary_phone_number, line_bu.primary_phone_number, s.to_number, default_bu.primary_phone_number)) AS company_phone_last10
  FROM public.sms_log s
  CROSS JOIN default_business_unit default_bu
  LEFT JOIN public.business_units unit_bu ON unit_bu.id = s.business_unit_id
  LEFT JOIN public.business_units line_bu
    ON public.phone_last10(line_bu.primary_phone_number) = public.phone_last10(s.to_number)
   AND line_bu.is_active = true
),
call_events AS (
  SELECT
    ('call:' || c.id::text) AS communication_id,
    c.id AS source_id,
    'call_log'::text AS source_table,
    'call'::text AS source_type,
    'call'::text AS intake_channel,
    c.direction,
    COALESCE(c.started_at, c.created_at) AS event_at,
    c.phone_number,
    public.phone_last10(c.phone_number) AS phone_last10,
    c.contact_name,
    c.contact_type,
    c.related_customer_id,
    c.related_job_id,
    c.related_estimate_id,
    c.summary AS body,
    c.transcription,
    COALESCE(c.ai_summary, c.summary) AS ai_summary,
    c.recording_url,
    NULL::text[] AS media_urls,
    c.twilio_sid,
    NULL::text AS message_sid,
    NULL::text AS delivery_status,
    c.status,
    NULL::text AS error_code,
    NULL::text AS error_message,
    c.is_read,
    NULL::text AS source_function,
    NULL::text AS template_key,
    jsonb_build_object(
      'ended_at', c.ended_at,
      'duration_seconds', c.duration_seconds,
      'recording_duration', c.recording_duration,
      'answered_by', c.answered_by,
      'device_answered', c.device_answered,
      'department_key', c.department_key,
      'route_type', c.route_type,
      'parent_call_sid', c.parent_call_sid,
      'transcription_status', c.transcription_status,
      'extracted_data', c.extracted_data,
      'call_extraction', c.call_extraction,
      'called_number', c.called_number
    ) AS metadata,
    COALESCE(c.business_unit_id, line_bu.id, default_bu.id) AS business_unit_id,
    COALESCE(unit_bu.primary_phone_number, line_bu.primary_phone_number, c.called_number, default_bu.primary_phone_number) AS company_phone_number,
    public.phone_last10(COALESCE(unit_bu.primary_phone_number, line_bu.primary_phone_number, c.called_number, default_bu.primary_phone_number)) AS company_phone_last10
  FROM public.call_log c
  CROSS JOIN default_business_unit default_bu
  LEFT JOIN public.business_units unit_bu ON unit_bu.id = c.business_unit_id
  LEFT JOIN public.business_units line_bu
    ON public.phone_last10(line_bu.primary_phone_number) = public.phone_last10(c.called_number)
   AND line_bu.is_active = true
),
voicemail_events AS (
  SELECT
    ('voicemail:' || v.id::text) AS communication_id,
    v.id AS source_id,
    'voicemails'::text AS source_table,
    'voicemail'::text AS source_type,
    'call'::text AS intake_channel,
    'inbound'::text AS direction,
    v.created_at AS event_at,
    v.phone_number,
    public.phone_last10(v.phone_number) AS phone_last10,
    v.contact_name,
    v.contact_type,
    cl.related_customer_id,
    cl.related_job_id,
    cl.related_estimate_id,
    NULL::text AS body,
    v.transcription,
    cl.ai_summary,
    v.recording_url,
    NULL::text[] AS media_urls,
    cl.twilio_sid,
    NULL::text AS message_sid,
    NULL::text AS delivery_status,
    'voicemail'::text AS status,
    NULL::text AS error_code,
    NULL::text AS error_message,
    v.is_read,
    NULL::text AS source_function,
    NULL::text AS template_key,
    jsonb_build_object(
      'call_log_id', v.call_log_id,
      'duration_seconds', v.duration_seconds,
      'recording_sid', v.recording_sid,
      'called_number', cl.called_number
    ) AS metadata,
    COALESCE(cl.business_unit_id, line_bu.id, default_bu.id) AS business_unit_id,
    COALESCE(unit_bu.primary_phone_number, line_bu.primary_phone_number, cl.called_number, default_bu.primary_phone_number) AS company_phone_number,
    public.phone_last10(COALESCE(unit_bu.primary_phone_number, line_bu.primary_phone_number, cl.called_number, default_bu.primary_phone_number)) AS company_phone_last10
  FROM public.voicemails v
  CROSS JOIN default_business_unit default_bu
  LEFT JOIN public.call_log cl ON cl.id = v.call_log_id
  LEFT JOIN public.business_units unit_bu ON unit_bu.id = cl.business_unit_id
  LEFT JOIN public.business_units line_bu
    ON public.phone_last10(line_bu.primary_phone_number) = public.phone_last10(cl.called_number)
   AND line_bu.is_active = true
),
events AS (
  SELECT
    e.*,
    public.communication_thread_key(e.intake_channel, e.phone_last10, e.company_phone_last10) AS thread_key
  FROM (
    SELECT * FROM sms_events
    UNION ALL
    SELECT * FROM call_events
    UNION ALL
    SELECT * FROM voicemail_events
  ) e
)
SELECT
  e.communication_id,
  e.source_id,
  e.source_table,
  e.source_type,
  e.intake_channel,
  e.direction,
  e.event_at,
  timezone('America/Chicago', e.event_at)::date AS day_ct,
  to_char(timezone('America/Chicago', e.event_at), 'FMHH12:MI AM') AS time_ct,
  e.phone_number,
  e.phone_last10,
  COALESCE(e.contact_name, NULLIF(trim(concat_ws(' ', cust.first_name, cust.last_name)), ''), cust.company, job.customer_name, est.customer_name) AS contact_name,
  COALESCE(NULLIF(e.contact_type, ''), CASE WHEN cust.id IS NOT NULL THEN 'customer' ELSE 'unknown' END) AS contact_type,
  COALESCE(e.related_customer_id, cust.id, job.customer_id, est.customer_id) AS customer_id,
  COALESCE(e.related_job_id, job.id) AS job_id,
  COALESCE(e.related_estimate_id, est.id) AS estimate_id,
  job.hcp_job_number,
  job.job_number,
  est.estimate_number,
  COALESCE(e.body, e.ai_summary, e.transcription, '') AS summary_text,
  e.body,
  e.transcription,
  e.ai_summary,
  e.recording_url,
  e.media_urls,
  e.twilio_sid,
  e.message_sid,
  e.delivery_status,
  e.status,
  e.error_code,
  e.error_message,
  e.is_read,
  e.source_function,
  e.template_key,
  COALESCE(thread.status, 'open') AS intake_status,
  thread.handled_by_user_id,
  thread.handled_by_name,
  thread.handled_at,
  thread.updated_at AS intake_status_updated_at,
  e.metadata,
  e.company_phone_number,
  e.company_phone_last10,
  e.business_unit_id,
  e.thread_key
FROM events e
LEFT JOIN LATERAL (
  SELECT t.*
  FROM public.intake_thread_status t
  WHERE t.thread_key = e.thread_key
     OR (
       t.thread_key IS NULL
       AND t.channel = e.intake_channel
       AND t.phone_last10 = e.phone_last10
     )
  ORDER BY (t.thread_key = e.thread_key) DESC, t.updated_at DESC
  LIMIT 1
) thread ON true
LEFT JOIN public.customers cust ON cust.id = e.related_customer_id
LEFT JOIN public.jobs job ON job.id = e.related_job_id
LEFT JOIN public.estimates est ON est.id = e.related_estimate_id;

CREATE OR REPLACE FUNCTION public.get_unified_communications(
  p_limit integer,
  p_offset integer,
  p_view text,
  p_search text,
  p_business_unit_id uuid,
  p_company_phone_number text
)
RETURNS SETOF public.v_unified_communications
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT *
  FROM public.v_unified_communications uc
  WHERE
    (
      COALESCE(p_view, 'all') IN ('all', 'recent')
      OR (p_view = 'now' AND uc.intake_status = 'open')
      OR (p_view = 'handled' AND uc.intake_status = 'handled')
      OR (p_view = 'answering' AND (
        uc.contact_name ILIKE '%answering%'
        OR uc.summary_text ILIKE '%answering service%'
        OR uc.metadata::text ILIKE '%answering_service%'
      ))
    )
    AND (
      p_business_unit_id IS NULL
      OR uc.business_unit_id = p_business_unit_id
    )
    AND (
      NULLIF(trim(COALESCE(p_company_phone_number, '')), '') IS NULL
      OR uc.company_phone_last10 = public.phone_last10(p_company_phone_number)
    )
    AND (
      NULLIF(trim(COALESCE(p_search, '')), '') IS NULL
      OR uc.phone_number ILIKE '%' || p_search || '%'
      OR uc.phone_last10 ILIKE '%' || public.phone_last10(p_search) || '%'
      OR uc.company_phone_number ILIKE '%' || p_search || '%'
      OR uc.company_phone_last10 ILIKE '%' || public.phone_last10(p_search) || '%'
      OR uc.contact_name ILIKE '%' || p_search || '%'
      OR uc.summary_text ILIKE '%' || p_search || '%'
    )
  ORDER BY uc.event_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.get_unified_communications(
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0,
  p_view text DEFAULT 'all',
  p_search text DEFAULT NULL
)
RETURNS SETOF public.v_unified_communications
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT *
  FROM public.get_unified_communications(
    p_limit,
    p_offset,
    p_view,
    p_search,
    NULL::uuid,
    NULL::text
  );
$$;

CREATE OR REPLACE FUNCTION public.mark_intake_communication_handled(
  _channel text,
  _phone_number text,
  _handled_by_name text,
  _source_table text,
  _source_event_id text,
  _metadata jsonb,
  _business_unit_id uuid,
  _company_phone_number text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last10 text := public.phone_last10(_phone_number);
  v_channel text := lower(coalesce(_channel, ''));
  v_source_uuid uuid;
  v_business_unit_id uuid := _business_unit_id;
  v_company_phone_number text := _company_phone_number;
  v_company_phone_last10 text := public.phone_last10(_company_phone_number);
  v_thread_key text;
BEGIN
  IF v_channel = 'voicemail' THEN
    v_channel := 'call';
  END IF;

  IF v_channel NOT IN ('sms', 'call') OR length(v_last10) <> 10 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Missing channel or phone number.');
  END IF;

  IF _source_event_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_source_uuid := _source_event_id::uuid;
  END IF;

  IF v_source_uuid IS NOT NULL AND lower(coalesce(_source_table, '')) = 'sms_log' THEN
    SELECT
      COALESCE(s.business_unit_id, line_bu.id, v_business_unit_id),
      COALESCE(unit_bu.primary_phone_number, line_bu.primary_phone_number, s.to_number, v_company_phone_number)
    INTO v_business_unit_id, v_company_phone_number
    FROM public.sms_log s
    LEFT JOIN public.business_units unit_bu ON unit_bu.id = s.business_unit_id
    LEFT JOIN public.business_units line_bu
      ON public.phone_last10(line_bu.primary_phone_number) = public.phone_last10(s.to_number)
     AND line_bu.is_active = true
    WHERE s.id = v_source_uuid;
  ELSIF v_source_uuid IS NOT NULL AND lower(coalesce(_source_table, '')) = 'call_log' THEN
    SELECT
      COALESCE(c.business_unit_id, line_bu.id, v_business_unit_id),
      COALESCE(unit_bu.primary_phone_number, line_bu.primary_phone_number, c.called_number, v_company_phone_number)
    INTO v_business_unit_id, v_company_phone_number
    FROM public.call_log c
    LEFT JOIN public.business_units unit_bu ON unit_bu.id = c.business_unit_id
    LEFT JOIN public.business_units line_bu
      ON public.phone_last10(line_bu.primary_phone_number) = public.phone_last10(c.called_number)
     AND line_bu.is_active = true
    WHERE c.id = v_source_uuid;
  ELSIF v_source_uuid IS NOT NULL AND lower(coalesce(_source_table, '')) = 'voicemails' THEN
    SELECT
      COALESCE(c.business_unit_id, line_bu.id, v_business_unit_id),
      COALESCE(unit_bu.primary_phone_number, line_bu.primary_phone_number, c.called_number, v_company_phone_number)
    INTO v_business_unit_id, v_company_phone_number
    FROM public.voicemails v
    LEFT JOIN public.call_log c ON c.id = v.call_log_id
    LEFT JOIN public.business_units unit_bu ON unit_bu.id = c.business_unit_id
    LEFT JOIN public.business_units line_bu
      ON public.phone_last10(line_bu.primary_phone_number) = public.phone_last10(c.called_number)
     AND line_bu.is_active = true
    WHERE v.id = v_source_uuid;
  END IF;

  IF v_business_unit_id IS NOT NULL AND NULLIF(v_company_phone_number, '') IS NULL THEN
    SELECT primary_phone_number
    INTO v_company_phone_number
    FROM public.business_units
    WHERE id = v_business_unit_id;
  END IF;

  IF v_business_unit_id IS NULL AND NULLIF(public.phone_last10(v_company_phone_number), '') IS NOT NULL THEN
    SELECT id, primary_phone_number
    INTO v_business_unit_id, v_company_phone_number
    FROM public.business_units
    WHERE public.phone_last10(primary_phone_number) = public.phone_last10(v_company_phone_number)
      AND is_active = true
    LIMIT 1;
  END IF;

  IF v_business_unit_id IS NULL THEN
    SELECT id, primary_phone_number
    INTO v_business_unit_id, v_company_phone_number
    FROM public.business_units
    WHERE is_default = true
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  v_company_phone_last10 := public.phone_last10(v_company_phone_number);
  v_thread_key := public.communication_thread_key(v_channel, v_last10, v_company_phone_last10);

  INSERT INTO public.intake_thread_status (
    channel,
    phone_last10,
    business_unit_id,
    company_phone_number,
    company_phone_last10,
    thread_key,
    status,
    handled_by_user_id,
    handled_by_name,
    handled_at,
    last_signal_at,
    source_table,
    source_event_id,
    metadata,
    updated_at
  )
  VALUES (
    v_channel,
    v_last10,
    v_business_unit_id,
    v_company_phone_number,
    v_company_phone_last10,
    v_thread_key,
    'handled',
    auth.uid(),
    _handled_by_name,
    now(),
    now(),
    _source_table,
    _source_event_id,
    COALESCE(_metadata, '{}'::jsonb),
    now()
  )
  ON CONFLICT (thread_key)
  DO UPDATE SET
    status = 'handled',
    business_unit_id = COALESCE(EXCLUDED.business_unit_id, public.intake_thread_status.business_unit_id),
    company_phone_number = COALESCE(EXCLUDED.company_phone_number, public.intake_thread_status.company_phone_number),
    company_phone_last10 = COALESCE(EXCLUDED.company_phone_last10, public.intake_thread_status.company_phone_last10),
    handled_by_user_id = auth.uid(),
    handled_by_name = EXCLUDED.handled_by_name,
    handled_at = now(),
    source_table = COALESCE(EXCLUDED.source_table, public.intake_thread_status.source_table),
    source_event_id = COALESCE(EXCLUDED.source_event_id, public.intake_thread_status.source_event_id),
    metadata = COALESCE(public.intake_thread_status.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
    updated_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'channel', v_channel,
    'phone_last10', v_last10,
    'business_unit_id', v_business_unit_id,
    'company_phone_number', v_company_phone_number,
    'company_phone_last10', v_company_phone_last10,
    'thread_key', v_thread_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_intake_communication_handled(
  _channel text,
  _phone_number text,
  _handled_by_name text DEFAULT NULL,
  _source_table text DEFAULT NULL,
  _source_event_id text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.mark_intake_communication_handled(
    _channel,
    _phone_number,
    _handled_by_name,
    _source_table,
    _source_event_id,
    _metadata,
    NULL::uuid,
    NULL::text
  );
$$;

GRANT SELECT ON public.v_unified_communications TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unified_communications(integer, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unified_communications(integer, integer, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_intake_communication_handled(text, text, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_intake_communication_handled(text, text, text, text, text, jsonb, uuid, text) TO authenticated;
