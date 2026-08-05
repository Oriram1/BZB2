-- A task carries workers_needed, but nothing ever counted against it: the
-- approval screen let a tasker accept a fifth candidate onto a one-person job.
-- The screen now shows "2/3 נבחרו" and stops offering approval when full; this
-- is the half that a screen cannot be trusted to enforce.
CREATE OR REPLACE FUNCTION public.enforce_task_worker_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  needed INTEGER;
  taken INTEGER;
BEGIN
  IF NEW.status <> 'accepted' OR OLD.status = 'accepted' THEN
    RETURN NEW;
  END IF;

  -- Locking the task serialises two approvals racing for the last position;
  -- counting without it lets both read "1 of 2 taken" and both succeed.
  SELECT workers_needed INTO needed
  FROM public.tasks
  WHERE id = NEW.task_id
  FOR UPDATE;

  IF needed IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO taken
  FROM public.task_applications
  WHERE task_id = NEW.task_id
    AND status = 'accepted'
    AND archived_at IS NULL
    AND id <> NEW.id;

  IF taken >= needed THEN
    RAISE EXCEPTION 'task_positions_full';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_worker_capacity ON public.task_applications;
CREATE TRIGGER enforce_worker_capacity
  BEFORE UPDATE OF status ON public.task_applications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_task_worker_capacity();
