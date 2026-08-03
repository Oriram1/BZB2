-- The view counter never moved. The client updated tasks.views_count directly,
-- but RLS only lets the creator update their own task, so every visitor's write
-- silently affected zero rows — and the creator's own write was blocked anyway
-- by the immutable-columns trigger. The number on screen was never real.
--
-- Counting stays server-side, and counts PEOPLE, not page loads: one row per
-- (task, viewer), so refreshing does not inflate anything. Only signed-in
-- viewers are counted — an anonymous visitor cannot be told apart from the same
-- visitor returning — and the creator never counts as a view of their own task.
CREATE TABLE IF NOT EXISTS public.task_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, viewer_id)
);

-- No policies: this table is written and read only through the definer function
-- below. Clients have no direct access, so who-viewed-what is not browsable.
ALTER TABLE public.task_views ENABLE ROW LEVEL SECURITY;

-- views_count is a system column: not writable by clients, not even by the task
-- owner. record_task_view() is the one path allowed to move it, which it signals
-- with a transaction-local setting that no client can set on its own.
CREATE OR REPLACE FUNCTION public.prevent_client_system_column_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'profiles' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'immutable_profile_fields';
    END IF;
  ELSIF TG_TABLE_NAME = 'tasks' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.creator_id IS DISTINCT FROM OLD.creator_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR (NEW.views_count IS DISTINCT FROM OLD.views_count
           AND coalesce(current_setting('app.counting_view', true), 'off') <> 'on') THEN
      RAISE EXCEPTION 'immutable_task_fields';
    END IF;
  ELSIF TG_TABLE_NAME = 'task_applications' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.task_id IS DISTINCT FROM OLD.task_id
       OR NEW.applicant_id IS DISTINCT FROM OLD.applicant_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'immutable_application_fields';
    END IF;
  ELSIF TG_TABLE_NAME = 'messages' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
       OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'immutable_message_fields';
    END IF;
  ELSIF TG_TABLE_NAME = 'parent_links' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.parent_user_id IS DISTINCT FROM OLD.parent_user_id
       OR NEW.child_user_id IS DISTINCT FROM OLD.child_user_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'immutable_parent_link_fields';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_client_system_column_changes() FROM PUBLIC;

-- The return type changed after this function first shipped, so replacing it
-- is not enough.
DROP FUNCTION IF EXISTS public.record_task_view(UUID);

-- Returns the task's view count as it stands after the call, so the page can
-- show the true number instead of guessing whether this visit counted.
CREATE OR REPLACE FUNCTION public.record_task_view(_task_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  viewer UUID := auth.uid();
  inserted integer;
  current_count integer;
BEGIN
  SELECT coalesce(views_count, 0) INTO current_count
  FROM tasks WHERE id = _task_id AND archived_at IS NULL;

  IF NOT FOUND OR viewer IS NULL THEN
    RETURN current_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM tasks WHERE id = _task_id AND creator_id <> viewer
  ) THEN
    RETURN current_count;
  END IF;

  INSERT INTO task_views (task_id, viewer_id)
  VALUES (_task_id, viewer)
  ON CONFLICT (task_id, viewer_id) DO NOTHING;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted = 0 THEN
    RETURN current_count;
  END IF;

  PERFORM set_config('app.counting_view', 'on', true);
  UPDATE tasks SET views_count = current_count + 1 WHERE id = _task_id;
  PERFORM set_config('app.counting_view', 'off', true);

  RETURN current_count + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.record_task_view(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_task_view(UUID) TO authenticated, anon;
