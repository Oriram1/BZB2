-- Automatic safety screen for chat messages.
--
-- Messages are delivered at once (status 'unchecked'). Right after insert the
-- task-screen function checks the text. A suspicious message becomes 'flagged':
-- hidden from the other side, still visible to its sender with a note, and sent
-- to the admin queue. Admins see only flagged messages, never ordinary chats.
ALTER TABLE public.messages
  ADD COLUMN screening text NOT NULL DEFAULT 'unchecked'
    CHECK (screening IN ('unchecked', 'clean', 'flagged', 'removed')),
  ADD COLUMN screening_reason text CHECK (char_length(screening_reason) <= 300);
UPDATE public.messages SET screening = 'clean';

CREATE FUNCTION public.message_force_screening() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  claims jsonb := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
BEGIN
  IF claims->>'role' IN ('authenticated', 'anon') THEN
    NEW.screening := CASE WHEN btrim(COALESCE(NEW.content, '')) = '' THEN 'clean' ELSE 'unchecked' END;
    NEW.screening_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.message_force_screening() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER message_force_screening BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.message_force_screening();

CREATE FUNCTION private.request_message_screening(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, vault AS $$
DECLARE target text; secret text;
BEGIN
  SELECT decrypted_secret INTO target FROM vault.decrypted_secrets WHERE name = 'task_screen_url';
  SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name = 'notify_dispatch_secret';
  IF target IS NULL OR secret IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(url := target, body := jsonb_build_object('kind', 'message', 'id', _id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', secret),
    timeout_milliseconds := 5000);
END;
$$;
REVOKE ALL ON FUNCTION private.request_message_screening(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.screen_message_after_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM private.request_message_screening(NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.screen_message_after_insert() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER message_screening AFTER INSERT ON public.messages
FOR EACH ROW WHEN (NEW.screening = 'unchecked') EXECUTE FUNCTION public.screen_message_after_insert();

-- Called only by the task-screen function (service role).
CREATE FUNCTION public.system_screen_message(_message_id uuid, _verdict text, _reason text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _verdict NOT IN ('clean', 'flagged') THEN RAISE EXCEPTION 'invalid_verdict'; END IF;
  UPDATE public.messages
     SET screening = _verdict,
         screening_reason = CASE WHEN _verdict = 'clean' THEN NULL ELSE left(btrim(COALESCE(_reason, '')), 300) END
   WHERE id = _message_id AND screening = 'unchecked';
END;
$$;
REVOKE ALL ON FUNCTION public.system_screen_message(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.system_screen_message(uuid, text, text) TO service_role;

-- Admin: release a flagged message, or remove it for good ('removed').

CREATE FUNCTION public.admin_screen_message(_message_id uuid, _approve boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid := auth.uid(); item public.messages;
BEGIN
  IF actor IS NULL OR NOT private.has_role(actor, 'admin'::public.app_role) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO item FROM public.messages WHERE id = _message_id FOR UPDATE;
  IF NOT FOUND OR item.screening <> 'flagged' THEN RAISE EXCEPTION 'message_not_flagged'; END IF;
  UPDATE public.messages SET screening = CASE WHEN _approve THEN 'clean' ELSE 'removed' END WHERE id = _message_id;
  INSERT INTO public.admin_audit_log (admin_user_id, action, target_user_id, target_identifier, success, details)
  VALUES (actor, CASE WHEN _approve THEN 'admin_released_message' ELSE 'admin_removed_message' END, item.sender_id, item.id::text, true,
    jsonb_build_object('message_id', item.id, 'conversation_id', item.conversation_id, 'ai_reason', item.screening_reason));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_screen_message(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_screen_message(uuid, boolean) TO authenticated;

-- The other side never sees a flagged or removed message; the sender still does.
ALTER POLICY "Participants can view messages" ON public.messages TO authenticated USING (
  (screening IN ('unchecked', 'clean') OR sender_id = (SELECT auth.uid()))
  AND (SELECT auth.uid()) IN (
    SELECT participant_1 FROM public.conversations WHERE id = conversation_id
    UNION SELECT participant_2 FROM public.conversations WHERE id = conversation_id
  )
);
CREATE POLICY "Admins view flagged messages" ON public.messages FOR SELECT TO authenticated
  USING (screening = 'flagged' AND private.has_role((SELECT auth.uid()), 'admin'));

-- Retry messages the screen did not reach.
CREATE FUNCTION public.retry_message_screening() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item record; total integer := 0;
BEGIN
  FOR item IN SELECT id FROM public.messages WHERE screening = 'unchecked'
      AND created_at BETWEEN now() - interval '2 days' AND now() - interval '3 minutes'
      ORDER BY created_at LIMIT 100 LOOP
    PERFORM private.request_message_screening(item.id); total := total + 1;
  END LOOP;
  RETURN total;
END;
$$;
REVOKE ALL ON FUNCTION public.retry_message_screening() FROM PUBLIC, anon, authenticated;
SELECT cron.schedule('retry-message-screening', '*/10 * * * *', $$SELECT public.retry_message_screening()$$);
