CREATE UNIQUE INDEX IF NOT EXISTS sms_log_twilio_sid_unique_idx
  ON public.sms_log (twilio_sid)
  WHERE twilio_sid IS NOT NULL;