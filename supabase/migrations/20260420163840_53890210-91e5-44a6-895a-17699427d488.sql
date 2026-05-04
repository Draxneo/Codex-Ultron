DROP VIEW IF EXISTS public.v_call_log_with_day;
DROP VIEW IF EXISTS public.v_sms_log_with_day;

CREATE VIEW public.v_call_log_with_day
WITH (security_invoker = on) AS
SELECT
  c.*,
  ((c.created_at AT TIME ZONE 'America/Chicago')::date) AS day_ct,
  to_char(c.created_at AT TIME ZONE 'America/Chicago', 'HH12:MI AM') AS time_ct
FROM public.call_log c;

CREATE VIEW public.v_sms_log_with_day
WITH (security_invoker = on) AS
SELECT
  s.*,
  ((s.created_at AT TIME ZONE 'America/Chicago')::date) AS day_ct,
  to_char(s.created_at AT TIME ZONE 'America/Chicago', 'HH12:MI AM') AS time_ct
FROM public.sms_log s;