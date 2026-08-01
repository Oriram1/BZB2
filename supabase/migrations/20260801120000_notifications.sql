-- Notification spine: one outbox table every domain event lands in, plus the
-- preferences and delivery bookkeeping around it.
--
-- Rows carry `type` + `data` only. All user-facing copy is rendered in
-- TypeScript (src/lib/notificationCopy.ts, shared by the bell, email and push)
-- so wording never has to be maintained in two languages of two systems.

CREATE TYPE public.notification_event AS ENUM (
  'application_received',
  'application_decided',
  'message_received',
  'task_completed',
  'parent_child_accepted',
  'parent_digest',
  'family_link_code'
);

CREATE TYPE public.notification_channel AS ENUM ('email', 'push');
CREATE TYPE public.delivery_status AS ENUM ('sent', 'failed', 'skipped');

-- ---------------------------------------------------------------------------
-- Per-event channel overrides. Sparse on purpose: a missing row means "use the
-- default", so adding a new event type does not need a backfill.
-- ---------------------------------------------------------------------------
CREATE TABLE public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type public.notification_event NOT NULL,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_type)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notification preferences"
  ON public.notification_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users write own notification preferences"
  ON public.notification_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own notification preferences"
  ON public.notification_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Account-wide notification settings (one row per user).
-- Quiet hours ship in the schema now; the dispatcher starts honouring them
-- when chat notifications land, so no second migration is needed then.
-- ---------------------------------------------------------------------------
CREATE TABLE public.notification_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  digest_hour SMALLINT NOT NULL DEFAULT 20 CHECK (digest_hour BETWEEN 0 AND 23),
  quiet_hours_enabled BOOLEAN NOT NULL DEFAULT true,
  quiet_hours_start SMALLINT NOT NULL DEFAULT 22 CHECK (quiet_hours_start BETWEEN 0 AND 23),
  quiet_hours_end SMALLINT NOT NULL DEFAULT 7 CHECK (quiet_hours_end BETWEEN 0 AND 23),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notification settings"
  ON public.notification_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own notification settings"
  ON public.notification_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own notification settings"
  ON public.notification_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER update_notification_settings_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Web Push registrations. One user can register several devices.
-- ---------------------------------------------------------------------------
CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX push_subscriptions_user_idx ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own push subscriptions"
  ON public.push_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users register own push subscriptions"
  ON public.push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own push subscriptions"
  ON public.push_subscriptions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own push subscriptions"
  ON public.push_subscriptions FOR DELETE USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- The outbox, and the in-app feed behind the bell.
-- ---------------------------------------------------------------------------
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type public.notification_event NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx
  ON public.notifications (user_id) WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notifications"
  ON public.notifications FOR SELECT USING (auth.uid() = user_id);
-- Marking as read is the only write a user may make; inserts come from triggers.
CREATE POLICY "Users mark own notifications read"
  ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Delivery log: answers "why didn't I get an email?" and gives the chat
-- batching rule something to check against.
-- ---------------------------------------------------------------------------
CREATE TABLE public.notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel public.notification_channel NOT NULL,
  status public.delivery_status NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (notification_id, channel)
);

CREATE INDEX notification_deliveries_user_idx
  ON public.notification_deliveries (user_id, created_at DESC);

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own delivery log"
  ON public.notification_deliveries FOR SELECT USING (auth.uid() = user_id);

-- Presence signal for the chat batching rule: no email if the recipient was
-- looking at the app moments ago.
ALTER TABLE public.profiles ADD COLUMN last_active_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- Dispatch: every insert into notifications pings the edge function.
-- Config lives in Vault so no secret is committed. Missing config makes the
-- trigger a no-op, which keeps the app usable before the hook is wired up.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.dispatch_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  dispatch_url TEXT;
  dispatch_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO dispatch_url
    FROM vault.decrypted_secrets WHERE name = 'notify_dispatch_url';
  SELECT decrypted_secret INTO dispatch_secret
    FROM vault.decrypted_secrets WHERE name = 'notify_dispatch_secret';

  IF dispatch_url IS NULL OR dispatch_secret IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := dispatch_url,
    body := jsonb_build_object('notification_id', NEW.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', dispatch_secret
    ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER notifications_dispatch
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_notification();

-- ---------------------------------------------------------------------------
-- Domain triggers. These only record what happened; wording and channel
-- routing are the dispatcher's job.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enqueue_notification(
  _user_id UUID,
  _event public.notification_event,
  _data JSONB,
  _link TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.notifications (user_id, event_type, data, link)
  VALUES (_user_id, _event, COALESCE(_data, '{}'::jsonb), _link);
$$;

-- A bee applied to my task.
CREATE OR REPLACE FUNCTION public.on_application_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task_row public.tasks%ROWTYPE;
  applicant_name TEXT;
BEGIN
  SELECT * INTO task_row FROM public.tasks WHERE id = NEW.task_id;
  IF task_row.id IS NULL OR task_row.creator_id = NEW.applicant_id THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(TRIM(first_name || ' ' || last_name), '') INTO applicant_name
    FROM public.profiles WHERE user_id = NEW.applicant_id;

  PERFORM public.enqueue_notification(
    task_row.creator_id,
    'application_received',
    jsonb_build_object(
      'task_id', task_row.id,
      'task_name', task_row.name,
      'applicant_name', COALESCE(applicant_name, 'מועמד'),
      'application_id', NEW.id
    ),
    '/task/' || task_row.id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER task_applications_created
  AFTER INSERT ON public.task_applications
  FOR EACH ROW EXECUTE FUNCTION public.on_application_created();

-- My application was accepted or rejected; parents hear about acceptances.
CREATE OR REPLACE FUNCTION public.on_application_decided()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task_row public.tasks%ROWTYPE;
  child_name TEXT;
  parent_id UUID;
BEGIN
  IF NEW.status = OLD.status OR NEW.status = 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO task_row FROM public.tasks WHERE id = NEW.task_id;
  IF task_row.id IS NULL THEN RETURN NEW; END IF;

  PERFORM public.enqueue_notification(
    NEW.applicant_id,
    'application_decided',
    jsonb_build_object(
      'task_id', task_row.id,
      'task_name', task_row.name,
      'status', NEW.status
    ),
    '/task/' || task_row.id
  );

  -- Acceptance means the child is about to go out and work: parents get told
  -- immediately rather than waiting for the evening digest.
  IF NEW.status = 'accepted' THEN
    SELECT NULLIF(TRIM(first_name || ' ' || last_name), '') INTO child_name
      FROM public.profiles WHERE user_id = NEW.applicant_id;

    FOR parent_id IN
      SELECT parent_user_id FROM public.parent_links WHERE child_user_id = NEW.applicant_id
    LOOP
      PERFORM public.enqueue_notification(
        parent_id,
        'parent_child_accepted',
        jsonb_build_object(
          'task_id', task_row.id,
          'task_name', task_row.name,
          'child_name', COALESCE(child_name, 'הילד/ה'),
          'location', task_row.location,
          'scheduled_date', task_row.scheduled_date,
          'scheduled_time', task_row.scheduled_time
        ),
        '/parent'
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER task_applications_decided
  AFTER UPDATE ON public.task_applications
  FOR EACH ROW EXECUTE FUNCTION public.on_application_decided();

-- New chat message: notify the other participant.
CREATE OR REPLACE FUNCTION public.on_message_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conversation_row public.conversations%ROWTYPE;
  recipient_id UUID;
  sender_name TEXT;
BEGIN
  SELECT * INTO conversation_row FROM public.conversations WHERE id = NEW.conversation_id;
  IF conversation_row.id IS NULL THEN RETURN NEW; END IF;

  recipient_id := CASE
    WHEN conversation_row.participant_1 = NEW.sender_id THEN conversation_row.participant_2
    ELSE conversation_row.participant_1
  END;

  IF recipient_id IS NULL OR recipient_id = NEW.sender_id THEN RETURN NEW; END IF;

  SELECT NULLIF(TRIM(first_name || ' ' || last_name), '') INTO sender_name
    FROM public.profiles WHERE user_id = NEW.sender_id;

  PERFORM public.enqueue_notification(
    recipient_id,
    'message_received',
    jsonb_build_object(
      'conversation_id', conversation_row.id,
      'sender_name', COALESCE(sender_name, 'משתמש')
    ),
    '/chat'
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_created
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.on_message_created();

-- Task marked completed: both sides get a receipt.
CREATE OR REPLACE FUNCTION public.on_task_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  worker_id UUID;
  payload JSONB;
BEGIN
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  payload := jsonb_build_object(
    'task_id', NEW.id,
    'task_name', NEW.name,
    'payment', NEW.payment,
    'payment_type', NEW.payment_type
  );

  PERFORM public.enqueue_notification(NEW.creator_id, 'task_completed', payload, '/task/' || NEW.id);

  FOR worker_id IN
    SELECT applicant_id FROM public.task_applications
    WHERE task_id = NEW.id AND status = 'accepted'
  LOOP
    PERFORM public.enqueue_notification(worker_id, 'task_completed', payload, '/task/' || NEW.id);
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_completed
  AFTER UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.on_task_completed();

-- The bell subscribes over realtime, so the table has to be in the publication.
-- RLS still applies, so a client only ever receives its own rows.
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
