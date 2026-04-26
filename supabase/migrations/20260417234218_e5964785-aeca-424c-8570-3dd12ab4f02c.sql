
-- Schedule retry-queue-processor to run every minute
do $$
declare
  _url text;
  _key text;
begin
  select decrypted_secret into _url from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
  select decrypted_secret into _key from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY' limit 1;

  if _url is null or _key is null then
    raise notice 'Skipping cron schedule — vault secrets missing';
    return;
  end if;

  -- Remove any existing schedule with the same name
  perform cron.unschedule('retry-queue-processor-every-minute')
  where exists (select 1 from cron.job where jobname = 'retry-queue-processor-every-minute');

  perform cron.schedule(
    'retry-queue-processor-every-minute',
    '* * * * *',
    format(
      $cmd$select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000
      );$cmd$,
      _url || '/functions/v1/retry-queue-processor',
      _key
    )
  );
end$$;
