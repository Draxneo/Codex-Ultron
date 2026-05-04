
-- Create copilot_messages table
CREATE TABLE public.copilot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast user lookups
CREATE INDEX idx_copilot_messages_user_created ON public.copilot_messages (user_id, created_at);

-- Enable RLS
ALTER TABLE public.copilot_messages ENABLE ROW LEVEL SECURITY;

-- Users can read their own messages
CREATE POLICY "Users can read own copilot messages"
  ON public.copilot_messages FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own messages
CREATE POLICY "Users can insert own copilot messages"
  ON public.copilot_messages FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own messages (for clear chat)
CREATE POLICY "Users can delete own copilot messages"
  ON public.copilot_messages FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Cleanup trigger: delete messages older than 60 days on INSERT
CREATE OR REPLACE FUNCTION public.cleanup_old_copilot_messages()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  DELETE FROM public.copilot_messages
  WHERE user_id = NEW.user_id
    AND created_at < now() - interval '60 days';
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cleanup_copilot_messages
  AFTER INSERT ON public.copilot_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_old_copilot_messages();
