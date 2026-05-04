-- Keep the temporary HCP bridge pointed at the UltraOffice2.0 Supabase project.
-- A stale SUPABASE_URL vault value caused pg_cron to call the discontinued project.

DO $$
DECLARE
  _url text := 'https://tqkqqjvddfrcxrxfvzvz.supabase.co';
  _secret_id uuid;
BEGIN
  SELECT id INTO _secret_id
  FROM vault.secrets
  WHERE name = 'SUPABASE_URL'
  LIMIT 1;

  IF _secret_id IS NULL THEN
    PERFORM vault.create_secret(
      _url,
      'SUPABASE_URL',
      'UltraOffice2.0 project API URL used by database crons'
    );
  ELSE
    PERFORM vault.update_secret(
      _secret_id,
      _url,
      'SUPABASE_URL',
      'UltraOffice2.0 project API URL used by database crons'
    );
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
