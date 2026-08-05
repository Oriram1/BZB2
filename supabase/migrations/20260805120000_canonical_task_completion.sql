-- Canonical task completion command.
--
-- Nothing in the app ever moved a task to 'completed', which left three things
-- permanently wrong: a bee's earnings never accrued (the profile sums payment
-- over completed tasks only), the completed-task count that taskers see beside
-- each candidate stayed at zero, and the on_task_completed trigger below —
-- which already knows how to send payment receipts — was unreachable code.
--
-- Shaped like cancel_task: authorization, the state change and the receipts all
-- happen in one transaction, so no screen can perform half of it.

CREATE OR REPLACE FUNCTION public.complete_task(_task_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  task_row public.tasks%ROWTYPE;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Only whoever published the task may close it: they are the side that knows
  -- the work was delivered and the money handed over.
  SELECT * INTO task_row
  FROM public.tasks
  WHERE id = _task_id
    AND creator_id = actor
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'task not found';
  END IF;

  -- Idempotent: a double tap must not enqueue a second set of receipts.
  IF task_row.status = 'completed' THEN
    RETURN;
  END IF;

  IF task_row.status = 'cancelled' THEN
    RAISE EXCEPTION 'task_cancelled';
  END IF;

  -- Completion is what credits a bee, so it needs a bee to credit. Without this
  -- check a task closed before anyone was accepted would raise the tasker's own
  -- completed tally while paying nobody.
  IF NOT EXISTS (
    SELECT 1
    FROM public.task_applications
    WHERE task_id = _task_id
      AND status = 'accepted'
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'no_accepted_worker';
  END IF;

  UPDATE public.tasks
  SET status = 'completed'
  WHERE id = _task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_task(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_task(UUID) TO authenticated;

-- 'completed' is a terminal state, and cancel_task predates it. Cancelling out
-- of a completed task would silently strip earnings the bee's profile already
-- counts and receipts both sides already received.
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

  IF task_row.status = 'completed' THEN
    RAISE EXCEPTION 'task_completed';
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

-- The receipt trigger stops being dead code the moment complete_task ships, so
-- its one gap now matters: an application that was archived (the tasker deleted
-- it) must not be told it just earned money. cancel_task already filters the
-- same way.
CREATE OR REPLACE FUNCTION public.on_task_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  worker_id UUID;
  payload JSONB;
BEGIN
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  payload := jsonb_build_object(
    'task_id', NEW.id,
    'task_name', NEW.name,
    'payment', NEW.payment,
    'payment_type', NEW.payment_type
  );

  PERFORM public.enqueue_notification(NEW.creator_id, 'task_completed', payload, '/task/' || NEW.id);

  FOR worker_id IN
    SELECT applicant_id FROM public.task_applications
    WHERE task_id = NEW.id
      AND status = 'accepted'
      AND archived_at IS NULL
  LOOP
    PERFORM public.enqueue_notification(worker_id, 'task_completed', payload, '/task/' || NEW.id);
  END LOOP;

  RETURN NEW;
END;
$$;
