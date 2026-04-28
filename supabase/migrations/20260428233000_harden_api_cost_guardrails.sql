-- API cost guardrail tuning:
-- route-cache prewarm should be calm because calculate-route-cache now skips
-- already-current employee/date routes. Keep it running often enough for active
-- dispatch changes without poking Google on every page load.
select cron.unschedule('route-cache-prewarm-today-tomorrow')
where exists (
  select 1 from cron.job where jobname = 'route-cache-prewarm-today-tomorrow'
);

select cron.schedule(
  'route-cache-prewarm-today-tomorrow',
  '*/30 * * * *',
  $$
  select public.safe_http_post(
    '/functions/v1/prewarm-route-cache',
    '{"source":"cron","scope":"today_and_tomorrow"}'::jsonb
  );
  $$
);
