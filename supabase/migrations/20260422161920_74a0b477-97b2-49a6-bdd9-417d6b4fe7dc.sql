CREATE TABLE public.system_trace_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source_type text NOT NULL,
  source_name text NOT NULL,
  event_kind text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  trace_group text NULL,
  entity_type text NULL,
  entity_id text NULL,
  call_sid text NULL,
  parent_call_sid text NULL,
  summary text NOT NULL,
  reason text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_system_trace_events_occurred_at
  ON public.system_trace_events (occurred_at DESC);

CREATE INDEX idx_system_trace_events_call_sid
  ON public.system_trace_events (call_sid)
  WHERE call_sid IS NOT NULL;

CREATE INDEX idx_system_trace_events_trace_group
  ON public.system_trace_events (trace_group)
  WHERE trace_group IS NOT NULL;

CREATE INDEX idx_system_trace_events_source
  ON public.system_trace_events (source_type, source_name, occurred_at DESC);

ALTER TABLE public.system_trace_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view system trace events"
ON public.system_trace_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.log_system_trace(
  p_source_type text,
  p_source_name text,
  p_event_kind text,
  p_summary text,
  p_reason text DEFAULT NULL,
  p_severity text DEFAULT 'info',
  p_trace_group text DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id text DEFAULT NULL,
  p_call_sid text DEFAULT NULL,
  p_parent_call_sid text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid;
BEGIN
  INSERT INTO public.system_trace_events (
    source_type,
    source_name,
    event_kind,
    severity,
    trace_group,
    entity_type,
    entity_id,
    call_sid,
    parent_call_sid,
    summary,
    reason,
    metadata
  )
  VALUES (
    p_source_type,
    p_source_name,
    p_event_kind,
    p_severity,
    p_trace_group,
    p_entity_type,
    p_entity_id,
    p_call_sid,
    p_parent_call_sid,
    p_summary,
    p_reason,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$function$;