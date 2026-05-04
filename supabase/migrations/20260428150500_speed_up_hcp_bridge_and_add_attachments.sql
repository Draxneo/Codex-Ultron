-- Temporary HCP bridge tuning while running side-by-side.
-- Jobs/estimates need to stay very fresh during dispatch, so run every minute.
-- Attachments are heavier, so keep them on their own slower bridge.

DO $$
DECLARE
  _url text;
BEGIN
  SELECT decrypted_secret INTO _url
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_URL'
  LIMIT 1;

  IF _url IS NULL THEN
    RAISE NOTICE 'Skipping hcp bridge cron update - SUPABASE_URL missing from vault';
    RETURN;
  END IF;

  PERFORM cron.unschedule('hcp-bridge-sync-every-15-min')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'hcp-bridge-sync-every-15-min'
  );

  PERFORM cron.unschedule('hcp-bridge-sync-every-minute')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'hcp-bridge-sync-every-minute'
  );

  PERFORM cron.unschedule('hcp-bridge-attachments-every-30-min')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'hcp-bridge-attachments-every-30-min'
  );

  PERFORM cron.schedule(
    'hcp-bridge-sync-every-minute',
    '* * * * *',
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

  PERFORM cron.schedule(
    'hcp-bridge-attachments-every-30-min',
    '*/30 * * * *',
    format(
      $cmd$SELECT public.safe_http_post(
        %L,
        %L::jsonb,
        'cron:hcp-bridge-attachments',
        55000
      );$cmd$,
      _url || '/functions/v1/sync-hcp-jobs',
      jsonb_build_object(
        'source', 'bridge-cron',
        'start_date', '2026-04-27',
        'days_ahead', 30,
        'max_pages', 2,
        'max_estimate_pages', 1,
        'sync_estimates', false,
        'sync_line_items', false,
        'sync_attachments', true
      )::text
    )
  );
END $$;
