-- The first version of this check passed when attachment_type was NULL, because
-- a NULL comparison makes CHECK succeed. A preview hash is only valid on a photo.
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_attachment_thumbhash_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_attachment_thumbhash_check
  CHECK (
    attachment_thumbhash IS NULL
    OR (COALESCE(attachment_type = 'image', false) AND char_length(attachment_thumbhash) <= 128)
  );
