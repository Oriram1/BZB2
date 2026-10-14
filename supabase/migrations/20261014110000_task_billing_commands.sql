-- Server-side commands for per-task billing, the free month, plan changes and
-- the 14-day refund. All of them are service_role only: the Edge Functions call
-- them after talking to Cardcom, and a browser can never reach them.

-- ---------------------------------------------------------------------------
-- Subscription columns: a plan change that waits for the period end, and the
-- free-month marker.
-- ---------------------------------------------------------------------------
ALTER TABLE public.subscriptions
  ADD COLUMN pending_plan_id TEXT REFERENCES public.billing_plans(id),
  ADD COLUMN is_trial BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.subscriptions_housekeeping()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- The first real payment ends the free month.
  IF NEW.first_paid_at IS NOT NULL AND OLD.first_paid_at IS NULL THEN
    NEW.is_trial := false;
  END IF;
  -- A scheduled plan change is done once the plan on the row is that plan.
  IF NEW.pending_plan_id IS NOT NULL AND NEW.plan_id = NEW.pending_plan_id THEN
    NEW.pending_plan_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER subscriptions_housekeeping
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.subscriptions_housekeeping();

-- Tasks hidden because the subscription ended come back when it is active again.
CREATE OR REPLACE FUNCTION public.unhide_tasks_on_resubscribe()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    PERFORM set_config('app.task_billing_write', '1', true);
    UPDATE public.tasks
       SET publish_state = 'live', hidden_at = NULL
     WHERE creator_id = NEW.user_id AND publish_state = 'hidden';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER unhide_tasks_on_resubscribe
  AFTER INSERT OR UPDATE OF status ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.unhide_tasks_on_resubscribe();

-- ---------------------------------------------------------------------------
-- Helper: record the benefits a task consumed once it goes live.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.task_went_live(_task public.tasks)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.billing_user_state (user_id, first_task_id, free_task_used_at)
  VALUES (_task.creator_id, _task.id, CASE WHEN _task.uses_free_slot THEN now() END)
  ON CONFLICT (user_id) DO UPDATE
    SET first_task_id = COALESCE(public.billing_user_state.first_task_id, EXCLUDED.first_task_id),
        free_task_used_at = COALESCE(
          public.billing_user_state.free_task_used_at,
          CASE WHEN _task.uses_free_slot THEN now() END
        ),
        updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.task_went_live(public.tasks) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin decision. Returns what the caller must do next: nothing (live or
-- rejected) or charge the card.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.task_review_decide(
  _task_id UUID,
  _admin_id UUID,
  _approve BOOLEAN,
  _note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.tasks%ROWTYPE;
BEGIN
  PERFORM set_config('app.task_billing_write', '1', true);
  SELECT * INTO t FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF t.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'task_not_found');
  END IF;
  IF t.publish_state <> 'pending_review' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending_review', 'state', t.publish_state);
  END IF;

  IF NOT _approve THEN
    UPDATE public.tasks
       SET publish_state = 'rejected', reviewed_by = _admin_id, reviewed_at = now(), review_note = _note
     WHERE id = t.id;
    RETURN jsonb_build_object('ok', true, 'state', 'rejected', 'user_id', t.creator_id, 'due', 0);
  END IF;

  IF t.payment_due = 0 THEN
    UPDATE public.tasks
       SET publish_state = 'live', reviewed_by = _admin_id, reviewed_at = now(), review_note = _note
     WHERE id = t.id
     RETURNING * INTO t;
    PERFORM public.task_went_live(t);
    RETURN jsonb_build_object('ok', true, 'state', 'live', 'user_id', t.creator_id, 'due', 0);
  END IF;

  UPDATE public.tasks
     SET publish_state = 'awaiting_charge', reviewed_by = _admin_id, reviewed_at = now(), review_note = _note
   WHERE id = t.id;
  RETURN jsonb_build_object('ok', true, 'state', 'awaiting_charge', 'user_id', t.creator_id, 'due', t.payment_due);
END;
$$;
REVOKE ALL ON FUNCTION public.task_review_decide(UUID, UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.task_review_decide(UUID, UUID, BOOLEAN, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- A charge settled. Idempotent: applied_at is the marker, the row is locked.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_charge_paid(
  _charge_id UUID,
  _deal_number BIGINT,
  _document_number BIGINT,
  _document_url TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.billing_charges%ROWTYPE;
  t public.tasks%ROWTYPE;
BEGIN
  PERFORM set_config('app.task_billing_write', '1', true);
  SELECT * INTO c FROM public.billing_charges WHERE id = _charge_id FOR UPDATE;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'charge_not_found';
  END IF;
  IF c.applied_at IS NOT NULL OR c.status = 'refunded' THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'already_applied', 'purpose', c.purpose);
  END IF;

  UPDATE public.billing_charges
     SET status = 'paid',
         deal_number = COALESCE(_deal_number, deal_number),
         document_number = _document_number,
         document_url = _document_url,
         paid_at = now(),
         applied_at = now(),
         error = NULL
   WHERE id = c.id;

  IF c.purpose = 'task' AND c.task_id IS NOT NULL THEN
    SELECT * INTO t FROM public.tasks WHERE id = c.task_id FOR UPDATE;
    IF t.id IS NOT NULL AND t.publish_state IN ('awaiting_charge', 'pending_payment') THEN
      UPDATE public.tasks
         SET publish_state = 'live', charged_at = now(), pending_payment_since = NULL, payment_reminded_at = NULL
       WHERE id = t.id
       RETURNING * INTO t;
      PERFORM public.task_went_live(t);
      RETURN jsonb_build_object('applied', true, 'purpose', c.purpose, 'task_id', t.id,
                                'user_id', c.user_id, 'amount', c.amount);
    END IF;
    -- Paid for a task that is no longer waiting (deleted, or already live):
    -- keep the money record, grant nothing, let a human refund it.
    UPDATE public.billing_charges SET error = 'task_not_waiting' WHERE id = c.id;
    RETURN jsonb_build_object('applied', false, 'reason', 'task_not_waiting', 'purpose', c.purpose,
                              'user_id', c.user_id);
  END IF;

  RETURN jsonb_build_object('applied', true, 'purpose', c.purpose, 'user_id', c.user_id, 'amount', c.amount);
END;
$$;
REVOKE ALL ON FUNCTION public.billing_charge_paid(UUID, BIGINT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_charge_paid(UUID, BIGINT, BIGINT, TEXT) TO service_role;

-- A task charge failed: the task waits for another card.
CREATE OR REPLACE FUNCTION public.billing_charge_failed(
  _charge_id UUID,
  _reason TEXT,
  _code INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.billing_charges%ROWTYPE;
BEGIN
  PERFORM set_config('app.task_billing_write', '1', true);
  SELECT * INTO c FROM public.billing_charges WHERE id = _charge_id FOR UPDATE;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'charge_not_found';
  END IF;
  -- Only a pending charge can fail; a paid one must never be walked backwards.
  IF c.status <> 'pending' THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'not_pending');
  END IF;

  UPDATE public.billing_charges
     SET status = 'failed', error = left(_reason, 200), response_code = _code
   WHERE id = c.id;

  IF c.purpose = 'task' AND c.task_id IS NOT NULL THEN
    UPDATE public.tasks
       SET publish_state = 'pending_payment',
           pending_payment_since = COALESCE(pending_payment_since, now())
     WHERE id = c.task_id AND publish_state IN ('awaiting_charge', 'pending_payment');
  END IF;

  RETURN jsonb_build_object('applied', true, 'purpose', c.purpose, 'task_id', c.task_id, 'user_id', c.user_id);
END;
$$;
REVOKE ALL ON FUNCTION public.billing_charge_failed(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_charge_failed(UUID, TEXT, INTEGER) TO service_role;

-- The saved card. Written by the server after Cardcom returned a token.
CREATE OR REPLACE FUNCTION public.save_payment_method(
  _user_id UUID, _token TEXT, _card_last4 TEXT, _card_expiry TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.payment_methods (user_id, token, card_expiry, card_last4)
  VALUES (_user_id, _token, _card_expiry, _card_last4)
  ON CONFLICT (user_id) DO UPDATE
    SET token = EXCLUDED.token, card_expiry = EXCLUDED.card_expiry,
        card_last4 = EXCLUDED.card_last4, updated_at = now();
$$;
REVOKE ALL ON FUNCTION public.save_payment_method(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_payment_method(UUID, TEXT, TEXT, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- The free month: a subscription that starts today and is first charged at the
-- end of the month, with the card saved up front. Once per user, ever.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_trial(
  _user_id UUID, _plan_id TEXT, _trial_days INTEGER DEFAULT 30,
  _card_last4 TEXT DEFAULT NULL, _card_expiry TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  used TIMESTAMPTZ;
  existing public.subscriptions%ROWTYPE;
  period_end TIMESTAMPTZ := now() + make_interval(days => _trial_days);
BEGIN
  SELECT free_month_used_at INTO used FROM public.billing_user_state WHERE user_id = _user_id FOR UPDATE;
  IF used IS NOT NULL THEN
    RETURN jsonb_build_object('started', false, 'reason', 'trial_already_used');
  END IF;

  SELECT * INTO existing FROM public.subscriptions WHERE user_id = _user_id FOR UPDATE;
  IF existing.id IS NOT NULL AND (existing.first_paid_at IS NOT NULL OR existing.status IN ('active', 'past_due')) THEN
    RETURN jsonb_build_object('started', false, 'reason', 'already_subscribed');
  END IF;

  INSERT INTO public.subscriptions (
    user_id, plan_id, status, current_period_start, current_period_end,
    card_last4, card_expiry, is_trial
  ) VALUES (
    _user_id, _plan_id, 'active', now(), period_end, _card_last4, _card_expiry, true
  )
  ON CONFLICT (user_id) DO UPDATE
    SET plan_id = EXCLUDED.plan_id, status = 'active',
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        cancel_at_period_end = false, canceled_at = NULL,
        renewal_attempts = 0, next_attempt_at = NULL,
        card_last4 = EXCLUDED.card_last4, card_expiry = EXCLUDED.card_expiry,
        is_trial = true;

  INSERT INTO public.billing_user_state (user_id, free_month_used_at)
  VALUES (_user_id, now())
  ON CONFLICT (user_id) DO UPDATE SET free_month_used_at = now(), updated_at = now();

  RETURN jsonb_build_object('started', true, 'period_end', period_end);
END;
$$;
REVOKE ALL ON FUNCTION public.start_trial(UUID, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_trial(UUID, TEXT, INTEGER, TEXT, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- Plan change. Upgrade is immediate (the caller charged the difference first);
-- a downgrade is only scheduled and applied by the next renewal.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_plan_upgrade(_user_id UUID, _plan_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  plan public.billing_plans%ROWTYPE;
  s public.subscriptions%ROWTYPE;
  new_end TIMESTAMPTZ;
BEGIN
  SELECT * INTO plan FROM public.billing_plans WHERE id = _plan_id;
  SELECT * INTO s FROM public.subscriptions WHERE user_id = _user_id FOR UPDATE;
  IF plan.id IS NULL OR s.id IS NULL OR s.status <> 'active' THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'not_applicable');
  END IF;
  new_end := now() + make_interval(months => plan.period_months);
  UPDATE public.subscriptions
     SET plan_id = plan.id, current_period_start = now(), current_period_end = new_end,
         pending_plan_id = NULL, cancel_at_period_end = false, canceled_at = NULL,
         renewal_attempts = 0, next_attempt_at = NULL, is_trial = false
   WHERE id = s.id;
  RETURN jsonb_build_object('applied', true, 'period_end', new_end);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_plan_upgrade(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_plan_upgrade(UUID, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 14-day cancellation with refund.
--
-- Eligible when: the latest paid order is at most 14 days old, was not already
-- refunded, and this user never used a 14-day refund before.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_refund_eligibility(_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  st public.billing_user_state%ROWTYPE;
  o public.payment_orders%ROWTYPE;
  s public.subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO st FROM public.billing_user_state WHERE user_id = _user_id;
  IF st.refund_14d_used_at IS NOT NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'refund_already_used');
  END IF;

  SELECT * INTO s FROM public.subscriptions WHERE user_id = _user_id;
  IF s.id IS NULL OR s.status NOT IN ('active', 'past_due') THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'no_active_subscription');
  END IF;

  SELECT * INTO o FROM public.payment_orders
   WHERE user_id = _user_id AND status = 'paid' AND deal_number IS NOT NULL
   ORDER BY paid_at DESC LIMIT 1;
  IF o.id IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'nothing_to_refund');
  END IF;
  IF o.paid_at < now() - interval '14 days' THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'window_passed');
  END IF;

  RETURN jsonb_build_object('eligible', true, 'order_id', o.id, 'deal_number', o.deal_number,
                            'amount', o.amount, 'paid_at', o.paid_at);
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_refund_eligibility(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_refund_eligibility(UUID) TO service_role;

-- The tasks a cancelling user can still choose about, and the ones that are
-- locked because a worker already took them. The first task ever is neither:
-- it stays free and is never counted in the difference.
CREATE OR REPLACE FUNCTION public.cancel_task_plan(_user_id UUID)
RETURNS TABLE (task_id UUID, name TEXT, locked BOOLEAN, is_first BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.name,
         (t.status <> 'open' OR t.accepted_count > 0 OR t.status = 'completed') AS locked,
         (t.id = st.first_task_id) AS is_first
    FROM public.tasks t
    LEFT JOIN public.billing_user_state st ON st.user_id = t.creator_id
   WHERE t.creator_id = _user_id
     AND t.publish_state = 'live'
     AND t.archived_at IS NULL
     AND t.status NOT IN ('cancelled')
   ORDER BY t.created_at;
$$;
REVOKE ALL ON FUNCTION public.cancel_task_plan(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_task_plan(UUID) TO service_role;

-- Final step of a refund cancellation, after the difference was charged and the
-- refund went through: remove the tasks the user chose to drop, end the
-- subscription now, and use up the once-only refund.
CREATE OR REPLACE FUNCTION public.apply_refund_cancellation(_user_id UUID, _delete_task_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed INTEGER;
BEGIN
  PERFORM set_config('app.task_billing_write', '1', true);
  -- Only tasks nobody has taken, and never the first one.
  DELETE FROM public.tasks t
   WHERE t.creator_id = _user_id
     AND t.id = ANY(COALESCE(_delete_task_ids, ARRAY[]::UUID[]))
     AND t.status = 'open' AND t.accepted_count = 0
     AND t.id IS DISTINCT FROM (SELECT first_task_id FROM public.billing_user_state WHERE user_id = _user_id);
  GET DIAGNOSTICS removed = ROW_COUNT;

  UPDATE public.subscriptions
     SET status = 'canceled', canceled_at = now(), current_period_end = now(),
         cancel_at_period_end = false, next_attempt_at = NULL, pending_plan_id = NULL
   WHERE user_id = _user_id;

  INSERT INTO public.billing_user_state (user_id, refund_14d_used_at)
  VALUES (_user_id, now())
  ON CONFLICT (user_id) DO UPDATE SET refund_14d_used_at = now(), updated_at = now();

  RETURN jsonb_build_object('removed', removed);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_refund_cancellation(UUID, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_refund_cancellation(UUID, UUID[]) TO service_role;

-- ---------------------------------------------------------------------------
-- Hourly upkeep, called by billing-renew.
--   * a task waiting for payment gets a reminder after 3 days, and goes back
--     to a draft after 7 (never charged, never deleted);
--   * when a subscription is over, the owner's untouched open tasks are hidden
--     (right away after a failed-payment expiry, 14 days after a cancellation),
--     all but the first one ever published;
--   * hidden tasks are deleted 60 days after being hidden.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.task_billing_maintenance()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  drafted INTEGER := 0;
  reminded INTEGER := 0;
  hidden INTEGER := 0;
  deleted INTEGER := 0;
  r RECORD;
BEGIN
  PERFORM set_config('app.task_billing_write', '1', true);

  -- 7 days without a payment: back to the owner as a draft.
  FOR r IN
    UPDATE public.tasks
       SET publish_state = 'draft', pending_payment_since = NULL, payment_reminded_at = NULL
     WHERE publish_state = 'pending_payment'
       AND pending_payment_since <= now() - interval '7 days'
    RETURNING id, creator_id, name
  LOOP
    drafted := drafted + 1;
    INSERT INTO public.notifications (user_id, event_type, data, link)
    VALUES (r.creator_id, 'task_returned_to_draft', jsonb_build_object('task_id', r.id, 'task_name', r.name),
            '/my-tasks?tab=published');
  END LOOP;

  -- Day 3: one reminder.
  FOR r IN
    UPDATE public.tasks
       SET payment_reminded_at = now()
     WHERE publish_state = 'pending_payment'
       AND payment_reminded_at IS NULL
       AND pending_payment_since <= now() - interval '3 days'
    RETURNING id, creator_id, name
  LOOP
    reminded := reminded + 1;
    INSERT INTO public.notifications (user_id, event_type, data, link)
    VALUES (r.creator_id, 'task_payment_reminder', jsonb_build_object('task_id', r.id, 'task_name', r.name),
            '/my-tasks?tab=published');
  END LOOP;

  -- Subscriptions that are over: hide the untouched open tasks.
  FOR r IN
    WITH ended AS (
      SELECT user_id FROM public.subscriptions s
       WHERE (s.status = 'expired')
          OR (s.status = 'canceled' AND s.current_period_end <= now() - interval '14 days')
    ),
    hidden_rows AS (
      UPDATE public.tasks t
         SET publish_state = 'hidden', hidden_at = now()
        FROM ended e
       WHERE t.creator_id = e.user_id
         AND t.publish_state = 'live'
         AND t.status = 'open' AND t.accepted_count = 0
         AND t.id IS DISTINCT FROM (SELECT first_task_id FROM public.billing_user_state WHERE user_id = t.creator_id)
      RETURNING t.creator_id
    )
    SELECT creator_id, count(*) AS n FROM hidden_rows GROUP BY creator_id
  LOOP
    hidden := hidden + r.n;
    INSERT INTO public.notifications (user_id, event_type, data, link)
    VALUES (r.creator_id, 'tasks_hidden', jsonb_build_object('count', r.n), '/subscription');
  END LOOP;

  -- 60 days after being hidden: gone for good.
  DELETE FROM public.tasks
   WHERE publish_state = 'hidden' AND hidden_at <= now() - interval '60 days'
     AND status = 'open' AND accepted_count = 0;
  GET DIAGNOSTICS deleted = ROW_COUNT;

  RETURN jsonb_build_object('drafted', drafted, 'reminded', reminded, 'hidden', hidden, 'deleted', deleted);
END;
$$;
REVOKE ALL ON FUNCTION public.task_billing_maintenance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.task_billing_maintenance() TO service_role;

-- Return a draft to the review queue (the owner pays again, from the UI).
CREATE OR REPLACE FUNCTION public.resubmit_draft_task(_task_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.tasks%ROWTYPE;
  quote JSONB;
BEGIN
  PERFORM set_config('app.task_billing_write', '1', true);
  SELECT * INTO t FROM public.tasks WHERE id = _task_id AND creator_id = auth.uid() FOR UPDATE;
  IF t.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'task_not_found');
  END IF;
  IF t.publish_state NOT IN ('draft', 'rejected') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_draft');
  END IF;
  quote := public.task_publish_quote(t.creator_id, t.insurance);
  IF (quote->>'due')::NUMERIC > 0 AND NOT (quote->>'has_card')::BOOLEAN THEN
    RETURN jsonb_build_object('ok', false, 'error', 'card_required');
  END IF;
  UPDATE public.tasks
     SET publish_state = 'pending_review', payment_due = (quote->>'due')::NUMERIC,
         uses_free_slot = (quote->>'free_slot')::BOOLEAN,
         reviewed_by = NULL, reviewed_at = NULL, review_note = NULL,
         pending_payment_since = NULL, payment_reminded_at = NULL
   WHERE id = t.id;
  RETURN jsonb_build_object('ok', true, 'due', (quote->>'due')::NUMERIC);
END;
$$;
REVOKE ALL ON FUNCTION public.resubmit_draft_task(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_draft_task(UUID) TO authenticated;
