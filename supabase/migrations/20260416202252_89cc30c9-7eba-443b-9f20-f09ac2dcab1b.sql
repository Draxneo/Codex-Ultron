-- Add client_id to sms_log for fast optimistic→real swap (no fuzzy matching)
ALTER TABLE public.sms_log
  ADD COLUMN IF NOT EXISTS client_id text;

CREATE INDEX IF NOT EXISTS idx_sms_log_client_id ON public.sms_log (client_id) WHERE client_id IS NOT NULL;

-- Seed master missed-call SMS settings (key/value rows)
INSERT INTO public.company_settings (key, value) VALUES
  ('missed_call_sms_enabled', 'true'),
  ('missed_call_sms_during_hours', 'Hi! Sorry we missed you — we''ll call you right back. Need us sooner? Just text us here.'),
  ('missed_call_sms_after_hours', 'Hi! Thanks for calling — we''re closed right now. We''ll get back to you first thing. For emergencies, just text EMERGENCY here.')
ON CONFLICT (key) DO NOTHING;