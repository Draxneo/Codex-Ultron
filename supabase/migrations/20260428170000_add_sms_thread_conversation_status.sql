ALTER TABLE public.sms_thread_settings
  ADD COLUMN IF NOT EXISTS conversation_status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sms_thread_settings_conversation_status_check'
      AND conrelid = 'public.sms_thread_settings'::regclass
  ) THEN
    ALTER TABLE public.sms_thread_settings
      ADD CONSTRAINT sms_thread_settings_conversation_status_check
      CHECK (conversation_status IS NULL OR conversation_status IN ('needs_reply', 'waiting', 'done'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sms_thread_settings_status
  ON public.sms_thread_settings (conversation_status);
