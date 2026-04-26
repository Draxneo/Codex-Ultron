ALTER TABLE public.ivr_menu_options
  ADD COLUMN IF NOT EXISTS dept_missed_call_sms_template_key text,
  ADD COLUMN IF NOT EXISTS dept_after_hours_sms_template_key text;

CREATE INDEX IF NOT EXISTS idx_ivr_menu_options_missed_template_key
  ON public.ivr_menu_options (dept_missed_call_sms_template_key);

CREATE INDEX IF NOT EXISTS idx_ivr_menu_options_after_hours_template_key
  ON public.ivr_menu_options (dept_after_hours_sms_template_key);