
-- chat_channels table
CREATE TABLE public.chat_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_channels_job_id_unique UNIQUE (job_id)
);

ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;

-- All authenticated can read channels
CREATE POLICY "Authenticated can read chat_channels"
  ON public.chat_channels FOR SELECT TO authenticated
  USING (true);

-- Admin/office can insert channels
CREATE POLICY "Admin office can insert chat_channels"
  ON public.chat_channels FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'office') OR
    public.has_role(auth.uid(), 'tech')
  );

-- chat_messages table
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  sender_name text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read chat_messages"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert own chat_messages"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- chat_read_cursors table
CREATE TABLE public.chat_read_cursors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_read_cursors_channel_user_unique UNIQUE (channel_id, user_id)
);

ALTER TABLE public.chat_read_cursors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own read_cursors"
  ON public.chat_read_cursors FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Enable realtime on chat_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- Seed the General channel
INSERT INTO public.chat_channels (name, job_id) VALUES ('General', NULL);
