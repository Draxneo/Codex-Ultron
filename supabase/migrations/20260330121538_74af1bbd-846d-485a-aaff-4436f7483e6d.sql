CREATE OR REPLACE FUNCTION public.create_job_reminders()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.scheduled_date IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.scheduled_date IS DISTINCT FROM NEW.scheduled_date)
  THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.job_reminders
      WHERE job_id = NEW.id
        AND status = 'sent'
        AND scheduled_for::date IN (NEW.scheduled_date::date - 1, NEW.scheduled_date::date)
    ) THEN
      DELETE FROM public.job_reminders WHERE job_id = NEW.id AND status = 'pending';
      
      INSERT INTO public.job_reminders (job_id, reminder_type, scheduled_for) VALUES
        (NEW.id, 'day_before', ((NEW.scheduled_date::date - 1)::text || ' 16:00 America/Chicago')::timestamptz);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;