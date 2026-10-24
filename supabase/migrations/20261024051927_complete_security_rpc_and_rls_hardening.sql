-- Audited against live BZB definitions. Preserve owner/admin predicates.

-- Trigger functions are invoked by triggers, never through the Data API.

REVOKE EXECUTE ON FUNCTION public.dispatch_notification() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.enforce_parent_contact_limit() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.enforce_parent_request_limit() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.enforce_task_worker_capacity() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.log_plan_price_change() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.on_application_accepted_create_conversation() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.on_application_created() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.on_application_decided() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.on_message_created() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.on_task_completed() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.prevent_client_system_column_changes() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.prevent_role_escalation() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.protect_task_billing_columns() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.sync_task_accepted_count() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.task_billing_on_insert() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.unhide_tasks_on_resubscribe() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.is_email_alias_taken(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_email_alias_taken(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.is_user_blocked(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_user_blocked(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.task_billing_enabled() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.task_billing_enabled() TO service_role;

REVOKE EXECUTE ON FUNCTION public.admin_set_review_status(uuid,public.review_status) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_set_review_status(uuid,public.review_status) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.archive_task(uuid,uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.archive_task(uuid,uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cancel_task(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.cancel_task(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.complete_task(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.complete_task(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.ensure_accepted_task_conversation(uuid,uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.ensure_accepted_task_conversation(uuid,uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_conversation_messages_read(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.mark_conversation_messages_read(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.record_task_view(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.record_task_view(uuid) TO authenticated;

-- This ownership helper remains usable by RLS, outside the exposed API schema.

ALTER FUNCTION public.task_is_live(uuid) SET SCHEMA private;

ALTER FUNCTION public.is_chat_media_participant(text) SET SCHEMA private;

REVOKE EXECUTE ON FUNCTION private.is_chat_media_participant(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.is_chat_media_participant(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ensure_accepted_task_conversation(_task_id uuid, _applicant_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  task_creator_id UUID;
  conversation_id UUID;
BEGIN
  SELECT task.creator_id INTO task_creator_id
  FROM public.tasks AS task
  WHERE task.id = _task_id;

  IF (auth.uid() IS NULL AND pg_trigger_depth() = 0) OR task_creator_id IS NULL OR auth.uid() NOT IN (task_creator_id, _applicant_id) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.task_applications
    WHERE task_id = _task_id
      AND applicant_id = _applicant_id
      AND status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'application_not_accepted';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_task_id::TEXT || ':' || _applicant_id::TEXT, 0));

  SELECT id INTO conversation_id
  FROM public.conversations
  WHERE task_id = _task_id
    AND (
      (participant_1 = task_creator_id AND participant_2 = _applicant_id)
      OR (participant_1 = _applicant_id AND participant_2 = task_creator_id)
    )
  ORDER BY created_at
  LIMIT 1;

  IF conversation_id IS NULL THEN
    INSERT INTO public.conversations (task_id, participant_1, participant_2)
    VALUES (_task_id, task_creator_id, _applicant_id)
    RETURNING id INTO conversation_id;
  END IF;

  RETURN conversation_id;
END;
$function$;

-- Cache auth.uid once per query. Public UID-only policies have no anon matches.

ALTER POLICY "Admins can insert audit log" ON public."admin_audit_log" WITH CHECK (private.has_role((SELECT auth.uid()), 'admin'::app_role));

ALTER POLICY "Admins can view audit log" ON public."admin_audit_log" USING (private.has_role((SELECT auth.uid()), 'admin'::app_role));

ALTER POLICY "Admins read plan price history" ON public."billing_plan_price_history" USING (private.has_role((SELECT auth.uid()), 'admin'::app_role));

ALTER POLICY "Users read own billing state" ON public."billing_user_state" USING (((SELECT auth.uid()) = user_id));

ALTER POLICY "Authenticated users can create conversations" ON public."conversations" TO authenticated WITH CHECK ((((SELECT auth.uid()) = participant_1) OR ((SELECT auth.uid()) = participant_2)));

ALTER POLICY "Participants can view conversations" ON public."conversations" TO authenticated USING ((((SELECT auth.uid()) = participant_1) OR ((SELECT auth.uid()) = participant_2)));

ALTER POLICY "Participants can send messages" ON public."messages" WITH CHECK (((sender_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM (conversations c
     JOIN tasks t ON ((t.id = c.task_id)))
  WHERE ((c.id = messages.conversation_id) AND ((( SELECT auth.uid() AS uid) = c.participant_1) OR (( SELECT auth.uid() AS uid) = c.participant_2)) AND (t.status <> ALL (ARRAY['completed'::task_status, 'cancelled'::task_status])) AND (t.archived_at IS NULL))))));

ALTER POLICY "Participants can view messages" ON public."messages" TO authenticated USING (((SELECT auth.uid()) IN ( SELECT conversations.participant_1
   FROM conversations
  WHERE (conversations.id = messages.conversation_id)
UNION
 SELECT conversations.participant_2
   FROM conversations
  WHERE (conversations.id = messages.conversation_id))));

ALTER POLICY "Users read own delivery log" ON public."notification_deliveries" TO authenticated USING (((SELECT auth.uid()) = user_id));

ALTER POLICY "Users read own notification preferences" ON public."notification_preferences" TO authenticated USING (((SELECT auth.uid()) = user_id));

ALTER POLICY "Users update own notification preferences" ON public."notification_preferences" TO authenticated USING (((SELECT auth.uid()) = user_id));

ALTER POLICY "Users write own notification preferences" ON public."notification_preferences" TO authenticated WITH CHECK (((SELECT auth.uid()) = user_id));

ALTER POLICY "Users insert own notification settings" ON public."notification_settings" TO authenticated WITH CHECK (((SELECT auth.uid()) = user_id));

ALTER POLICY "Users read own notification settings" ON public."notification_settings" TO authenticated USING (((SELECT auth.uid()) = user_id));

ALTER POLICY "Users update own notification settings" ON public."notification_settings" TO authenticated USING (((SELECT auth.uid()) = user_id));

ALTER POLICY "Users mark own notifications read" ON public."notifications" TO authenticated USING (((SELECT auth.uid()) = user_id));

ALTER POLICY "Users read own notifications" ON public."notifications" TO authenticated USING (((SELECT auth.uid()) = user_id));

ALTER POLICY "Children clear own parent requests" ON public."parent_contact_requests" USING (((SELECT auth.uid()) = child_user_id));

ALTER POLICY "Children read own parent requests" ON public."parent_contact_requests" USING (((SELECT auth.uid()) = child_user_id));

ALTER POLICY "Children add own parent contacts" ON public."parent_contacts" WITH CHECK ((((SELECT auth.uid()) = child_user_id) AND (last_notified_at IS NULL)));

ALTER POLICY "Children read own parent contacts" ON public."parent_contacts" USING (((SELECT auth.uid()) = child_user_id));

ALTER POLICY "Children remove own parent contacts" ON public."parent_contacts" USING (((SELECT auth.uid()) = child_user_id));

ALTER POLICY "Admins can create parent links" ON public."parent_links" WITH CHECK (private.has_role((SELECT auth.uid()), 'admin'::app_role));

ALTER POLICY "Admins can delete parent links" ON public."parent_links" USING (private.has_role((SELECT auth.uid()), 'admin'::app_role));

ALTER POLICY "Profiles viewable by owner and related" ON public."profiles" USING ((((SELECT auth.uid()) = user_id) OR private.has_role((SELECT auth.uid()), 'admin'::app_role) OR (EXISTS ( SELECT 1
   FROM parent_links pl
  WHERE ((pl.child_user_id = profiles.user_id) AND (pl.parent_user_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM conversations c
  WHERE (((c.participant_1 = (SELECT auth.uid())) AND (c.participant_2 = profiles.user_id)) OR ((c.participant_2 = (SELECT auth.uid())) AND (c.participant_1 = profiles.user_id))))) OR (EXISTS ( SELECT 1
   FROM (tasks t
     JOIN task_applications ta ON ((ta.task_id = t.id)))
  WHERE (((t.creator_id = (SELECT auth.uid())) AND (ta.applicant_id = profiles.user_id)) OR ((ta.applicant_id = (SELECT auth.uid())) AND (t.creator_id = profiles.user_id)))))));

ALTER POLICY "Users can insert own profile" ON public."profiles" TO authenticated WITH CHECK (((SELECT auth.uid()) = user_id));

ALTER POLICY "Users can update own profile" ON public."profiles" TO authenticated USING (((SELECT auth.uid()) = user_id));

ALTER POLICY "Users delete own push subscriptions" ON public."push_subscriptions" TO authenticated USING (((SELECT auth.uid()) = user_id));

ALTER POLICY "Users read own push subscriptions" ON public."push_subscriptions" TO authenticated USING (((SELECT auth.uid()) = user_id));

ALTER POLICY "Users register own push subscriptions" ON public."push_subscriptions" TO authenticated WITH CHECK (((SELECT auth.uid()) = user_id));

ALTER POLICY "Users update own push subscriptions" ON public."push_subscriptions" TO authenticated USING (((SELECT auth.uid()) = user_id));

ALTER POLICY "Users can insert own PWA prompt preference" ON public."pwa_install_prompt_preferences" WITH CHECK (((SELECT auth.uid()) = user_id));

ALTER POLICY "Users can update own PWA prompt preference" ON public."pwa_install_prompt_preferences" USING (((SELECT auth.uid()) = user_id)) WITH CHECK (((SELECT auth.uid()) = user_id));

ALTER POLICY "Users can view own PWA prompt preference" ON public."pwa_install_prompt_preferences" USING (((SELECT auth.uid()) = user_id));

ALTER POLICY "reviewer can insert" ON public."reviews" WITH CHECK (((reviewer_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::review_status) AND (reviewer_id <> reviewee_id) AND (EXISTS ( SELECT 1
   FROM (tasks t
     JOIN task_applications a ON ((a.task_id = t.id)))
  WHERE ((t.id = reviews.task_id) AND (t.status = 'completed'::task_status) AND (a.status = 'accepted'::application_status) AND (((t.creator_id = reviews.reviewer_id) AND (a.applicant_id = reviews.reviewee_id)) OR ((t.creator_id = reviews.reviewee_id) AND (a.applicant_id = reviews.reviewer_id))))))));

ALTER POLICY "Users read own subscription" ON public."subscriptions" USING (((SELECT auth.uid()) = user_id));

ALTER POLICY "Bees can apply" ON public."task_applications" TO authenticated WITH CHECK ((((SELECT auth.uid()) = applicant_id) AND private.task_is_live(task_id)));

ALTER POLICY "Task creator can update application status" ON public."task_applications" TO authenticated USING (((SELECT auth.uid()) IN ( SELECT tasks.creator_id
   FROM tasks
  WHERE (tasks.id = task_applications.task_id))));

ALTER POLICY "Task creator can view applications" ON public."task_applications" TO authenticated USING ((((SELECT auth.uid()) = applicant_id) OR ((SELECT auth.uid()) IN ( SELECT tasks.creator_id
   FROM tasks
  WHERE (tasks.id = task_applications.task_id)))));

ALTER POLICY "Users manage own task drafts" ON public."task_drafts" TO authenticated USING (((SELECT auth.uid()) = user_id)) WITH CHECK (((SELECT auth.uid()) = user_id));

ALTER POLICY "Admins read task refunds" ON public."task_refunds" USING (private.has_role((SELECT auth.uid()), 'admin'::app_role));

ALTER POLICY "Taskers can create tasks" ON public."tasks" WITH CHECK ((((SELECT auth.uid()) = creator_id) AND private.has_role((SELECT auth.uid()), 'tasker'::app_role)));

ALTER POLICY "Taskers can delete own tasks" ON public."tasks" TO authenticated USING (((SELECT auth.uid()) = creator_id));

ALTER POLICY "Taskers can update own tasks" ON public."tasks" TO authenticated USING (((SELECT auth.uid()) = creator_id));

ALTER POLICY "Admins can view user activity log" ON public."user_activity_log" USING (private.has_role((SELECT auth.uid()), 'admin'::app_role));

ALTER POLICY "Users can log their own activity" ON public."user_activity_log" WITH CHECK (((SELECT auth.uid()) = user_id));

ALTER POLICY "Users can create only their initial role" ON public."user_roles" WITH CHECK (((SELECT auth.uid()) = user_id));

ALTER POLICY "Users can view own roles or admins view all" ON public."user_roles" USING (((user_id = (SELECT auth.uid())) OR private.has_role((SELECT auth.uid()), 'admin'::app_role)));

DROP POLICY "Admins read payment records" ON public."billing_charges";

DROP POLICY "Users read own charges" ON public."billing_charges";

CREATE POLICY "Authenticated readers" ON public."billing_charges" FOR SELECT TO authenticated USING ((private.has_role((SELECT auth.uid()), 'admin'::app_role)) OR (((SELECT auth.uid()) = user_id)));

DROP POLICY "Admins can view all parent links" ON public."parent_links";

DROP POLICY "Parents can view their links" ON public."parent_links";

CREATE POLICY "Authenticated readers" ON public."parent_links" FOR SELECT TO authenticated USING ((private.has_role((SELECT auth.uid()), 'admin'::app_role)) OR ((((SELECT auth.uid()) = parent_user_id) OR ((SELECT auth.uid()) = child_user_id))));

DROP POLICY "Admins read payment orders" ON public."payment_orders";

DROP POLICY "Users read own payment orders" ON public."payment_orders";

CREATE POLICY "Authenticated readers" ON public."payment_orders" FOR SELECT TO authenticated USING ((private.has_role((SELECT auth.uid()), 'admin'::app_role)) OR (((SELECT auth.uid()) = user_id)));

DROP POLICY "admins can read all reviews" ON public."reviews";

DROP POLICY "anyone can read approved" ON public."reviews";

DROP POLICY "reviewer can read own" ON public."reviews";

CREATE POLICY "Authenticated readers" ON public."reviews" FOR SELECT TO authenticated USING ((private.has_role((SELECT auth.uid()), 'admin'::app_role)) OR ((status = 'approved'::review_status)) OR (((SELECT auth.uid()) = reviewer_id)));

CREATE POLICY "Public approved reviews" ON public.reviews FOR SELECT TO anon USING (status = 'approved');

DROP POLICY "Tasks visible when live or own or admin" ON public.tasks;

CREATE POLICY "Public live tasks" ON public.tasks FOR SELECT TO anon USING (publish_state = 'live');

CREATE POLICY "Authenticated visible tasks" ON public.tasks FOR SELECT TO authenticated USING (publish_state = 'live' OR (SELECT auth.uid()) = creator_id OR private.has_role((SELECT auth.uid()), 'admin'));

REVOKE ALL ON TABLE public.billing_refund_attempts FROM anon, authenticated;

GRANT ALL ON TABLE public.billing_refund_attempts TO service_role;

COMMENT ON TABLE public.billing_refund_attempts IS 'Backend-only table. RLS intentionally has no client policies.';

REVOKE ALL ON TABLE public.billing_settings FROM anon, authenticated;

GRANT ALL ON TABLE public.billing_settings TO service_role;

COMMENT ON TABLE public.billing_settings IS 'Backend-only table. RLS intentionally has no client policies.';

REVOKE ALL ON TABLE public.family_link_attempts FROM anon, authenticated;

GRANT ALL ON TABLE public.family_link_attempts TO service_role;

COMMENT ON TABLE public.family_link_attempts IS 'Backend-only table. RLS intentionally has no client policies.';

REVOKE ALL ON TABLE public.family_link_codes FROM anon, authenticated;

GRANT ALL ON TABLE public.family_link_codes TO service_role;

COMMENT ON TABLE public.family_link_codes IS 'Backend-only table. RLS intentionally has no client policies.';

REVOKE ALL ON TABLE public.payment_events FROM anon, authenticated;

GRANT ALL ON TABLE public.payment_events TO service_role;

COMMENT ON TABLE public.payment_events IS 'Backend-only table. RLS intentionally has no client policies.';

REVOKE ALL ON TABLE public.payment_methods FROM anon, authenticated;

GRANT ALL ON TABLE public.payment_methods TO service_role;

COMMENT ON TABLE public.payment_methods IS 'Backend-only table. RLS intentionally has no client policies.';

REVOKE ALL ON TABLE public.task_views FROM anon, authenticated;

GRANT ALL ON TABLE public.task_views TO service_role;

COMMENT ON TABLE public.task_views IS 'Backend-only table. RLS intentionally has no client policies.';

REVOKE ALL ON TABLE public.trial_blocks FROM anon, authenticated;

GRANT ALL ON TABLE public.trial_blocks TO service_role;

COMMENT ON TABLE public.trial_blocks IS 'Backend-only table. RLS intentionally has no client policies.';

REVOKE ALL ON TABLE public.trial_fingerprints FROM anon, authenticated;

GRANT ALL ON TABLE public.trial_fingerprints TO service_role;

COMMENT ON TABLE public.trial_fingerprints IS 'Backend-only table. RLS intentionally has no client policies.';

-- View counts follow task visibility and increment atomically across viewers.
CREATE OR REPLACE FUNCTION public.record_task_view(_task_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  viewer UUID := auth.uid();
  inserted integer;
  current_count integer;
BEGIN
  SELECT coalesce(views_count, 0) INTO current_count
  FROM tasks WHERE id = _task_id AND archived_at IS NULL
    AND (publish_state = 'live' OR creator_id = viewer OR private.has_role(viewer, 'admin'));

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
  UPDATE tasks SET views_count = coalesce(views_count, 0) + 1 WHERE id = _task_id
  RETURNING views_count INTO current_count;
  PERFORM set_config('app.counting_view', 'off', true);

  RETURN current_count;
END;
$function$
;

-- A client cannot manufacture a relationship to expose someone else's profile.
ALTER POLICY "Authenticated users can create conversations" ON public.conversations
  WITH CHECK (
    (SELECT auth.uid()) IN (participant_1, participant_2)
    AND EXISTS (
      SELECT 1 FROM public.tasks t JOIN public.task_applications a ON a.task_id=t.id
      WHERE t.id=conversations.task_id AND a.status='accepted' AND a.archived_at IS NULL
        AND ((t.creator_id=participant_1 AND a.applicant_id=participant_2)
          OR (t.creator_id=participant_2 AND a.applicant_id=participant_1))
    )
  );
