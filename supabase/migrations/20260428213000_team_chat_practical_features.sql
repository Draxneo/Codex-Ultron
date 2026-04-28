ALTER TABLE public.team_messages
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS team_messages_pinned_idx
  ON public.team_messages(conversation_id, is_pinned, created_at DESC)
  WHERE is_pinned = true AND deleted_at IS NULL;

DROP POLICY IF EXISTS "Members can pin team messages" ON public.team_messages;

CREATE OR REPLACE FUNCTION public.set_team_message_pin(_message_id uuid, _pin boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conversation_id uuid;
BEGIN
  SELECT conversation_id
  INTO _conversation_id
  FROM public.team_messages
  WHERE id = _message_id
    AND deleted_at IS NULL;

  IF _conversation_id IS NULL THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  IF NOT public.is_team_conversation_member(_conversation_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  UPDATE public.team_messages
  SET is_pinned = _pin,
      pinned_by = CASE WHEN _pin THEN auth.uid() ELSE NULL END
  WHERE id = _message_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_team_message_pin(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_team_message_pin(uuid, boolean) TO authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Authenticated can upload chat attachments" ON storage.objects;
CREATE POLICY "Authenticated can upload chat attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments');

DROP POLICY IF EXISTS "Anyone can read chat attachments" ON storage.objects;
CREATE POLICY "Anyone can read chat attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-attachments');
