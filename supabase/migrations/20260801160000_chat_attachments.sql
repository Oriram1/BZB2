-- Chat attachments: photos and voice notes, WhatsApp style.
--
-- Files live in a PRIVATE bucket: a voice note between two users is not public
-- content the way an avatar or a task photo is. The client reads them through
-- short-lived signed URLs.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_path TEXT,
  ADD COLUMN IF NOT EXISTS attachment_type TEXT,
  ADD COLUMN IF NOT EXISTS attachment_duration INTEGER;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_attachment_type_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_attachment_type_check
  CHECK (attachment_type IS NULL OR attachment_type IN ('image', 'audio'));

-- A photo or a voice note may carry no caption at all, so text stops being the
-- thing that makes a message valid — but a message still has to say something.
ALTER TABLE public.messages ALTER COLUMN content SET DEFAULT '';
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_have_content;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_have_content
  CHECK (content <> '' OR attachment_path IS NOT NULL);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media',
  'chat-media',
  false,
  26214400, -- 25 MB: a generous voice note, a phone photo before compression
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
    'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/wav'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Objects are stored as "<conversation_id>/<uuid>.<ext>", so the first path
-- segment is what ties a file to the two people allowed to see it.
CREATE OR REPLACE FUNCTION public.is_chat_media_participant(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id::text = (storage.foldername(object_name))[1]
      AND (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid())
  );
$$;

DROP POLICY IF EXISTS "Participants can upload chat media" ON storage.objects;
CREATE POLICY "Participants can upload chat media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-media' AND public.is_chat_media_participant(name));

DROP POLICY IF EXISTS "Participants can view chat media" ON storage.objects;
CREATE POLICY "Participants can view chat media"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'chat-media' AND public.is_chat_media_participant(name));

DROP POLICY IF EXISTS "Participants can delete chat media" ON storage.objects;
CREATE POLICY "Participants can delete chat media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chat-media' AND owner = auth.uid());
