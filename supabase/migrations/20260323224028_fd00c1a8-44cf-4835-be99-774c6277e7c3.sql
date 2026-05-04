
ALTER TABLE public.chat_messages ADD COLUMN reply_to_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL;

CREATE TABLE public.chat_huddles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES public.chat_channels(id) ON DELETE CASCADE NOT NULL,
  started_by uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  participant_ids uuid[] DEFAULT '{}'
);

ALTER TABLE public.chat_huddles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view huddles" ON public.chat_huddles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert huddles" ON public.chat_huddles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update huddles" ON public.chat_huddles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_huddles;
