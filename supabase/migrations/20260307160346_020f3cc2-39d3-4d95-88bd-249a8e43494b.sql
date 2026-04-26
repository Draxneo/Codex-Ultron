
-- Add description to channels
ALTER TABLE chat_channels ADD COLUMN description text;

-- Add edit/delete/attachments/pinning support to messages
ALTER TABLE chat_messages ADD COLUMN edited_at timestamptz;
ALTER TABLE chat_messages ADD COLUMN is_deleted boolean NOT NULL DEFAULT false;
ALTER TABLE chat_messages ADD COLUMN attachments jsonb DEFAULT '[]';
ALTER TABLE chat_messages ADD COLUMN is_pinned boolean NOT NULL DEFAULT false;
ALTER TABLE chat_messages ADD COLUMN pinned_by text;

-- RLS: allow users to update own messages
CREATE POLICY "Users can update own messages" ON chat_messages
  FOR UPDATE TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RLS: allow admins to update any message (for pinning/deleting)
CREATE POLICY "Admins can update any message" ON chat_messages
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS: allow admins to delete messages
CREATE POLICY "Admins can delete messages" ON chat_messages
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow channel updates (for description edits)
CREATE POLICY "Admins can update chat_channels" ON chat_channels
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'office'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'office'::app_role));

-- Reactions table
CREATE TABLE chat_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);
ALTER TABLE chat_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read reactions" ON chat_reactions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can add own reactions" ON chat_reactions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can remove own reactions" ON chat_reactions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Enable realtime for reactions
ALTER PUBLICATION supabase_realtime ADD TABLE chat_reactions;

-- Storage bucket for chat attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-attachments', 'chat-attachments', true);

-- Storage RLS for chat-attachments
CREATE POLICY "Authenticated can upload chat attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments');
CREATE POLICY "Anyone can read chat attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-attachments');
