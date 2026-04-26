-- Central Time day-grouping views
CREATE OR REPLACE VIEW public.v_call_log_with_day AS
SELECT
  c.*,
  ((c.created_at AT TIME ZONE 'America/Chicago')::date) AS day_ct,
  to_char(c.created_at AT TIME ZONE 'America/Chicago', 'HH12:MI AM') AS time_ct
FROM public.call_log c;

CREATE OR REPLACE VIEW public.v_sms_log_with_day AS
SELECT
  s.*,
  ((s.created_at AT TIME ZONE 'America/Chicago')::date) AS day_ct,
  to_char(s.created_at AT TIME ZONE 'America/Chicago', 'HH12:MI AM') AS time_ct
FROM public.sms_log s;

-- Terminal-status enforcement trigger for call_log
CREATE OR REPLACE FUNCTION public.enforce_terminal_call_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _terminal text[] := ARRAY[
    'completed','no-answer','busy','failed','canceled','cancelled',
    'voicemail','missed-while-busy','suspected-bot','missed','unknown'
  ];
BEGIN
  -- When ended_at is set (or becomes set), ensure status is terminal
  IF NEW.ended_at IS NOT NULL THEN
    IF NEW.status IS NULL OR NOT (NEW.status = ANY(_terminal)) THEN
      NEW.status := 'unknown';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_terminal_call_status ON public.call_log;
CREATE TRIGGER trg_enforce_terminal_call_status
BEFORE INSERT OR UPDATE ON public.call_log
FOR EACH ROW
EXECUTE FUNCTION public.enforce_terminal_call_status();