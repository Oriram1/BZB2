-- Per-task billing, the task review queue and the one-time benefits ledger.
--
-- Rules this encodes (see docs/billing-implementation.md):
--   * The first task a user ever publishes is free. Once per user, kept at the
--     user level, so deleting that task never gives the benefit back.
--   * A free-plan user pays 3 NIS per further task; a subscriber pays nothing.
--     Insurance is a 5 NIS add-on on top, for everyone.
--   * A task is reviewed by an admin first. The card is charged only after the
--     admin approves, and the task goes live only once that charge passed.
--   * A rejected task costs nothing and does not use the free slot.
--
-- Everything is behind billing_settings.task_billing. While it is 'off' the
-- trigger below leaves every task 'live', so deploying this changes nothing for
-- existing users until the switch is flipped on purpose.

-- ---------------------------------------------------------------------------
-- Switch and constants
-- ---------------------------------------------------------------------------
CREATE TABLE public.billing_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
-- Server-only: RLS on, no policy.

INSERT INTO public.billing_settings (key, value) VALUES
  ('task_billing', 'off'),
  ('task_fee', '3.00'),
  ('insurance_fee', '5.00');

CREATE OR REPLACE FUNCTION public.task_billing_enabled()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT value = 'on' FROM public.billing_settings WHERE key = 'task_billing'), false);
$$;
REVOKE ALL ON FUNCTION public.task_billing_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_billing_enabled() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.billing_setting_number(_key TEXT, _fallback NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT value::NUMERIC FROM public.billing_settings WHERE key = _key), _fallback);
$$;
REVOKE ALL ON FUNCTION public.billing_setting_number(TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_setting_number(TEXT, NUMERIC) TO service_role;

-- ---------------------------------------------------------------------------
-- One row per user: the benefits that can be used once, ever.
-- ---------------------------------------------------------------------------
CREATE TABLE public.billing_user_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Set the first time a task goes live on the free slot. Never cleared.
  free_task_used_at TIMESTAMPTZ,
  -- The first task that ever went live. It survives every clean-up.
  first_task_id UUID,
  -- The free month was granted once. Never cleared.
  free_month_used_at TIMESTAMPTZ,
  -- A 14-day refund was given once. Never cleared.
  refund_14d_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.billing_user_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own billing state"
  ON public.billing_user_state FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Task columns
-- ---------------------------------------------------------------------------
CREATE TYPE public.task_publish_state AS ENUM (
  'live',             -- visible to bees (every task that existed before billing)
  'pending_review',   -- waiting for an admin
  'awaiting_charge',  -- approved, the charge has not settled yet
  'pending_payment',  -- approved, the charge failed; waiting for another card
  'draft',            -- payment never arrived; back to the owner as a draft
  'rejected',         -- an admin did not approve it
  'hidden'            -- owner's subscription ended; kept, not shown
);

ALTER TABLE public.tasks
  ADD COLUMN publish_state public.task_publish_state NOT NULL DEFAULT 'live',
  ADD COLUMN insurance BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN payment_due NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (payment_due >= 0),
  ADD COLUMN uses_free_slot BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN reviewed_by UUID,
  ADD COLUMN reviewed_at TIMESTAMPTZ,
  ADD COLUMN review_note TEXT,
  ADD COLUMN charged_at TIMESTAMPTZ,
  ADD COLUMN pending_payment_since TIMESTAMPTZ,
  ADD COLUMN payment_reminded_at TIMESTAMPTZ,
  ADD COLUMN hidden_at TIMESTAMPTZ;

CREATE INDEX tasks_review_queue_idx ON public.tasks (created_at)
  WHERE publish_state IN ('pending_review', 'awaiting_charge', 'pending_payment');
CREATE INDEX tasks_publish_state_idx ON public.tasks (creator_id, publish_state);

-- Bees only ever see live tasks. The owner sees their own whatever its state,
-- and an admin sees everything (the review queue).
DROP POLICY IF EXISTS "Tasks viewable by everyone" ON public.tasks;
CREATE POLICY "Tasks visible when live or own or admin"
  ON public.tasks FOR SELECT
  USING (
    publish_state = 'live'
    OR auth.uid() = creator_id
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- ---------------------------------------------------------------------------
-- Every charge that is not a subscription period: a task fee, an insurance
-- add-on, a plan-change difference, the difference when keeping tasks on a
-- 14-day cancellation. Same discipline as payment_orders: the amount is ours,
-- the result comes from Cardcom, and applied_at makes settling idempotent.
-- ---------------------------------------------------------------------------
CREATE TABLE public.billing_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('task', 'plan_change', 'cancel_difference', 'card_setup')),
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  plan_id TEXT REFERENCES public.billing_plans(id),
  -- 0 is allowed only for card_setup (save a card without charging).
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  status public.payment_order_status NOT NULL DEFAULT 'pending',
  low_profile_id TEXT UNIQUE,
  external_uniq_id TEXT UNIQUE,
  deal_number BIGINT UNIQUE,
  response_code INTEGER,
  error TEXT,
  document_number BIGINT,
  document_url TEXT,
  meta JSONB,
  applied_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (purpose = 'card_setup' OR amount > 0)
);
CREATE INDEX billing_charges_user_idx ON public.billing_charges (user_id, created_at DESC);
CREATE INDEX billing_charges_task_idx ON public.billing_charges (task_id) WHERE task_id IS NOT NULL;
CREATE INDEX billing_charges_pending_idx ON public.billing_charges (created_at) WHERE status = 'pending';
ALTER TABLE public.billing_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own charges"
  ON public.billing_charges FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- The quote: what publishing a task costs this user right now. One function,
-- used by the insert trigger (the authority) and by the UI (the preview).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.task_publish_quote(_user_id UUID, _insurance BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  st public.billing_user_state%ROWTYPE;
  subscriber BOOLEAN;
  free_slot_taken BOOLEAN;
  fee NUMERIC := public.billing_setting_number('task_fee', 3);
  ins NUMERIC := public.billing_setting_number('insurance_fee', 5);
  base NUMERIC := 0;
  uses_free BOOLEAN := false;
  due NUMERIC;
  has_card BOOLEAN;
  pending_payment_count INTEGER;
BEGIN
  SELECT * INTO st FROM public.billing_user_state WHERE user_id = _user_id;
  subscriber := public.has_active_subscription(_user_id);

  -- A free slot is also taken while another task of this user is still waiting
  -- for review on it, so two submissions cannot both ride the same free slot.
  free_slot_taken := st.free_task_used_at IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.tasks
       WHERE creator_id = _user_id AND uses_free_slot
         AND publish_state IN ('pending_review', 'awaiting_charge', 'pending_payment', 'live')
    );

  IF subscriber THEN
    base := 0;
  ELSIF NOT free_slot_taken THEN
    base := 0;
    uses_free := true;
  ELSE
    base := fee;
  END IF;

  due := base + CASE WHEN COALESCE(_insurance, false) THEN ins ELSE 0 END;

  SELECT EXISTS (SELECT 1 FROM public.payment_methods WHERE user_id = _user_id) INTO has_card;
  SELECT count(*) INTO pending_payment_count
    FROM public.tasks WHERE creator_id = _user_id AND publish_state = 'pending_payment';

  RETURN jsonb_build_object(
    'due', due,
    'task_fee', base,
    'insurance_fee', CASE WHEN COALESCE(_insurance, false) THEN ins ELSE 0 END,
    'free_slot', uses_free,
    'subscriber', subscriber,
    'has_card', has_card,
    'pending_payment_count', pending_payment_count
  );
END;
$$;
REVOKE ALL ON FUNCTION public.task_publish_quote(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.task_publish_quote(UUID, BOOLEAN) TO service_role;

-- What the signed-in user would pay for their next task. Read-only.
CREATE OR REPLACE FUNCTION public.my_publish_quote(_insurance BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN public.task_billing_enabled()
              THEN public.task_publish_quote(auth.uid(), _insurance)
              ELSE jsonb_build_object('due', 0, 'task_fee', 0, 'insurance_fee', 0, 'free_slot', false,
                                      'subscriber', false, 'has_card', false, 'pending_payment_count', 0,
                                      'billing_off', true)
         END;
$$;
REVOKE ALL ON FUNCTION public.my_publish_quote(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_publish_quote(BOOLEAN) TO authenticated;

-- ---------------------------------------------------------------------------
-- Insert gate. The client may ask for insurance; everything else about the
-- task's billing state is decided here and nowhere else.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.task_billing_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  quote JSONB;
  recent INTEGER;
BEGIN
  IF NOT public.task_billing_enabled() THEN
    NEW.publish_state := 'live';
    NEW.payment_due := 0;
    NEW.uses_free_slot := false;
    NEW.insurance := false;
    RETURN NEW;
  END IF;

  -- Limits how fast one account can fill the review queue.
  SELECT count(*) INTO recent FROM public.tasks
   WHERE creator_id = NEW.creator_id AND created_at > now() - interval '1 hour';
  IF recent >= 5 THEN
    RAISE EXCEPTION 'too_many_submissions' USING ERRCODE = 'P0001';
  END IF;

  quote := public.task_publish_quote(NEW.creator_id, NEW.insurance);

  IF (quote->>'due')::NUMERIC > 0 THEN
    IF NOT (quote->>'has_card')::BOOLEAN THEN
      RAISE EXCEPTION 'card_required' USING ERRCODE = 'P0001';
    END IF;
    IF (quote->>'pending_payment_count')::INTEGER >= 3 THEN
      RAISE EXCEPTION 'too_many_pending_payment' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  NEW.publish_state := 'pending_review';
  NEW.payment_due := (quote->>'due')::NUMERIC;
  NEW.uses_free_slot := (quote->>'free_slot')::BOOLEAN;
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  NEW.charged_at := NULL;
  RETURN NEW;
END;
$$;
CREATE TRIGGER task_billing_on_insert
  BEFORE INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.task_billing_on_insert();

-- ---------------------------------------------------------------------------
-- A client can never move a task between states or change what it costs. The
-- server paths below set app.task_billing_write for their own transaction.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_task_billing_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims JSONB := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::JSONB, '{}'::JSONB);
BEGIN
  IF claims->>'role' = 'authenticated'
     AND COALESCE(current_setting('app.task_billing_write', true), '') <> '1' THEN
    IF NEW.publish_state IS DISTINCT FROM OLD.publish_state
       OR NEW.insurance IS DISTINCT FROM OLD.insurance
       OR NEW.payment_due IS DISTINCT FROM OLD.payment_due
       OR NEW.uses_free_slot IS DISTINCT FROM OLD.uses_free_slot
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.review_note IS DISTINCT FROM OLD.review_note
       OR NEW.charged_at IS DISTINCT FROM OLD.charged_at
       OR NEW.pending_payment_since IS DISTINCT FROM OLD.pending_payment_since
       OR NEW.payment_reminded_at IS DISTINCT FROM OLD.payment_reminded_at
       OR NEW.hidden_at IS DISTINCT FROM OLD.hidden_at THEN
      RAISE EXCEPTION 'immutable_task_billing_fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_task_billing_columns
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.protect_task_billing_columns();

-- A task that is not live cannot take applications; the bee side never sees
-- it, but a direct insert with a known id must not work either.
CREATE OR REPLACE FUNCTION public.task_is_live(_task_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.tasks WHERE id = _task_id AND publish_state = 'live');
$$;
REVOKE ALL ON FUNCTION public.task_is_live(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_is_live(UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS "Bees can apply" ON public.task_applications;
CREATE POLICY "Bees can apply"
  ON public.task_applications FOR INSERT
  WITH CHECK (auth.uid() = applicant_id AND public.task_is_live(task_id));
