-- Database-level scenarios for per-task billing. Run against a local stack:
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/task_billing.test.sql
-- Everything runs in one transaction that is rolled back, so it leaves nothing.
BEGIN;

-- Start from the shipped default, whatever an earlier run left behind.
UPDATE public.billing_settings SET value = 'off' WHERE key = 'task_billing';
-- The scenarios below assume the shipped fees, whatever an admin set since.
UPDATE public.billing_settings SET value = '3.00' WHERE key = 'task_fee';
UPDATE public.billing_settings SET value = '5.00' WHERE key = 'insurance_fee';

CREATE FUNCTION pg_temp.expect(_what TEXT, _ok BOOLEAN) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF NOT _ok THEN RAISE EXCEPTION 'FAILED: %', _what; END IF;
  RAISE NOTICE 'ok: %', _what;
END $$;

CREATE FUNCTION pg_temp.mk_user(_email TEXT) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE u UUID := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES (u, _email, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  INSERT INTO public.user_roles (user_id, role) VALUES (u, 'tasker');
  RETURN u;
END $$;

CREATE FUNCTION pg_temp.mk_task(_user UUID, _insurance BOOLEAN DEFAULT false) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE t UUID;
BEGIN
  INSERT INTO public.tasks (creator_id, category, name, short_desc, payment, insurance)
  VALUES (_user, 'housework', 'task', 'desc', 50, _insurance) RETURNING id INTO t;
  RETURN t;
END $$;

DO $$
DECLARE
  a UUID; b UUID; sub UUID; t1 UUID; t2 UUID; t3 UUID; t4 UUID; r JSONB; row_ public.tasks%ROWTYPE; failed BOOLEAN;
  charge UUID;
BEGIN
  a := pg_temp.mk_user('a@test.local');
  b := pg_temp.mk_user('b@test.local');
  sub := pg_temp.mk_user('sub@test.local');

  -- 1. Switch off: nothing changes for anyone.
  t1 := pg_temp.mk_task(a, true);
  SELECT * INTO row_ FROM public.tasks WHERE id = t1;
  PERFORM pg_temp.expect('flag off: task is live, no charge', row_.publish_state = 'live' AND row_.payment_due = 0 AND NOT row_.insurance);
  DELETE FROM public.tasks WHERE id = t1;

  UPDATE public.billing_settings SET value = 'on' WHERE key = 'task_billing';

  -- 2. First task: free, goes to review.
  t1 := pg_temp.mk_task(a);
  SELECT * INTO row_ FROM public.tasks WHERE id = t1;
  PERFORM pg_temp.expect('first task: pending_review, free, uses free slot',
    row_.publish_state = 'pending_review' AND row_.payment_due = 0 AND row_.uses_free_slot);

  -- 3. A second one while the first waits cannot ride the same free slot, and a
  --    paid task needs a saved card.
  failed := false;
  BEGIN
    PERFORM pg_temp.mk_task(a);
  EXCEPTION WHEN OTHERS THEN
    failed := SQLERRM = 'card_required';
  END;
  PERFORM pg_temp.expect('second task without a card is refused (card_required)', failed);

  INSERT INTO public.payment_methods (user_id, token, card_expiry, card_last4) VALUES (a, 'tok-a', '1230', '4242');
  t2 := pg_temp.mk_task(a);
  SELECT * INTO row_ FROM public.tasks WHERE id = t2;
  PERFORM pg_temp.expect('second task costs 3 and does not use the free slot', row_.payment_due = 3 AND NOT row_.uses_free_slot);
  t3 := pg_temp.mk_task(a, true);
  SELECT * INTO row_ FROM public.tasks WHERE id = t3;
  PERFORM pg_temp.expect('insurance adds 5 (3 + 5 = 8)', row_.payment_due = 8 AND row_.insurance);

  -- 4. Approving the free task: live at once, benefits recorded at user level.
  r := public.task_review_decide(t1, a, true, null);
  PERFORM pg_temp.expect('free task approved goes live', r->>'state' = 'live');
  PERFORM pg_temp.expect('free slot and first task recorded',
    (SELECT free_task_used_at IS NOT NULL AND first_task_id = t1 FROM public.billing_user_state WHERE user_id = a));

  -- 5. Deleting the first task does not give the free slot back.
  DELETE FROM public.tasks WHERE id = t1;
  t4 := pg_temp.mk_task(a);
  SELECT * INTO row_ FROM public.tasks WHERE id = t4;
  PERFORM pg_temp.expect('after deleting the first task the next one still costs 3', row_.payment_due = 3 AND NOT row_.uses_free_slot);

  -- 6. Paid task: approval does not publish, the charge does.
  r := public.task_review_decide(t2, a, true, null);
  PERFORM pg_temp.expect('paid task approved waits for the charge', r->>'state' = 'awaiting_charge' AND (r->>'due')::NUMERIC = 3);
  PERFORM pg_temp.expect('awaiting_charge is not visible as live',
    (SELECT publish_state FROM public.tasks WHERE id = t2) = 'awaiting_charge');

  INSERT INTO public.billing_charges (user_id, purpose, task_id, amount) VALUES (a, 'task', t2, 3) RETURNING id INTO charge;
  r := public.billing_charge_failed(charge, 'declined', 5);
  PERFORM pg_temp.expect('failed charge -> pending_payment',
    (SELECT publish_state FROM public.tasks WHERE id = t2) = 'pending_payment');

  INSERT INTO public.billing_charges (user_id, purpose, task_id, amount) VALUES (a, 'task', t2, 3) RETURNING id INTO charge;
  r := public.billing_charge_paid(charge, 111, null, null);
  PERFORM pg_temp.expect('paid charge -> live', (SELECT publish_state FROM public.tasks WHERE id = t2) = 'live');
  r := public.billing_charge_paid(charge, 111, null, null);
  PERFORM pg_temp.expect('settling twice is a no-op', (r->>'applied')::BOOLEAN = false);

  -- 7. Rejected: costs nothing and does not consume the free slot.
  r := public.task_review_decide(t3, a, false, 'no');
  PERFORM pg_temp.expect('rejected', r->>'state' = 'rejected');
  t1 := pg_temp.mk_task(b);
  r := public.task_review_decide(t1, b, false, 'no');
  t2 := pg_temp.mk_task(b);
  SELECT * INTO row_ FROM public.tasks WHERE id = t2;
  PERFORM pg_temp.expect('rejected task did not use the free slot', row_.payment_due = 0 AND row_.uses_free_slot);

  -- 8. A subscriber pays nothing per task, insurance only.
  INSERT INTO public.subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
  VALUES (sub, 'quarterly', 'active', now(), now() + interval '90 days');
  INSERT INTO public.payment_methods (user_id, token) VALUES (sub, 'tok-s');
  t1 := pg_temp.mk_task(sub);
  t2 := pg_temp.mk_task(sub, true);
  PERFORM pg_temp.expect('subscriber: no fee', (SELECT payment_due FROM public.tasks WHERE id = t1) = 0);
  PERFORM pg_temp.expect('subscriber with insurance: 5', (SELECT payment_due FROM public.tasks WHERE id = t2) = 5);

  -- 9. Limits: 5 submissions per hour.
  failed := false;
  BEGIN
    PERFORM pg_temp.mk_task(sub);
    PERFORM pg_temp.mk_task(sub);
    PERFORM pg_temp.mk_task(sub);
    PERFORM pg_temp.mk_task(sub);
  EXCEPTION WHEN OTHERS THEN
    failed := SQLERRM = 'too_many_submissions';
  END;
  PERFORM pg_temp.expect('rate limit: too_many_submissions', failed);
END $$;

-- 10. A signed-in client cannot move its own task between states.
DO $$
DECLARE u UUID; t UUID; failed BOOLEAN := false;
BEGIN
  -- The server commands above set the write flag for this transaction; a real
  -- client request is its own transaction, so clear it to act like one.
  PERFORM set_config('app.task_billing_write', '', true);
  u := pg_temp.mk_user('c@test.local');
  t := pg_temp.mk_task(u);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', u)::TEXT, true);
  BEGIN
    UPDATE public.tasks SET publish_state = 'live' WHERE id = t;
  EXCEPTION WHEN OTHERS THEN
    failed := SQLERRM = 'immutable_task_billing_fields';
  END;
  PERFORM pg_temp.expect('client cannot publish its own task', failed);
  failed := false;
  BEGIN
    UPDATE public.tasks SET payment_due = 0, insurance = true WHERE id = t;
  EXCEPTION WHEN OTHERS THEN
    failed := SQLERRM = 'immutable_task_billing_fields';
  END;
  PERFORM pg_temp.expect('client cannot change its own price', failed);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- 11. Maintenance: reminder at 3 days, draft at 7, hide on expiry, delete at 60.
-- Tasks are created with the switch off (so they are live) and then put in the
-- state under test, the way the server paths would have left them.
DO $$
DECLARE u UUID; t1 UUID; t2 UUID; r JSONB;
BEGIN
  u := pg_temp.mk_user('d@test.local');
  UPDATE public.billing_settings SET value = 'off' WHERE key = 'task_billing';
  PERFORM set_config('app.task_billing_write', '1', true);
  INSERT INTO public.billing_user_state (user_id, free_task_used_at) VALUES (u, now());

  t1 := pg_temp.mk_task(u);
  t2 := pg_temp.mk_task(u);
  UPDATE public.tasks SET publish_state = 'pending_payment', pending_payment_since = now() - interval '4 days' WHERE id = t1;
  UPDATE public.tasks SET publish_state = 'pending_payment', pending_payment_since = now() - interval '8 days' WHERE id = t2;
  r := public.task_billing_maintenance();
  PERFORM pg_temp.expect('4 days pending: reminded',
    (SELECT payment_reminded_at IS NOT NULL AND publish_state = 'pending_payment' FROM public.tasks WHERE id = t1));
  PERFORM pg_temp.expect('8 days pending: back to draft', (SELECT publish_state FROM public.tasks WHERE id = t2) = 'draft');

  -- Expired subscription: open untouched tasks hidden, the first one kept.
  t1 := pg_temp.mk_task(u);
  t2 := pg_temp.mk_task(u);
  UPDATE public.billing_user_state SET first_task_id = t1 WHERE user_id = u;
  INSERT INTO public.subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
  VALUES (u, 'quarterly', 'expired', now() - interval '100 days', now() - interval '15 days');
  r := public.task_billing_maintenance();
  PERFORM pg_temp.expect('expired: second hidden', (SELECT publish_state FROM public.tasks WHERE id = t2) = 'hidden');
  PERFORM pg_temp.expect('expired: first task stays live', (SELECT publish_state FROM public.tasks WHERE id = t1) = 'live');

  -- Resubscribing brings them back.
  UPDATE public.subscriptions SET status = 'active', current_period_end = now() + interval '30 days' WHERE user_id = u;
  PERFORM pg_temp.expect('resubscribe: hidden task is live again', (SELECT publish_state FROM public.tasks WHERE id = t2) = 'live');

  -- 60 days after hiding: deleted.
  UPDATE public.subscriptions SET status = 'expired' WHERE user_id = u;
  PERFORM public.task_billing_maintenance();
  UPDATE public.tasks SET hidden_at = now() - interval '61 days' WHERE id = t2;
  PERFORM public.task_billing_maintenance();
  PERFORM pg_temp.expect('hidden 61 days: deleted', NOT EXISTS (SELECT 1 FROM public.tasks WHERE id = t2));
END $$;

-- 13. The free task goes to the first task APPROVED, not the first submitted.
DO $$
DECLARE u UUID; a UUID; b UUID; r JSONB; row_ public.tasks%ROWTYPE;
BEGIN
  UPDATE public.billing_settings SET value = 'on' WHERE key = 'task_billing';
  u := pg_temp.mk_user('f@test.local');
  a := pg_temp.mk_task(u);
  INSERT INTO public.payment_methods (user_id, token, card_expiry, card_last4) VALUES (u, 'tok-f', '1230', '4242');
  b := pg_temp.mk_task(u);
  PERFORM pg_temp.expect('submit: first looks free, second looks paid',
    (SELECT payment_due FROM public.tasks WHERE id = a) = 0 AND (SELECT payment_due FROM public.tasks WHERE id = b) = 3);
  PERFORM pg_temp.expect('submit: the fee is stored on both',
    (SELECT fee_amount FROM public.tasks WHERE id = a) = 3 AND (SELECT fee_amount FROM public.tasks WHERE id = b) = 3);

  -- The admin approves the SECOND one first: it is the free one.
  r := public.task_review_decide(b, u, true, null);
  PERFORM pg_temp.expect('approved first is free and live even if submitted second',
    r->>'state' = 'live' AND (r->>'due')::NUMERIC = 0);
  SELECT * INTO row_ FROM public.tasks WHERE id = b;
  PERFORM pg_temp.expect('it holds the free slot', row_.uses_free_slot AND row_.payment_due = 0);

  -- The first one, approved later, now pays.
  r := public.task_review_decide(a, u, true, null);
  PERFORM pg_temp.expect('approved second pays the fee', r->>'state' = 'awaiting_charge' AND (r->>'due')::NUMERIC = 3);
  SELECT * INTO row_ FROM public.tasks WHERE id = a;
  PERFORM pg_temp.expect('and does not hold the free slot', NOT row_.uses_free_slot AND row_.payment_due = 3);
END $$;

DO $$
DECLARE u UUID; a UUID; b UUID; r JSONB;
BEGIN
  -- Two waiting tasks: rejecting the one that looked free hands the slot over.
  u := pg_temp.mk_user('g@test.local');
  a := pg_temp.mk_task(u);
  INSERT INTO public.payment_methods (user_id, token, card_expiry, card_last4) VALUES (u, 'tok-g', '1230', '4242');
  b := pg_temp.mk_task(u);
  r := public.task_review_decide(a, u, false, 'no');
  r := public.task_review_decide(b, u, true, null);
  PERFORM pg_temp.expect('rejecting the free-looking one makes the other free',
    r->>'state' = 'live' AND (r->>'due')::NUMERIC = 0);

  -- Insurance is always charged, even on the free task.
  u := pg_temp.mk_user('h@test.local');
  INSERT INTO public.payment_methods (user_id, token, card_expiry, card_last4) VALUES (u, 'tok-h', '1230', '4242');
  a := pg_temp.mk_task(u, true);
  b := pg_temp.mk_task(u);
  r := public.task_review_decide(b, u, true, null);
  PERFORM pg_temp.expect('free task approved first: fee waived', r->>'state' = 'live');
  r := public.task_review_decide(a, u, true, null);
  PERFORM pg_temp.expect('insurance task approved second: fee 3 + insurance 5 = 8',
    r->>'state' = 'awaiting_charge' AND (r->>'due')::NUMERIC = 8);

  -- Insurance on the task that takes the free slot: only the insurance is due.
  u := pg_temp.mk_user('i@test.local');
  INSERT INTO public.payment_methods (user_id, token, card_expiry, card_last4) VALUES (u, 'tok-i', '1230', '4242');
  a := pg_temp.mk_task(u, true);
  r := public.task_review_decide(a, u, true, null);
  PERFORM pg_temp.expect('free task with insurance: pays only 5', r->>'state' = 'awaiting_charge' AND (r->>'due')::NUMERIC = 5);
  PERFORM pg_temp.expect('and holds the free slot', (SELECT uses_free_slot FROM public.tasks WHERE id = a));

  -- A subscriber never takes the free slot.
  u := pg_temp.mk_user('j@test.local');
  INSERT INTO public.subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
  VALUES (u, 'quarterly', 'active', now(), now() + interval '90 days');
  a := pg_temp.mk_task(u);
  r := public.task_review_decide(a, u, true, null);
  PERFORM pg_temp.expect('subscriber task: live, no free slot used',
    r->>'state' = 'live' AND NOT (SELECT uses_free_slot FROM public.tasks WHERE id = a));
END $$;

-- 14. A paid task that is deleted or rejected is queued for a refund, once.
DO $$
DECLARE u UUID; t UUID; t2 UUID; t3 UUID; charge UUID; claimed JSONB; rid UUID; r JSONB;
BEGIN
  UPDATE public.billing_settings SET value = 'on' WHERE key = 'task_billing';
  u := pg_temp.mk_user('k@test.local');
  INSERT INTO public.payment_methods (user_id, token, card_expiry, card_last4) VALUES (u, 'tok-k', '1230', '4242');
  INSERT INTO public.billing_user_state (user_id, free_task_used_at) VALUES (u, now());

  t := pg_temp.mk_task(u);
  r := public.task_review_decide(t, u, true, null);
  INSERT INTO public.billing_charges (user_id, purpose, task_id, amount) VALUES (u, 'task', t, 3) RETURNING id INTO charge;
  PERFORM public.billing_charge_paid(charge, 4242, null, null);
  PERFORM pg_temp.expect('paid task is live', (SELECT publish_state FROM public.tasks WHERE id = t) = 'live');

  UPDATE public.tasks SET archived_at = now() WHERE id = t;
  PERFORM pg_temp.expect('deleting a paid task queues one refund of 3',
    (SELECT count(*) FROM public.task_refunds WHERE task_id = t AND status = 'requested' AND amount = 3 AND reason = 'deleted') = 1);

  -- Touching the task again does not queue a second refund.
  UPDATE public.tasks SET archived_at = now() + interval '1 second' WHERE id = t;
  UPDATE public.tasks SET name = 'renamed' WHERE id = t;
  PERFORM pg_temp.expect('never two refunds for one task', (SELECT count(*) FROM public.task_refunds WHERE task_id = t) = 1);

  -- The worker claims it once; a second claim gets nothing.
  SELECT id INTO rid FROM public.task_refunds WHERE task_id = t;
  claimed := public.task_refund_claim(rid);
  PERFORM pg_temp.expect('claim returns the paid charge', jsonb_array_length(claimed->'charges') = 1);
  PERFORM pg_temp.expect('a second claim gets nothing', public.task_refund_claim(rid) IS NULL);

  PERFORM public.task_refund_charge_done(charge);
  PERFORM public.task_refund_finish(rid, true, 0, null);
  PERFORM pg_temp.expect('charge marked refunded',
    (SELECT status = 'refunded' AND refunded_at IS NOT NULL FROM public.billing_charges WHERE id = charge));
  PERFORM pg_temp.expect('refund marked succeeded', (SELECT status = 'succeeded' FROM public.task_refunds WHERE id = rid));
  PERFORM public.task_refund_finish(rid, false, 5, 'late');
  PERFORM pg_temp.expect('a finished refund cannot be rewritten', (SELECT status = 'succeeded' FROM public.task_refunds WHERE id = rid));

  -- Nothing was charged -> nothing to refund.
  t2 := pg_temp.mk_task(u);
  r := public.task_review_decide(t2, u, false, 'no');
  UPDATE public.tasks SET archived_at = now() WHERE id = t2;
  PERFORM pg_temp.expect('rejected or deleted without a charge queues no refund',
    NOT EXISTS (SELECT 1 FROM public.task_refunds WHERE task_id = t2));

  -- A paid task rejected after the charge (state moved to rejected) is queued too.
  t3 := pg_temp.mk_task(u);
  r := public.task_review_decide(t3, u, true, null);
  INSERT INTO public.billing_charges (user_id, purpose, task_id, amount) VALUES (u, 'task', t3, 3) RETURNING id INTO charge;
  PERFORM public.billing_charge_paid(charge, 5151, null, null);
  PERFORM set_config('app.task_billing_write', '1', true);
  UPDATE public.tasks SET publish_state = 'rejected' WHERE id = t3;
  PERFORM pg_temp.expect('rejection after the charge queues a refund',
    (SELECT count(*) FROM public.task_refunds WHERE task_id = t3 AND reason = 'rejected') = 1);

  -- Only the confirmed deal counts: a charge without a Cardcom deal is not refundable.
  PERFORM pg_temp.expect('refunds are not readable by a client',
    NOT has_table_privilege('authenticated', 'public.task_refunds', 'INSERT'));
END $$;

-- 12. Free month once, refund once.
DO $$
DECLARE u UUID; r JSONB;
BEGIN
  u := pg_temp.mk_user('e@test.local');
  r := public.start_trial(u, 'quarterly', 30, '4242', '1230');
  PERFORM pg_temp.expect('trial starts', (r->>'started')::BOOLEAN);
  PERFORM pg_temp.expect('trial counts as an active subscription', public.has_active_subscription(u));
  UPDATE public.subscriptions SET status = 'canceled' WHERE user_id = u;
  r := public.start_trial(u, 'quarterly', 30, '4242', '1230');
  PERFORM pg_temp.expect('second free month refused', r->>'reason' = 'trial_already_used');
  r := public.cancel_refund_eligibility(u);
  PERFORM pg_temp.expect('no refund without an active paid subscription', NOT (r->>'eligible')::BOOLEAN);
END $$;

ROLLBACK;
