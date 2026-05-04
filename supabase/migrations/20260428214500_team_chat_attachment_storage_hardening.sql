UPDATE storage.buckets
SET public = false
WHERE id = 'chat-attachments';

DROP POLICY IF EXISTS "Anyone can read chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload chat attachments" ON storage.objects;

CREATE POLICY "Conversation members can upload chat attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = 'team'
    AND EXISTS (
      SELECT 1
      FROM public.team_conversation_members member
      WHERE member.conversation_id = ((storage.foldername(name))[2])::uuid
        AND member.user_id = auth.uid()
    )
  );

CREATE POLICY "Conversation members can read chat attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = 'team'
    AND EXISTS (
      SELECT 1
      FROM public.team_conversation_members member
      WHERE member.conversation_id = ((storage.foldername(name))[2])::uuid
        AND member.user_id = auth.uid()
    )
  );
