ALTER TABLE public.sms_log
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS starred boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sms_log_status_check'
      AND conrelid = 'public.sms_log'::regclass
  ) THEN
    ALTER TABLE public.sms_log
      ADD CONSTRAINT sms_log_status_check
      CHECK (status IN ('queued','sending','sent','delivered','failed','read'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.sms_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.sms_log(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (char_length(emoji) <= 8),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

ALTER TABLE public.sms_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own reactions" ON public.sms_reactions;
CREATE POLICY "users read own reactions"
  ON public.sms_reactions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users insert own reactions" ON public.sms_reactions;
CREATE POLICY "users insert own reactions"
  ON public.sms_reactions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users delete own reactions" ON public.sms_reactions;
CREATE POLICY "users delete own reactions"
  ON public.sms_reactions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS sms_reactions_message_idx
  ON public.sms_reactions(message_id);

CREATE TABLE IF NOT EXISTS public.sms_thread_settings (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone_last10 text NOT NULL,
  muted_until timestamptz,
  pinned boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, phone_last10)
);

ALTER TABLE public.sms_thread_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage own thread settings" ON public.sms_thread_settings;
CREATE POLICY "users manage own thread settings"
  ON public.sms_thread_settings FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_sms_thread_settings_updated_at ON public.sms_thread_settings;
CREATE TRIGGER update_sms_thread_settings_updated_at
BEFORE UPDATE ON public.sms_thread_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();