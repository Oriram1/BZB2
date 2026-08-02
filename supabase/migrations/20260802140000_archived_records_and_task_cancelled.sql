-- Soft-delete archive table
CREATE TABLE public.archived_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  record_data JSONB NOT NULL,
  archived_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX archived_records_table_record
  ON public.archived_records (table_name, record_id);

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.task_applications ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS tasks_active_idx ON public.tasks (creator_id, created_at DESC) WHERE archived_at IS NULL;

ALTER TABLE public.archived_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only service role inserts archives"
  ON public.archived_records FOR ALL USING (false);

-- notification event
ALTER TYPE public.notification_event ADD VALUE IF NOT EXISTS 'task_cancelled';

-- Helper: archive a row
CREATE OR REPLACE FUNCTION public.archive_record(
  _table TEXT,
  _record_id TEXT,
  _record_data JSONB,
  _user_id UUID
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.archived_records (table_name, record_id, record_data, archived_by)
  VALUES (_table, _record_id, _record_data, _user_id);
$$;

CREATE OR REPLACE FUNCTION public.archive_task(_task_id UUID, _user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  archived_at_value TIMESTAMPTZ := now();
BEGIN
  IF auth.uid() IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tasks WHERE id = _task_id AND creator_id = _user_id AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'task not found';
  END IF;
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
