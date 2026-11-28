-- Pausing hides a listing without cancelling the work, changing billing or losing applications.
ALTER TABLE public.tasks ADD COLUMN paused_at timestamptz;

-- Only the checked command below may change the pause flag from a client session.
CREATE FUNCTION private.protect_task_pause() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE claims jsonb := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
BEGIN
  IF claims->>'role' IN ('authenticated', 'anon')
     AND COALESCE(current_setting('app.task_pause_write', true), '') <> '1'
     AND ((TG_OP = 'INSERT' AND NEW.paused_at IS NOT NULL)
       OR (TG_OP = 'UPDATE' AND NEW.paused_at IS DISTINCT FROM OLD.paused_at)) THEN
    RAISE EXCEPTION 'pause_command_required';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.protect_task_pause() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER protect_task_pause BEFORE INSERT OR UPDATE OF paused_at ON public.tasks
FOR EACH ROW EXECUTE FUNCTION private.protect_task_pause();

CREATE FUNCTION public.set_task_paused(_task_id uuid, _paused boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item public.tasks;
BEGIN
  IF auth.uid() IS NULL OR _paused IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO item FROM public.tasks WHERE id = _task_id AND creator_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'task not found'; END IF;
  IF item.status <> 'open' OR item.archived_at IS NOT NULL THEN RAISE EXCEPTION 'task_not_open'; END IF;
  IF _paused AND (item.publish_state <> 'live' OR item.screening <> 'clean') THEN RAISE EXCEPTION 'task_not_published'; END IF;
  PERFORM set_config('app.task_pause_write', '1', true);
  UPDATE public.tasks SET paused_at = CASE WHEN _paused THEN COALESCE(paused_at, now()) ELSE NULL END WHERE id = _task_id;
  PERFORM set_config('app.task_pause_write', '0', true);
END;
$$;
REVOKE ALL ON FUNCTION public.set_task_paused(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_task_paused(uuid, boolean) TO authenticated;

-- Existing applicants retain access while new viewers cannot see the listing.
-- The helper avoids a cycle between task and application RLS policies.
CREATE FUNCTION private.is_task_applicant(_task_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.task_applications WHERE task_id = _task_id AND applicant_id = (SELECT auth.uid()) AND archived_at IS NULL);
$$;
REVOKE ALL ON FUNCTION private.is_task_applicant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_task_applicant(uuid) TO authenticated, service_role;

DROP POLICY "Public live tasks" ON public.tasks;
CREATE POLICY "Public live tasks" ON public.tasks FOR SELECT TO anon
  USING (publish_state = 'live' AND screening = 'clean' AND paused_at IS NULL);
DROP POLICY "Authenticated visible tasks" ON public.tasks;
CREATE POLICY "Authenticated visible tasks" ON public.tasks FOR SELECT TO authenticated
  USING ((publish_state = 'live' AND screening = 'clean' AND (paused_at IS NULL OR private.is_task_applicant(id)))
         OR (SELECT auth.uid()) = creator_id OR private.has_role((SELECT auth.uid()), 'admin'));

CREATE OR REPLACE FUNCTION private.task_is_live(_task_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tasks WHERE id = _task_id AND publish_state = 'live' AND screening = 'clean'
    AND paused_at IS NULL AND status = 'open' AND archived_at IS NULL);
$$;

-- Lock the task until the insert finishes so a concurrent pause cannot race it.
CREATE OR REPLACE FUNCTION public.block_apply_unscreened() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item public.tasks;
BEGIN
  SELECT * INTO item FROM public.tasks WHERE id = NEW.task_id FOR SHARE;
  IF NOT FOUND OR item.screening <> 'clean' OR item.publish_state <> 'live'
     OR item.paused_at IS NOT NULL OR item.status <> 'open' OR item.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'task_not_available' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

-- Return only paused IDs that the current user is already permitted to read.
CREATE FUNCTION public.visible_paused_task_ids(_task_ids uuid[]) RETURNS uuid[]
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) FROM public.tasks
  WHERE id = ANY(_task_ids) AND paused_at IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.visible_paused_task_ids(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.visible_paused_task_ids(uuid[]) TO authenticated;
