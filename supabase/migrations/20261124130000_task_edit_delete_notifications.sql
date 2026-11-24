-- Applicants hear about it when a task they applied to is edited or deleted.
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'task_edited';
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'task_deleted';

-- Owner edits a task. Update, diff and notifications are one atomic command, so
-- an applicant is never told about a change that did not land (or vice versa).
CREATE OR REPLACE FUNCTION public.update_task_details(
  _task_id UUID,
  _name TEXT,
  _short_desc TEXT,
  _full_desc TEXT,
  _payment NUMERIC,
  _location TEXT,
  _notes TEXT,
  _scheduled_date DATE,
  _scheduled_time TIME,
  _duration_hours NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  old_row public.tasks%ROWTYPE;
  editor_name TEXT;
  changes JSONB := '[]'::jsonb;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO old_row
  FROM public.tasks
  WHERE id = _task_id AND creator_id = actor AND archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'task not found';
  END IF;

  IF old_row.name IS DISTINCT FROM _name THEN
    changes := changes || jsonb_build_object('label', 'שם המטלה', 'from', old_row.name, 'to', _name);
  END IF;
  IF old_row.short_desc IS DISTINCT FROM _short_desc THEN
    changes := changes || jsonb_build_object('label', 'תיאור קצר', 'from', old_row.short_desc, 'to', _short_desc);
  END IF;
  IF old_row.full_desc IS DISTINCT FROM _full_desc THEN
    changes := changes || jsonb_build_object('label', 'תיאור מלא', 'from', old_row.full_desc, 'to', _full_desc);
  END IF;
  IF old_row.payment IS DISTINCT FROM _payment THEN
    changes := changes || jsonb_build_object('label', 'תשלום', 'from', old_row.payment::text, 'to', _payment::text);
  END IF;
  IF old_row.location IS DISTINCT FROM _location THEN
    changes := changes || jsonb_build_object('label', 'מיקום', 'from', old_row.location, 'to', _location);
  END IF;
  IF old_row.scheduled_date IS DISTINCT FROM _scheduled_date THEN
    changes := changes || jsonb_build_object('label', 'תאריך', 'from', old_row.scheduled_date::text, 'to', _scheduled_date::text);
  END IF;
  IF old_row.scheduled_time IS DISTINCT FROM _scheduled_time THEN
    changes := changes || jsonb_build_object('label', 'שעה', 'from', left(old_row.scheduled_time::text, 5), 'to', left(_scheduled_time::text, 5));
  END IF;
  IF old_row.duration_hours IS DISTINCT FROM _duration_hours THEN
    changes := changes || jsonb_build_object(
      'label', 'משך (ימים)',
      'from', (old_row.duration_hours / 24)::text,
      'to', (_duration_hours / 24)::text
    );
  END IF;
  IF old_row.notes IS DISTINCT FROM _notes THEN
    changes := changes || jsonb_build_object('label', 'הערות', 'from', old_row.notes, 'to', _notes);
  END IF;

  UPDATE public.tasks
  SET name = _name,
      short_desc = _short_desc,
      full_desc = _full_desc,
      payment = _payment,
      location = _location,
      notes = _notes,
      scheduled_date = _scheduled_date,
      scheduled_time = _scheduled_time,
      duration_hours = _duration_hours
  WHERE id = _task_id;

  IF jsonb_array_length(changes) = 0 THEN
    RETURN;
  END IF;

  SELECT trim(concat_ws(' ', first_name, last_name)) INTO editor_name
  FROM public.profiles WHERE user_id = actor;

  INSERT INTO public.notifications (user_id, event_type, data, link)
  SELECT applicant_id,
    'task_edited'::public.notification_event,
    jsonb_build_object(
      'task_id', _task_id,
      'task_name', _name,
      'editor_name', COALESCE(NULLIF(editor_name, ''), 'מפרסם המטלה'),
      'changes', changes
    ),
    '/task/' || _task_id::text || '?review_edit=1'
  FROM public.task_applications
  WHERE task_id = _task_id
    AND status IN ('pending', 'accepted')
    AND archived_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.update_task_details(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, DATE, TIME, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_task_details(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, DATE, TIME, NUMERIC) TO authenticated;

-- Applicant answers an edit: staying changes nothing, leaving archives their
-- own application (the same soft-delete the rest of the app uses).
CREATE OR REPLACE FUNCTION public.withdraw_application(_task_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.task_applications
  SET archived_at = now()
  WHERE task_id = _task_id
    AND applicant_id = actor
    AND archived_at IS NULL
    AND status IN ('pending', 'accepted');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'application not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_application(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_application(UUID) TO authenticated;

-- Deleting (archiving) a task tells everyone who applied. Same body as before,
-- plus the notifications, taken before the applications are archived.
CREATE OR REPLACE FUNCTION public.archive_task(_task_id UUID, _user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  archived_at_value TIMESTAMPTZ := now();
  task_name_value TEXT;
BEGIN
  IF auth.uid() IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT name INTO task_name_value
  FROM tasks WHERE id = _task_id AND creator_id = _user_id AND archived_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'task not found';
  END IF;

  INSERT INTO notifications (user_id, event_type, data, link)
  SELECT applicant_id,
    'task_deleted'::public.notification_event,
    jsonb_build_object('task_id', _task_id, 'task_name', task_name_value),
    '/tasks'
  FROM task_applications
  WHERE task_id = _task_id
    AND status IN ('pending', 'accepted')
    AND archived_at IS NULL;

  INSERT INTO archived_records (table_name, record_id, record_data, archived_by)
    SELECT 'task_applications', id::text, to_jsonb(task_applications), _user_id
    FROM task_applications WHERE task_id = _task_id AND archived_at IS NULL;
  INSERT INTO archived_records (table_name, record_id, record_data, archived_by)
    SELECT 'tasks', id::text, to_jsonb(tasks), _user_id
    FROM tasks WHERE id = _task_id;
  UPDATE task_applications SET archived_at = archived_at_value WHERE task_id = _task_id;
  UPDATE tasks SET archived_at = archived_at_value WHERE id = _task_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.archive_task(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_task(UUID, UUID) TO authenticated;
