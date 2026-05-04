-- Recreate day-grouping call view after multi-company columns were added.
-- Postgres expands c.* at view creation time, so old views did not expose
-- called_number/business_unit_id until refreshed.

DROP VIEW IF EXISTS public.v_call_log_with_day;

CREATE VIEW public.v_call_log_with_day
WITH (security_invoker = on) AS
SELECT
  c.*,
  ((c.created_at AT TIME ZONE 'America/Chicago')::date) AS day_ct,
  to_char(c.created_at AT TIME ZONE 'America/Chicago', 'HH12:MI AM') AS time_ct
FROM public.call_log c;

