ALTER TABLE public.sms_log
  ADD COLUMN IF NOT EXISTS source_function text,
  ADD COLUMN IF NOT EXISTS template_key text;

CREATE INDEX IF NOT EXISTS idx_sms_log_source_function
  ON public.sms_log (source_function);

CREATE INDEX IF NOT EXISTS idx_sms_log_template_key
  ON public.sms_log (template_key);

INSERT INTO public.company_settings (key, value)
VALUES
  ('missed_call_sms_during_hours_template_key', ''),
  ('missed_call_sms_after_hours_template_key', ''),
  ('post_call_sms_customer_template_key', ''),
  ('post_call_sms_unknown_template_key', '')
ON CONFLICT (key) DO NOTHING;