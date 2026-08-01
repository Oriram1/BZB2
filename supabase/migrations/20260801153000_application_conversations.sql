-- Keep one task conversation per task/participant pair and create it whenever
-- an application is accepted, regardless of which screen performed the update.

CREATE TEMP TABLE conversation_deduplication ON COMMIT DROP AS
SELECT
  id,
  FIRST_VALUE(id) OVER (
    PARTITION BY task_id, LEAST(participant_1, participant_2), GREATEST(participant_1, participant_2)
    ORDER BY created_at, id
  ) AS keeper_id,
  ROW_NUMBER() OVER (
    PARTITION BY task_id, LEAST(participant_1, participant_2), GREATEST(participant_1, participant_2)
    ORDER BY created_at, id
  ) AS duplicate_number
FROM public.conversations
WHERE task_id IS NOT NULL;

UPDATE public.messages AS message
SET conversation_id = duplicate.keeper_id
FROM conversation_deduplication AS duplicate
WHERE duplicate.duplicate_number > 1
  AND message.conversation_id = duplicate.id;

DELETE FROM public.conversations AS conversation
USING conversation_deduplication AS duplicate
WHERE duplicate.duplicate_number > 1
  AND conversation.id = duplicate.id;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_task_participants_unique
  ON public.conversations (
    task_id,
    LEAST(participant_1, participant_2),
    GREATEST(participant_1, participant_2)
  )
  WHERE task_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ensure_accepted_task_conversation(
  _task_id UUID,
  _applicant_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task_creator_id UUID;
  conversation_id UUID;
BEGIN
  SELECT task.creator_id INTO task_creator_id
  FROM public.tasks AS task
  WHERE task.id = _task_id;

  IF task_creator_id IS NULL OR auth.uid() NOT IN (task_creator_id, _applicant_id) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.task_applications
    WHERE task_id = _task_id
      AND applicant_id = _applicant_id
      AND status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'application_not_accepted';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_task_id::TEXT || ':' || _applicant_id::TEXT, 0));

  SELECT id INTO conversation_id
  FROM public.conversations
  WHERE task_id = _task_id
    AND (
      (participant_1 = task_creator_id AND participant_2 = _applicant_id)
      OR (participant_1 = _applicant_id AND participant_2 = task_creator_id)
    )
  ORDER BY created_at
  LIMIT 1;

  IF conversation_id IS NULL THEN
    INSERT INTO public.conversations (task_id, participant_1, participant_2)
    VALUES (_task_id, task_creator_id, _applicant_id)
    RETURNING id INTO conversation_id;
  END IF;

  RETURN conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_accepted_task_conversation(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_accepted_task_conversation(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.on_application_accepted_create_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.ensure_accepted_task_conversation(NEW.task_id, NEW.applicant_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_application_accepted_conversation ON public.task_applications;
CREATE TRIGGER task_application_accepted_conversation
  AFTER UPDATE OF status ON public.task_applications
  FOR EACH ROW EXECUTE FUNCTION public.on_application_accepted_create_conversation();

CREATE OR REPLACE FUNCTION public.get_worker_completed_task_count(_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.task_applications AS application
  JOIN public.tasks AS task ON task.id = application.task_id
  WHERE application.applicant_id = _user_id
    AND application.status = 'accepted'
    AND task.status = 'completed';
$$;

GRANT EXECUTE ON FUNCTION public.get_worker_completed_task_count(UUID) TO anon, authenticated;

-- Existing unread and future application notifications now deep-link to the
-- approval queue instead of the read-only task detail screen.
UPDATE public.notifications
SET link = '/my-tasks?tab=applications&task=' || (data->>'task_id') || '&application=' || (data->>'application_id')
WHERE event_type = 'application_received'
  AND data ? 'task_id'
  AND data ? 'application_id';

CREATE OR REPLACE FUNCTION public.on_application_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task_row public.tasks%ROWTYPE;
  applicant_name TEXT;
BEGIN
  SELECT * INTO task_row FROM public.tasks WHERE id = NEW.task_id;
  IF task_row.id IS NULL OR task_row.creator_id = NEW.applicant_id THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(TRIM(first_name || ' ' || last_name), '') INTO applicant_name
    FROM public.profiles WHERE user_id = NEW.applicant_id;

  PERFORM public.enqueue_notification(
    task_row.creator_id,
    'application_received',
    jsonb_build_object(
      'task_id', task_row.id,
      'task_name', task_row.name,
      'applicant_name', COALESCE(applicant_name, 'מועמד'),
      'application_id', NEW.id
    ),
    '/my-tasks?tab=applications&task=' || task_row.id || '&application=' || NEW.id
  );

  RETURN NEW;
END;
$$;
