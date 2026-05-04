-- Reliability pass: make retry queue visible/realtime and ensure its processor
-- runs through safe_http_post so protected functions receive the service token.

DO $$
DECLARE
  _url text;
BEGIN
  SELECT decrypted_secret INTO _url
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_URL'
  LIMIT 1;

  IF _url IS NULL THEN
    RAISE NOTICE 'Skipping retry queue cron schedule - SUPABASE_URL missing from vault';
  ELSE
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retry-queue-processor-every-minute') THEN
      PERFORM cron.unschedule('retry-queue-processor-every-minute');
    END IF;

    PERFORM cron.schedule(
      'retry-queue-processor-every-minute',
      '* * * * *',
      format(
        $cmd$SELECT public.safe_http_post(
          %L,
          '{}'::jsonb,
          'retry-queue-processor-cron',
          55000
        );$cmd$,
        _url || '/functions/v1/retry-queue-processor'
      )
    );
  END IF;
END $$;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'quote_cart_events',
    'customer_activity_feed',
    'stripe_events',
    'invoice_payments',
    'hcp_attachments',
    'retry_queue',
    'system_error_log',
    'oncall_alerts',
    'workflow_card_acknowledgements'
  ]
  LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND tablename = tbl
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $$;
