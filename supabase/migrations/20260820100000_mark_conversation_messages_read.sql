-- Opening a conversation never actually cleared its unread badge: messages has
-- SELECT and INSERT policies but no UPDATE one, so the client's
-- update({read: true}) matched zero rows and failed silently. Granting a blanket
-- UPDATE policy would also let a participant rewrite message content, so the flag
-- is flipped through a narrow definer function instead.
CREATE OR REPLACE FUNCTION public.mark_conversation_messages_read(p_conversation_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  marked INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Only a participant may clear a conversation, and only the messages the other
  -- side sent: your own outgoing messages keep their read state for the recipient.
  IF NOT EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = p_conversation_id
      AND auth.uid() IN (c.participant_1, c.participant_2)
  ) THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;

  UPDATE public.messages
  SET read = true
  WHERE conversation_id = p_conversation_id
    AND read = false
    AND sender_id <> auth.uid();

  GET DIAGNOSTICS marked = ROW_COUNT;
  RETURN marked;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_conversation_messages_read(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_conversation_messages_read(UUID) TO authenticated;
