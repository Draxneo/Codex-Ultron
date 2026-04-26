-- Speed up reconcile-stuck-calls cron to every 5 min for fast ghost-busy recovery
-- so a leaked in-progress row never blocks routing for more than ~5 minutes.

DO $$
DECLARE
  _supabase_url text;
  _anon_key text;
  _existing_jobid bigint;
BEGIN
  SELECT decrypted_secret INTO _supabase_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  SELECT decrypted_secret INTO _anon_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1;

  IF _supabase_url IS NULL OR _anon_key IS NULL THEN
    RAISE NOTICE 'Vault secrets missing — skipping cron schedule';
    RETURN;
  END IF;

  -- Drop any pre-existing reconcile jobs so we have one canonical schedule
  FOR _existing_jobid IN
    SELECT jobid FROM cron.job WHERE jobname IN ('reconcile-stuck-calls-recent', 'reconcile-stuck-calls-daily', 'reconcile-stuck-calls')
  LOOP
    PERFORM cron.unschedule(_existing_jobid);
  END LOOP;

  -- Fast loop: every 5 min, scope=recent (covers force-close of in-progress >65min)
  PERFORM cron.schedule(
    'reconcile-stuck-calls-recent',
    '*/5 * * * *',
    format($cmd$
      SELECT public.safe_http_post(
        %L,
        '{"scope":"recent"}'::jsonb,
        'cron:reconcile-stuck-calls-recent',
        60000
      );
    $cmd$, _supabase_url || '/functions/v1/reconcile-stuck-calls')
  );

  -- Daily deep sweep at 3am CT for older ghosts
  PERFORM cron.schedule(
    'reconcile-stuck-calls-daily',
    '0 8 * * *',
    format($cmd$
      SELECT public.safe_http_post(
        %L,
        '{}'::jsonb,
        'cron:reconcile-stuck-calls-daily',
        120000
      );
    $cmd$, _supabase_url || '/functions/v1/reconcile-stuck-calls')
  );
END $$;