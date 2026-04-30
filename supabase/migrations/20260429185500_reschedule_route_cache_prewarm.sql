-- The previous route-cache visibility migration accidentally returned this
-- prewarm job to every minute. Keep the cache warm, but do not wake the route
-- calculator constantly while HCP sync is also updating today's board.

DO $$
DECLARE
  _url text;
BEGIN
  SELECT decrypted_secret INTO _url
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_URL'
  LIMIT 1;

  IF _url IS NULL THEN
    RAISE NOTICE 'Skipping route prewarm cron schedule - SUPABASE_URL missing from vault';
    RETURN;
  END IF;

  PERFORM cron.unschedule(jobname)
  FROM cron.job
  WHERE jobname IN (
    'route-cache-prewarm-today-tomorrow',
    'prewarm-route-cache'
  );

  PERFORM cron.schedule(
    'route-cache-prewarm-today-tomorrow',
    '*/30 * * * *',
    format(
      $cmd$SELECT public.safe_http_post(
        %L,
        %L::jsonb,
        'cron:route-cache-prewarm',
        55000
      );$cmd$,
      _url || '/functions/v1/prewarm-route-cache',
      jsonb_build_object('source', 'route-cache-cron', 'cadence', '30_min')::text
    )
  );
END $$;
