DO $$
DECLARE
  table_name text;
  table_names text[] := ARRAY[
    'jobs',
    'estimates',
    'activity_log',
    'job_attachments',
    'job_transcripts',
    'tech_forms',
    'tech_form_photos',
    'tech_form_responses',
    'job_carts',
    'job_cart_items',
    'workflow_alerts',
    'action_items'
  ];
BEGIN
  FOREACH table_name IN ARRAY table_names LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = table_name
      )
    THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END $$;
