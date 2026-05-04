CREATE TABLE IF NOT EXISTS public.team_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('direct', 'room')),
  name text,
  direct_pair_key text UNIQUE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_conversations_direct_name_check CHECK (
    type = 'room' OR direct_pair_key IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS public.team_conversation_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.team_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_audio_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'stub_link',
  provider_call_id text NOT NULL,
  call_url text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_audio_call_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audio_call_id uuid NOT NULL REFERENCES public.team_audio_calls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  UNIQUE (audio_call_id, user_id, joined_at)
);

CREATE TABLE IF NOT EXISTS public.team_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('direct_message', 'room_message', 'audio_call_started')),
  title text NOT NULL,
  body text,
  related_entity_type text NOT NULL,
  related_entity_id uuid NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS team_conversation_members_user_idx
  ON public.team_conversation_members(user_id, conversation_id);
CREATE INDEX IF NOT EXISTS team_messages_conversation_created_idx
  ON public.team_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS team_notifications_user_unread_idx
  ON public.team_notifications(user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS team_audio_calls_conversation_started_idx
  ON public.team_audio_calls(conversation_id, started_at DESC);

ALTER TABLE public.team_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_audio_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_audio_call_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_notifications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_team_conversation_member(_conversation_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_conversation_members
    WHERE conversation_id = _conversation_id
      AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.team_conversation_created_by(_conversation_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_conversations
    WHERE id = _conversation_id
      AND created_by = _user_id
  );
$$;

DROP POLICY IF EXISTS "Members can read team conversations" ON public.team_conversations;
CREATE POLICY "Members can read team conversations"
  ON public.team_conversations FOR SELECT TO authenticated
  USING (public.is_team_conversation_member(id, auth.uid()));

DROP POLICY IF EXISTS "Authenticated can create team conversations" ON public.team_conversations;
CREATE POLICY "Authenticated can create team conversations"
  ON public.team_conversations FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Conversation owners can update rooms" ON public.team_conversations;
CREATE POLICY "Conversation owners can update rooms"
  ON public.team_conversations FOR UPDATE TO authenticated
  USING (public.is_team_conversation_member(id, auth.uid()))
  WITH CHECK (public.is_team_conversation_member(id, auth.uid()));

DROP POLICY IF EXISTS "Members can read team conversation members" ON public.team_conversation_members;
CREATE POLICY "Members can read team conversation members"
  ON public.team_conversation_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_team_conversation_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Creators can add team conversation members" ON public.team_conversation_members;
CREATE POLICY "Creators can add team conversation members"
  ON public.team_conversation_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.team_conversation_created_by(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Members can read team messages" ON public.team_messages;
CREATE POLICY "Members can read team messages"
  ON public.team_messages FOR SELECT TO authenticated
  USING (public.is_team_conversation_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Members can send own team messages" ON public.team_messages;
CREATE POLICY "Members can send own team messages"
  ON public.team_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.is_team_conversation_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Members can edit own team messages" ON public.team_messages;
CREATE POLICY "Members can edit own team messages"
  ON public.team_messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid() AND public.is_team_conversation_member(conversation_id, auth.uid()))
  WITH CHECK (sender_id = auth.uid() AND public.is_team_conversation_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Members can read team audio calls" ON public.team_audio_calls;
CREATE POLICY "Members can read team audio calls"
  ON public.team_audio_calls FOR SELECT TO authenticated
  USING (public.is_team_conversation_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Members can create team audio calls" ON public.team_audio_calls;
CREATE POLICY "Members can create team audio calls"
  ON public.team_audio_calls FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.is_team_conversation_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Call creators can end team audio calls" ON public.team_audio_calls;
CREATE POLICY "Call creators can end team audio calls"
  ON public.team_audio_calls FOR UPDATE TO authenticated
  USING (public.is_team_conversation_member(conversation_id, auth.uid()))
  WITH CHECK (public.is_team_conversation_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Members can read team call participants" ON public.team_audio_call_participants;
CREATE POLICY "Members can read team call participants"
  ON public.team_audio_call_participants FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_audio_calls c
      WHERE c.id = audio_call_id
        AND public.is_team_conversation_member(c.conversation_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can join team audio calls" ON public.team_audio_call_participants;
CREATE POLICY "Users can join team audio calls"
  ON public.team_audio_call_participants FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.team_audio_calls c
      WHERE c.id = audio_call_id
        AND public.is_team_conversation_member(c.conversation_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can leave own team audio calls" ON public.team_audio_call_participants;
CREATE POLICY "Users can leave own team audio calls"
  ON public.team_audio_call_participants FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read own team notifications" ON public.team_notifications;
CREATE POLICY "Users can read own team notifications"
  ON public.team_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own team notifications" ON public.team_notifications;
CREATE POLICY "Users can update own team notifications"
  ON public.team_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_team_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  conversation_type text;
  conversation_name text;
  sender_name text;
  notification_type text;
BEGIN
  SELECT type, COALESCE(name, 'Chat')
    INTO conversation_type, conversation_name
  FROM public.team_conversations
  WHERE id = NEW.conversation_id;

  SELECT COALESCE(e.name, p.full_name, split_part(u.email, '@', 1), 'Someone')
    INTO sender_name
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.employees e ON e.profile_id = u.id OR e.id = p.employee_id
  WHERE u.id = NEW.sender_id
  LIMIT 1;

  notification_type := CASE WHEN conversation_type = 'direct' THEN 'direct_message' ELSE 'room_message' END;

  INSERT INTO public.team_notifications (
    user_id,
    type,
    title,
    body,
    related_entity_type,
    related_entity_id
  )
  SELECT
    m.user_id,
    notification_type,
    CASE
      WHEN conversation_type = 'direct' THEN 'New direct message'
      ELSE 'New room message'
    END,
    sender_name || ': ' || left(NEW.body, 140),
    'team_message',
    NEW.id
  FROM public.team_conversation_members m
  WHERE m.conversation_id = NEW.conversation_id
    AND m.user_id <> NEW.sender_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_message_notify_trigger ON public.team_messages;
CREATE TRIGGER team_message_notify_trigger
AFTER INSERT ON public.team_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_team_message();

CREATE OR REPLACE FUNCTION public.notify_team_audio_call()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.team_notifications (
    user_id,
    type,
    title,
    body,
    related_entity_type,
    related_entity_id
  )
  SELECT
    m.user_id,
    'audio_call_started',
    'Audio call started',
    'Join when you are ready.',
    'team_audio_call',
    NEW.id
  FROM public.team_conversation_members m
  WHERE m.conversation_id = NEW.conversation_id
    AND m.user_id <> NEW.created_by;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_audio_call_notify_trigger ON public.team_audio_calls;
CREATE TRIGGER team_audio_call_notify_trigger
AFTER INSERT ON public.team_audio_calls
FOR EACH ROW
EXECUTE FUNCTION public.notify_team_audio_call();

CREATE OR REPLACE FUNCTION public.add_profile_to_default_team_room()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  room_id uuid;
BEGIN
  INSERT INTO public.team_conversations (type, name, created_by)
  VALUES ('room', 'Team Room', NEW.id)
  ON CONFLICT DO NOTHING;

  SELECT id INTO room_id
  FROM public.team_conversations
  WHERE type = 'room' AND name = 'Team Room'
  ORDER BY created_at
  LIMIT 1;

  IF room_id IS NOT NULL THEN
    INSERT INTO public.team_conversation_members (conversation_id, user_id, role)
    VALUES (room_id, NEW.id, 'member')
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS add_profile_to_default_team_room_trigger ON public.profiles;
CREATE TRIGGER add_profile_to_default_team_room_trigger
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.add_profile_to_default_team_room();

WITH first_profile AS (
  SELECT id FROM public.profiles ORDER BY created_at LIMIT 1
), default_room AS (
  INSERT INTO public.team_conversations (type, name, created_by)
  SELECT 'room', 'Team Room', id FROM first_profile
  WHERE NOT EXISTS (
    SELECT 1 FROM public.team_conversations WHERE type = 'room' AND name = 'Team Room'
  )
  RETURNING id
), room AS (
  SELECT id FROM default_room
  UNION ALL
  SELECT id FROM public.team_conversations WHERE type = 'room' AND name = 'Team Room' ORDER BY id LIMIT 1
)
INSERT INTO public.team_conversation_members (conversation_id, user_id, role)
SELECT room.id, profiles.id, 'member'
FROM room
CROSS JOIN public.profiles
ON CONFLICT (conversation_id, user_id) DO NOTHING;

ALTER PUBLICATION supabase_realtime ADD TABLE public.team_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_audio_calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_notifications;

CREATE OR REPLACE FUNCTION public.get_role_default_tabs(_role text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE lower(COALESCE(_role, ''))
    WHEN 'admin' THEN ARRAY['jobs','phone','sms','inbox','chat','customers','vendors','copilot','pay','admin']
    WHEN 'office' THEN ARRAY['jobs','phone','sms','inbox','chat','customers','vendors','copilot','pay']
    WHEN 'supervisor' THEN ARRAY['jobs','phone','sms','chat','customers','copilot','pay']
    WHEN 'tech' THEN ARRAY['jobs','phone','sms','chat','pay']
    WHEN 'installer' THEN ARRAY['jobs','pay']
    ELSE ARRAY['jobs','phone','sms','inbox','chat','customers','vendors','copilot','pay']
  END;
$$;

UPDATE public.employee_tab_access
SET allowed_tabs = array_append(allowed_tabs, 'chat'),
    updated_at = now()
WHERE is_custom = false
  AND NOT ('chat' = ANY(allowed_tabs));
