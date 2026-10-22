BEGIN;
UPDATE public.billing_settings SET value = 'on' WHERE key = 'task_billing';
DO $$
DECLARE u UUID := gen_random_uuid(); t UUID; r JSONB; failed BOOLEAN := false;
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role)
    VALUES (u, u::TEXT || '@choice.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  INSERT INTO public.user_roles (user_id, role) VALUES (u, 'tasker');
  INSERT INTO public.billing_user_state (user_id, free_task_used_at) VALUES (u, now());
  BEGIN
    INSERT INTO public.tasks (creator_id, category, name, short_desc, payment)
      VALUES (u, 'housework', 'saved', 'test', 10);
  EXCEPTION WHEN OTHERS THEN
    failed := SQLERRM = 'card_required';
  END;
  IF NOT failed THEN RAISE EXCEPTION 'saved-card mode must require a card'; END IF;
  INSERT INTO public.tasks (creator_id, category, name, short_desc, payment, payment_mode)
    VALUES (u, 'housework', 'manual', 'test', 10, 'one_time') RETURNING id INTO t;
  r := public.task_review_decide(t, u, true, NULL);
  IF r->>'state' <> 'pending_payment' THEN RAISE EXCEPTION 'manual approval must wait for payment: %', r; END IF;
  IF EXISTS (SELECT 1 FROM billing_charges WHERE task_id = t) THEN RAISE EXCEPTION 'manual task must not be charged automatically'; END IF;
  PERFORM set_config('app.task_billing_write', '', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  failed := false;
  BEGIN
    UPDATE public.tasks SET payment_mode = 'saved_card' WHERE id = t;
  EXCEPTION WHEN OTHERS THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'payment mode must not change after submission'; END IF;
  RAISE NOTICE 'payment choice invariants passed';
END $$;
ROLLBACK;
