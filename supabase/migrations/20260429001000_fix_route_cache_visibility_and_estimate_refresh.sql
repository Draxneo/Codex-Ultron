-- Keep dispatch ETA cache visible to the signed-in app and refresh it when
-- either jobs or estimates move on today's/tomorrow's board.

ALTER TABLE public.route_travel_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read travel cache" ON public.route_travel_cache;
DROP POLICY IF EXISTS "Authenticated users can read route travel cache" ON public.route_travel_cache;
CREATE POLICY "Authenticated users can read route travel cache"
  ON public.route_travel_cache
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role can manage travel cache" ON public.route_travel_cache;
DROP POLICY IF EXISTS "Service role can manage route travel cache" ON public.route_travel_cache;
CREATE POLICY "Service role can manage route travel cache"
  ON public.route_travel_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS recalculate_travel_on_estimate_change ON public.estimates;
CREATE TRIGGER recalculate_travel_on_estimate_change
  AFTER INSERT OR UPDATE OF assigned_to, scheduled_date, address OR DELETE
  ON public.estimates
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recalculate_travel_cache();

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
    '* * * * *',
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
