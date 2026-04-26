
-- Backfill: collapse multiple open add_job_note todos per customer into a single rolling todo with bullet list
DO $$
DECLARE
  rec RECORD;
  bullets TEXT;
  keep_id UUID;
  highest_priority TEXT;
BEGIN
  FOR rec IN
    SELECT customer_id, COUNT(*) AS cnt
    FROM public.todos
    WHERE status = 'open'
      AND action_type = 'add_job_note'
      AND customer_id IS NOT NULL
    GROUP BY customer_id
    HAVING COUNT(*) > 1
  LOOP
    -- Build bullet list from all open notes for this customer (oldest first)
    SELECT string_agg('• ' || title, E'\n' ORDER BY created_at)
      INTO bullets
    FROM public.todos
    WHERE status = 'open'
      AND action_type = 'add_job_note'
      AND customer_id = rec.customer_id;

    -- Compute highest priority
    SELECT CASE
      WHEN bool_or(priority = 'urgent') THEN 'urgent'
      WHEN bool_or(priority = 'high')   THEN 'high'
      WHEN bool_or(priority = 'normal') THEN 'normal'
      ELSE 'low'
    END
    INTO highest_priority
    FROM public.todos
    WHERE status = 'open'
      AND action_type = 'add_job_note'
      AND customer_id = rec.customer_id;

    -- Pick the oldest as the survivor
    SELECT id INTO keep_id
    FROM public.todos
    WHERE status = 'open'
      AND action_type = 'add_job_note'
      AND customer_id = rec.customer_id
    ORDER BY created_at ASC
    LIMIT 1;

    -- Update the survivor to be the rolling-notes todo
    UPDATE public.todos
    SET title = 'Notes to add to job',
        notes = bullets,
        priority = highest_priority,
        action_meta = jsonb_set(COALESCE(action_meta, '{}'::jsonb), '{note_text}', to_jsonb(bullets)),
        updated_at = now()
    WHERE id = keep_id;

    -- Delete the duplicates
    DELETE FROM public.todos
    WHERE status = 'open'
      AND action_type = 'add_job_note'
      AND customer_id = rec.customer_id
      AND id <> keep_id;
  END LOOP;
END $$;
