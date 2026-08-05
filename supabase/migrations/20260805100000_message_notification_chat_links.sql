-- Deep-link message notifications to the exact conversation.
UPDATE public.notifications
SET link = '/chat?conversation=' || (data->>'conversation_id')
WHERE event_type = 'message_received'
  AND data ? 'conversation_id';

CREATE OR REPLACE FUNCTION public.on_message_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conversation_row public.conversations%ROWTYPE;
  recipient_id UUID;
  sender_name TEXT;
BEGIN
  SELECT * INTO conversation_row
  FROM public.conversations
  WHERE id = NEW.conversation_id;

  IF conversation_row.id IS NULL THEN RETURN NEW; END IF;

  recipient_id := CASE
    WHEN conversation_row.participant_1 = NEW.sender_id THEN conversation_row.participant_2
    ELSE conversation_row.participant_1
  END;

  IF recipient_id IS NULL OR recipient_id = NEW.sender_id THEN RETURN NEW; END IF;

  SELECT NULLIF(TRIM(first_name || ' ' || last_name), '') INTO sender_name
  FROM public.profiles
  WHERE user_id = NEW.sender_id;

  PERFORM public.enqueue_notification(
    recipient_id,
    'message_received',
    jsonb_build_object(
      'conversation_id', conversation_row.id,
      'sender_name', COALESCE(sender_name, 'משתמש'),
      'message_content', NULLIF(TRIM(NEW.content), '')
    ),
    '/chat?conversation=' || conversation_row.id
  );

  RETURN NEW;
END;
$$;
