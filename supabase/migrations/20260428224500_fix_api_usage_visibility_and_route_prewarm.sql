-- Make the API cost dashboard visible to signed-in staff again and keep
-- travel-time cache warm only for today's and tomorrow's dispatch board.

DROP POLICY IF EXISTS "Authenticated users can read api_usage_log" ON public.api_usage_log;
DROP POLICY IF EXISTS "Authenticated users can read api usage log" ON public.api_usage_log;
CREATE POLICY "Authenticated users can read api usage log"
  ON public.api_usage_log
  FOR SELECT
  TO authenticated
  USING (true);

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

  PERFORM cron.unschedule('route-cache-prewarm-today-tomorrow')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'route-cache-prewarm-today-tomorrow'
  );

  PERFORM cron.schedule(
    'route-cache-prewarm-today-tomorrow',
    '*/15 * * * *',
    format(
      $cmd$SELECT public.safe_http_post(
        %L,
        %L::jsonb,
        'cron:route-cache-prewarm',
        55000
      );$cmd$,
      _url || '/functions/v1/prewarm-route-cache',
      jsonb_build_object('source', 'route-cache-cron')::text
    )
  );
END $$;
