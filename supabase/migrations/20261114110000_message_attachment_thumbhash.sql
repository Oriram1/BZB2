-- A tiny blurred preview (ThumbHash, base64, about 30 characters) of a chat
-- photo. The client paints it while the real image loads, so the bubble keeps its
-- colours and shape instead of popping in as an empty box.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_thumbhash text;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_attachment_thumbhash_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_attachment_thumbhash_check
  CHECK (attachment_thumbhash IS NULL OR (attachment_type = 'image' AND char_length(attachment_thumbhash) <= 128));
