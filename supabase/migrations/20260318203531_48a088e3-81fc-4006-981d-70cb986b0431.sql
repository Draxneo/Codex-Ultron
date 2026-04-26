CREATE OR REPLACE FUNCTION public.create_job_reminders()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.scheduled_date IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.scheduled_date IS DISTINCT FROM NEW.scheduled_date) THEN
    DELETE FROM public.job_reminders WHERE job_id = NEW.id AND status = 'pending';
    INSERT INTO public.job_reminders (job_id, reminder_type, scheduled_for)
    VALUES
      -- day_before at 9 AM Central: 15:00 UTC (CST) / sends 10 AM during CDT
      (NEW.id, 'day_before', (NEW.scheduled_date::date - 1) + time '15:00'),
      -- morning_of at 7 AM Central: 13:00 UTC (CST) / sends 8 AM during CDT
      (NEW.id, 'morning_of', NEW.scheduled_date::date + time '13:00');
  END IF;
  RETURN NEW;
END;
$$;