
-- Database trigger: when all tasks for a job/estimate are done, mark the job/estimate as done
-- and delete the associated chat channel

CREATE OR REPLACE FUNCTION public.check_all_tasks_done()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _pending_count integer;
  _total_count integer;
BEGIN
  -- Only act when a task is marked done/na/skipped
  IF NEW.status NOT IN ('done', 'na', 'skipped') THEN
    RETURN NEW;
  END IF;

  -- Handle job-linked tasks
  IF NEW.job_id IS NOT NULL THEN
    -- Count remaining pending non-silent tasks for this job
    SELECT COUNT(*) INTO _total_count
    FROM public.job_tasks
    WHERE job_id = NEW.job_id;

    SELECT COUNT(*) INTO _pending_count
    FROM public.job_tasks
    WHERE job_id = NEW.job_id
      AND status = 'pending';

    -- If there are tasks and none are pending, close out the job
    IF _total_count > 0 AND _pending_count = 0 THEN
      -- Update job status to done (only if not already in a terminal state)
      UPDATE public.jobs
      SET status = 'done',
          completed_at = COALESCE(completed_at, now())
      WHERE id = NEW.job_id
        AND status NOT IN ('done', 'invoiced', 'canceled');

      -- Remove the chat channel for this job
      DELETE FROM public.chat_channels
      WHERE job_id = NEW.job_id;

      -- Log the auto-close
      INSERT INTO public.activity_log (job_id, action, performed_by, details)
      VALUES (NEW.job_id, 'auto_closed', 'System', 'All tasks completed — job auto-closed and chat thread removed');
    END IF;
  END IF;

  -- Handle estimate-linked tasks
  IF NEW.estimate_id IS NOT NULL THEN
    SELECT COUNT(*) INTO _total_count
    FROM public.job_tasks
    WHERE estimate_id = NEW.estimate_id;

    SELECT COUNT(*) INTO _pending_count
    FROM public.job_tasks
    WHERE estimate_id = NEW.estimate_id
      AND status = 'pending';

    -- If all tasks done, close out the estimate
    IF _total_count > 0 AND _pending_count = 0 THEN
      UPDATE public.estimates
      SET work_status = 'won'
      WHERE id = NEW.estimate_id
        AND work_status NOT IN ('won', 'lost', 'canceled');

      DELETE FROM public.chat_channels
      WHERE estimate_id = NEW.estimate_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to job_tasks
CREATE TRIGGER trg_check_all_tasks_done
  AFTER UPDATE OF status ON public.job_tasks
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.check_all_tasks_done();
