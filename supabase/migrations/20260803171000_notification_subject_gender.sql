-- Notifications name a third party — the applicant, the child, the sender —
-- and Hebrew inflects the verb that follows. The payload already freezes that
-- person's NAME at the moment of the event, because a name read at send time
-- could have changed since. Their gender belongs in exactly the same place, for
-- exactly the same reason, and it costs nothing: every one of these triggers is
-- already SELECTing from profiles to get the name.
--
-- Only events that actually name someone carry a gender. 'task_completed' and
-- 'application_decided' describe a task, not a person, so they gain nothing.

-- Applicant applied to my task. This function is redefined here from its
-- 20260801153000 version, which added the deep link into the application.
CREATE OR REPLACE FUNCTION public.on_application_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task_row public.tasks%ROWTYPE;
  applicant_name TEXT;
  applicant_gender public.gender;
BEGIN
  SELECT * INTO task_row FROM public.tasks WHERE id = NEW.task_id;
  IF task_row.id IS NULL OR task_row.creator_id = NEW.applicant_id THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(TRIM(first_name || ' ' || last_name), ''), gender
    INTO applicant_name, applicant_gender
    FROM public.profiles WHERE user_id = NEW.applicant_id;

  PERFORM public.enqueue_notification(
    task_row.creator_id,
    'application_received',
    jsonb_build_object(
      'task_id', task_row.id,
      'task_name', task_row.name,
      'applicant_name', COALESCE(applicant_name, 'מועמד'),
      'applicant_gender', COALESCE(applicant_gender, 'unspecified'),
      'application_id', NEW.id
    ),
    '/my-tasks?tab=applications&task=' || task_row.id || '&application=' || NEW.id
  );

  RETURN NEW;
END;
$$;

-- My application was accepted or rejected; parents hear about acceptances.
CREATE OR REPLACE FUNCTION public.on_application_decided()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task_row public.tasks%ROWTYPE;
  child_name TEXT;
  child_gender public.gender;
  parent_id UUID;
BEGIN
  IF NEW.status = OLD.status OR NEW.status = 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO task_row FROM public.tasks WHERE id = NEW.task_id;
  IF task_row.id IS NULL THEN RETURN NEW; END IF;

  PERFORM public.enqueue_notification(
    NEW.applicant_id,
    'application_decided',
    jsonb_build_object(
      'task_id', task_row.id,
      'task_name', task_row.name,
      'status', NEW.status
    ),
    '/task/' || task_row.id
  );

  -- Acceptance means the child is about to go out and work: parents get told
  -- immediately rather than waiting for the evening digest.
  IF NEW.status = 'accepted' THEN
    SELECT NULLIF(TRIM(first_name || ' ' || last_name), ''), gender
      INTO child_name, child_gender
      FROM public.profiles WHERE user_id = NEW.applicant_id;

    FOR parent_id IN
      SELECT parent_user_id FROM public.parent_links WHERE child_user_id = NEW.applicant_id
    LOOP
      PERFORM public.enqueue_notification(
        parent_id,
        'parent_child_accepted',
        jsonb_build_object(
          'task_id', task_row.id,
          'task_name', task_row.name,
          'child_name', child_name,
          'child_gender', COALESCE(child_gender, 'unspecified'),
          'location', task_row.location,
          'scheduled_date', task_row.scheduled_date,
          'scheduled_time', task_row.scheduled_time
        ),
        '/parent'
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- Someone sent me a message.
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
  sender_gender public.gender;
BEGIN
  SELECT * INTO conversation_row FROM public.conversations WHERE id = NEW.conversation_id;
  IF conversation_row.id IS NULL THEN RETURN NEW; END IF;

  recipient_id := CASE
    WHEN conversation_row.participant_1 = NEW.sender_id THEN conversation_row.participant_2
    ELSE conversation_row.participant_1
  END;

  IF recipient_id IS NULL OR recipient_id = NEW.sender_id THEN RETURN NEW; END IF;

  SELECT NULLIF(TRIM(first_name || ' ' || last_name), ''), gender
    INTO sender_name, sender_gender
    FROM public.profiles WHERE user_id = NEW.sender_id;

  PERFORM public.enqueue_notification(
    recipient_id,
    'message_received',
    jsonb_build_object(
      'conversation_id', conversation_row.id,
      'sender_name', COALESCE(sender_name, 'משתמש'),
      'sender_gender', COALESCE(sender_gender, 'unspecified')
    ),
    '/chat'
  );

  RETURN NEW;
END;
$$;
