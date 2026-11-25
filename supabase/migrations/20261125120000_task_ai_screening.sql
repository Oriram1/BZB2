-- Automatic safety screen for tasks (minors' platform).
--
-- Every new or edited task is checked by the task-screen function (Gemini):
--   clean   -> visible to bees as usual
--   flagged -> hidden until an admin decides ("waiting for approval")
--   blocked -> hidden; the owner sees the reason, an admin can still release it
-- Anything the screen cannot decide stays pending_ai and hidden: fail closed.
-- Works next to publish_state (billing/admin queue); a task is public only when
-- publish_state = 'live' AND screening = 'clean'.
ALTER TABLE public.tasks
  ADD COLUMN screening text NOT NULL DEFAULT 'pending_ai'
    CHECK (screening IN ('pending_ai', 'clean', 'flagged', 'blocked')),
  ADD COLUMN screening_reason text CHECK (char_length(screening_reason) <= 300),
  ADD COLUMN screened_at timestamptz;

-- Tasks that already exist were published before this screen.
UPDATE public.tasks SET screening = 'clean';

-- Clients never choose their own result, and edits to the text are screened again.
CREATE FUNCTION public.task_force_screening() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  claims jsonb := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
BEGIN
  IF claims->>'role' IS DISTINCT FROM 'authenticated' AND claims->>'role' IS DISTINCT FROM 'anon'
     OR COALESCE(current_setting('app.task_screen_write', true), '') = '1' THEN
    RETURN NEW; -- service role / system: trusted
  END IF;
  IF TG_OP = 'INSERT'
     OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW.short_desc IS DISTINCT FROM OLD.short_desc
     OR NEW.full_desc IS DISTINCT FROM OLD.full_desc
     OR NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.category IS DISTINCT FROM OLD.category THEN
    NEW.screening := 'pending_ai';
    NEW.screening_reason := NULL;
    NEW.screened_at := NULL;
  ELSE
    NEW.screening := OLD.screening;
    NEW.screening_reason := OLD.screening_reason;
    NEW.screened_at := OLD.screened_at;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.task_force_screening() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER task_force_screening BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.task_force_screening();

-- Ask the edge function to screen a task (same pattern as review-screen).
CREATE FUNCTION private.request_task_screening(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, vault AS $$
DECLARE target text; secret text;
BEGIN
  SELECT decrypted_secret INTO target FROM vault.decrypted_secrets WHERE name = 'task_screen_url';
  SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name = 'notify_dispatch_secret';
  IF target IS NULL OR secret IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(url := target, body := jsonb_build_object('id', _id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', secret),
    timeout_milliseconds := 5000);
END;
$$;
REVOKE ALL ON FUNCTION private.request_task_screening(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.screen_task_after_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM private.request_task_screening(NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.screen_task_after_write() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER task_screening AFTER INSERT OR UPDATE OF screening ON public.tasks
FOR EACH ROW WHEN (NEW.screening = 'pending_ai') EXECUTE FUNCTION public.screen_task_after_write();

-- Called only by the task-screen function (service role).
CREATE FUNCTION public.system_screen_task(_task_id uuid, _verdict text, _reason text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _verdict NOT IN ('clean', 'flagged', 'blocked') THEN RAISE EXCEPTION 'invalid_verdict'; END IF;
  PERFORM set_config('app.task_screen_write', '1', true);
  UPDATE public.tasks
     SET screening = _verdict,
         screening_reason = CASE WHEN _verdict = 'clean' THEN NULL ELSE left(btrim(COALESCE(_reason, '')), 300) END,
         screened_at = now()
   WHERE id = _task_id AND screening = 'pending_ai';
END;
$$;
REVOKE ALL ON FUNCTION public.system_screen_task(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.system_screen_task(uuid, text, text) TO service_role;

-- Admin decision on a flagged / blocked task.
CREATE FUNCTION public.admin_screen_task(_task_id uuid, _approve boolean, _reason text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); item public.tasks;
BEGIN
  IF actor IS NULL OR NOT private.has_role(actor, 'admin'::public.app_role) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO item FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'task not found'; END IF;
  PERFORM set_config('app.task_screen_write', '1', true);
  UPDATE public.tasks
     SET screening = CASE WHEN _approve THEN 'clean' ELSE 'blocked' END,
         screening_reason = CASE WHEN _approve THEN NULL ELSE left(btrim(COALESCE(_reason, item.screening_reason, '')), 300) END,
         screened_at = now()
   WHERE id = _task_id;
  INSERT INTO public.admin_audit_log (admin_user_id, action, target_user_id, target_identifier, success, details)
  VALUES (actor, CASE WHEN _approve THEN 'admin_released_task' ELSE 'admin_blocked_task' END, item.creator_id, item.id::text, true,
    jsonb_build_object('task_id', item.id, 'previous', item.screening, 'ai_reason', item.screening_reason, 'reason', _reason));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_screen_task(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_screen_task(uuid, boolean, text) TO authenticated;

-- Visibility: others see a task only when it is live AND clean.
DROP POLICY "Public live tasks" ON public.tasks;
CREATE POLICY "Public live tasks" ON public.tasks FOR SELECT TO anon
  USING (publish_state = 'live' AND screening = 'clean');
DROP POLICY "Authenticated visible tasks" ON public.tasks;
CREATE POLICY "Authenticated visible tasks" ON public.tasks FOR SELECT TO authenticated
  USING ((publish_state = 'live' AND screening = 'clean')
         OR (SELECT auth.uid()) = creator_id
         OR private.has_role((SELECT auth.uid()), 'admin'));

-- No applications to a task that has not passed the screen.
CREATE FUNCTION public.block_apply_unscreened() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tasks WHERE id = NEW.task_id AND screening = 'clean') THEN
    RAISE EXCEPTION 'task_not_available' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.block_apply_unscreened() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER block_apply_unscreened BEFORE INSERT ON public.task_applications
FOR EACH ROW EXECUTE FUNCTION public.block_apply_unscreened();

-- Retry anything still undecided (provider hiccup, lost pg_net call).
CREATE FUNCTION public.retry_task_screening() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item record; total integer := 0;
BEGIN
  FOR item IN SELECT id FROM public.tasks WHERE screening = 'pending_ai'
      AND updated_at < now() - interval '3 minutes' ORDER BY updated_at LIMIT 50 LOOP
    PERFORM private.request_task_screening(item.id); total := total + 1;
  END LOOP;
  RETURN total;
END;
$$;
REVOKE ALL ON FUNCTION public.retry_task_screening() FROM PUBLIC, anon, authenticated;
SELECT cron.schedule('retry-task-screening', '*/10 * * * *', $$SELECT public.retry_task_screening()$$);
