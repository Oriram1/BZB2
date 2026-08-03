-- Two authorization gaps around tasks.
--
-- 1. Task creation was gated in the client only. The /create-task route checks
--    for the 'tasker' role, but the INSERT policy checked nothing beyond
--    "you are who you say you are" — so any authenticated account could create
--    a task straight through the API. Two 'bee' accounts already had.
DROP POLICY IF EXISTS "Taskers can create tasks" ON public.tasks;

CREATE POLICY "Taskers can create tasks"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = creator_id AND private.has_role(auth.uid(), 'tasker'));

-- 2. Admins need to remove any task, but ONLY from the admin screen. This is a
--    separate entry point on purpose: archive_task() still requires the caller
--    to be the task's creator, so the buttons on a task's own page stay
--    owner-only and an admin browsing someone else's task gets nothing extra.
--    Every call here is written to the admin audit log.
CREATE OR REPLACE FUNCTION public.admin_archive_task(_task_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id UUID := auth.uid();
  archived_at_value TIMESTAMPTZ := now();
  task_row public.tasks;
BEGIN
  IF admin_id IS NULL OR NOT private.has_role(admin_id, 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO task_row FROM tasks WHERE id = _task_id AND archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'task not found';
  END IF;

  INSERT INTO archived_records (table_name, record_id, record_data, archived_by)
    SELECT 'task_applications', id::text, to_jsonb(task_applications), admin_id
    FROM task_applications WHERE task_id = _task_id AND archived_at IS NULL;
  INSERT INTO archived_records (table_name, record_id, record_data, archived_by)
    VALUES ('tasks', _task_id::text, to_jsonb(task_row), admin_id);

  UPDATE task_applications SET archived_at = archived_at_value WHERE task_id = _task_id;
  UPDATE tasks SET archived_at = archived_at_value WHERE id = _task_id;

  INSERT INTO admin_audit_log (admin_user_id, action, target_user_id, target_identifier, success, details)
  VALUES (
    admin_id,
    'admin_deleted_task',
    task_row.creator_id,
    task_row.name,
    true,
    jsonb_build_object('task_id', _task_id, 'task_name', task_row.name, 'status', task_row.status)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_archive_task(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_archive_task(UUID) TO authenticated;
