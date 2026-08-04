-- Canonical task cancellation command.
-- Authorization, state change and recipient notifications happen atomically.
CREATE OR REPLACE FUNCTION public.cancel_task(_task_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  task_row public.tasks%ROWTYPE;
  canceller_name TEXT;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO task_row
  FROM public.tasks
  WHERE id = _task_id
    AND creator_id = actor
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'task not found';
  END IF;

  IF task_row.status = 'cancelled' THEN
    RETURN;
  END IF;

  SELECT trim(concat_ws(' ', first_name, last_name)) INTO canceller_name
  FROM public.profiles
  WHERE user_id = actor;

  UPDATE public.tasks
  SET status = 'cancelled'
  WHERE id = _task_id;

  INSERT INTO public.notifications (user_id, event_type, data, link)
  SELECT applicant_id,
    'task_cancelled'::public.notification_event,
    jsonb_build_object(
      'task_name', task_row.name,
      'task_id', task_row.id,
      'canceller_name', COALESCE(NULLIF(canceller_name, ''), 'מפרסם המטלה')
    ),
    '/tasks'
  FROM public.task_applications
  WHERE task_id = _task_id
    AND status = 'accepted'
    AND archived_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_task(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_task(UUID) TO authenticated;
