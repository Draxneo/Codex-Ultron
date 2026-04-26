-- Remove the old every-2-minute sync
SELECT cron.unschedule(12);

-- Re-create at every 15 minutes
SELECT cron.schedule(
  'sync-hcp-jobs-lightweight',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1) || '/functions/v1/sync-hcp-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1)
    ),
    body := '{"source":"cron"}'::jsonb
  ) AS request_id;
  $$
);