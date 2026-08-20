-- Full tasks stayed in the public feed: the client counted accepted applications
-- itself, but RLS on task_applications only exposes rows to the applicant and the
-- task creator, so every other visitor counted 0 and no task ever looked full.
-- Denormalising the count onto tasks (which everyone may read) fixes the filter and
-- drops the per-task count query the feed used to fire.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS accepted_count INTEGER NOT NULL DEFAULT 0;

UPDATE public.tasks t
SET accepted_count = COALESCE((
  SELECT COUNT(*)
  FROM public.task_applications a
  WHERE a.task_id = t.id
    AND a.status = 'accepted'
    AND a.archived_at IS NULL
), 0);

-- Recomputes rather than increments: an application can move in and out of
-- 'accepted' and in and out of archived, and a full recount cannot drift.
CREATE OR REPLACE FUNCTION public.sync_task_accepted_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  affected UUID;
BEGIN
  PERFORM set_config('app.sync_accepted_count', 'on', true);

  FOREACH affected IN ARRAY (
    CASE
      WHEN TG_OP = 'INSERT' THEN ARRAY[NEW.task_id]
      WHEN TG_OP = 'DELETE' THEN ARRAY[OLD.task_id]
      WHEN NEW.task_id IS DISTINCT FROM OLD.task_id THEN ARRAY[NEW.task_id, OLD.task_id]
      ELSE ARRAY[NEW.task_id]
    END
  )
  LOOP
    UPDATE public.tasks t
    SET accepted_count = COALESCE((
      SELECT COUNT(*)
      FROM public.task_applications a
      WHERE a.task_id = affected
        AND a.status = 'accepted'
        AND a.archived_at IS NULL
    ), 0)
    WHERE t.id = affected
      AND t.accepted_count IS DISTINCT FROM COALESCE((
        SELECT COUNT(*)
        FROM public.task_applications a
        WHERE a.task_id = affected
          AND a.status = 'accepted'
          AND a.archived_at IS NULL
      ), 0);
  END LOOP;

  PERFORM set_config('app.sync_accepted_count', 'off', true);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS task_applications_sync_accepted_count ON public.task_applications;
CREATE TRIGGER task_applications_sync_accepted_count
AFTER INSERT OR UPDATE OR DELETE ON public.task_applications
FOR EACH ROW EXECUTE FUNCTION public.sync_task_accepted_count();

-- accepted_count joins views_count as a server-owned column: writable only from the
-- trigger above, which announces itself through app.sync_accepted_count.
CREATE OR REPLACE FUNCTION public.prevent_client_system_column_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
           AND coalesce(current_setting('app.counting_view', true), 'off') <> 'on')
       OR (NEW.accepted_count IS DISTINCT FROM OLD.accepted_count
           AND coalesce(current_setting('app.sync_accepted_count', true), 'off') <> 'on') THEN
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
