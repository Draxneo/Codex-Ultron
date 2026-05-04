CREATE OR REPLACE FUNCTION public.sync_orientation_from_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _job_id uuid;
  _orientation text;
BEGIN
  -- Check if this response is for the "Where is the system?" or "Install Location" field
  IF EXISTS (
    SELECT 1 FROM public.tech_form_fields
    WHERE id = NEW.field_id
      AND label IN ('Where is the system?', 'Install Location')
  ) THEN
    -- Get the job_id from the tech_form
    SELECT tf.job_id INTO _job_id
    FROM public.tech_forms tf
    WHERE tf.id = NEW.tech_form_id;

    IF _job_id IS NOT NULL AND NEW.value IS NOT NULL THEN
      -- Map response to orientation
      _orientation := CASE
        WHEN NEW.value ILIKE '%horizontal%' OR NEW.value ILIKE '%attic%' THEN 'Horizontal'
        WHEN NEW.value ILIKE '%vertical%' OR NEW.value ILIKE '%closet%' THEN 'Vertical'
        ELSE NULL
      END;

      IF _orientation IS NOT NULL THEN
        UPDATE public.jobs SET orientation = _orientation WHERE id = _job_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_orientation_from_response
  AFTER INSERT OR UPDATE ON public.tech_form_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_orientation_from_response();