ALTER TABLE public.ivr_menu_options
  ADD COLUMN dept_missed_call_sms_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN dept_after_hours_sms_enabled boolean NOT NULL DEFAULT true;