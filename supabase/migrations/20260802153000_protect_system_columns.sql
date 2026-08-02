-- Protect system-owned columns when clients write directly through PostgREST.
-- RLS decides who may touch a row; these triggers decide which fields may be
-- changed by that owner. This closes the common "own row = edit everything"
-- authorization gap without requiring an immediate frontend rewrite.

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
       OR NEW.views_count IS DISTINCT FROM OLD.views_count THEN
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
      RAISE EXCEPTION 'immutable_link_fields';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_system_columns ON public.profiles;
CREATE TRIGGER protect_profile_system_columns
  BEFORE UPDATE ON public.profiles FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_system_column_changes();

DROP TRIGGER IF EXISTS protect_task_system_columns ON public.tasks;
CREATE TRIGGER protect_task_system_columns
  BEFORE UPDATE ON public.tasks FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_system_column_changes();

DROP TRIGGER IF EXISTS protect_application_system_columns ON public.task_applications;
CREATE TRIGGER protect_application_system_columns
  BEFORE UPDATE ON public.task_applications FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_system_column_changes();

DROP TRIGGER IF EXISTS protect_message_system_columns ON public.messages;
CREATE TRIGGER protect_message_system_columns
  BEFORE UPDATE ON public.messages FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_system_column_changes();

DROP TRIGGER IF EXISTS protect_parent_link_system_columns ON public.parent_links;
CREATE TRIGGER protect_parent_link_system_columns
  BEFORE UPDATE ON public.parent_links FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_system_column_changes();

REVOKE ALL ON FUNCTION public.prevent_client_system_column_changes() FROM PUBLIC;
