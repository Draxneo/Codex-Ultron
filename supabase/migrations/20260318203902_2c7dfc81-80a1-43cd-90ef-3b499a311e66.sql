CREATE OR REPLACE FUNCTION public.create_job_reminders()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.scheduled_date IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.scheduled_date IS DISTINCT FROM NEW.scheduled_date) THEN
    DELETE FROM public.job_reminders WHERE job_id = NEW.id AND status = 'pending';

    INSERT INTO public.job_reminders (job_id, reminder_type, scheduled_for)
    VALUES
      (
        NEW.id,
        'day_before',
        (((NEW.scheduled_date::date - 1)::text || ' 09:00 America/Chicago')::timestamptz)
      ),
      (
        NEW.id,
        'morning_of',
        ((NEW.scheduled_date::date::text || ' 07:00 America/Chicago')::timestamptz)
      );
  END IF;

  RETURN NEW;
END;
$$;