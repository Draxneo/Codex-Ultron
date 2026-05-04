-- Temporary HCP bridge while UltraOffice2.0 is running side-by-side.
-- Pull scheduled jobs and estimates from HCP starting 2026-04-27.
-- This is intentionally one-way: HCP -> UltraOffice only.

DO $$
DECLARE
  _url text;
BEGIN
  SELECT decrypted_secret INTO _url
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_URL'
  LIMIT 1;

  IF _url IS NULL THEN
    RAISE NOTICE 'Skipping hcp bridge cron schedule - SUPABASE_URL missing from vault';
    RETURN;
  END IF;

  PERFORM cron.unschedule('hcp-bridge-sync-every-15-min')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'hcp-bridge-sync-every-15-min'
  );

  PERFORM cron.schedule(
    'hcp-bridge-sync-every-15-min',
    '*/15 * * * *',
    format(
      $cmd$SELECT public.safe_http_post(
        %L,
        %L::jsonb,
        'cron:hcp-bridge-sync',
        55000
      );$cmd$,
      _url || '/functions/v1/sync-hcp-jobs',
      jsonb_build_object(
        'source', 'bridge-cron',
        'start_date', '2026-04-27',
        'days_ahead', 90,
        'max_pages', 4,
        'max_estimate_pages', 4,
        'sync_estimates', true,
        'sync_line_items', false,
        'sync_attachments', false
      )::text
    )
  );
END $$;
