-- One free month per person: survives deletion, dots, "+tag" and a reused card.
DO $$
DECLARE
  a UUID := gen_random_uuid(); b UUID := gen_random_uuid(); c UUID := gen_random_uuid();
  d UUID := gen_random_uuid(); e UUID := gen_random_uuid();
  r JSONB;
BEGIN
  IF public.normalize_trial_phone('+972 50-123-4567') <> public.normalize_trial_phone('0501234567') THEN RAISE EXCEPTION 'phone normalization'; END IF;

  INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
    (a, 'jo.hn+1@gmail.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (c, 'someone.else@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (d, 'unrelated@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (e, 'phone.twin@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  -- A signup trigger already created the profiles; only the phones are set here.
  UPDATE public.profiles SET phone = '050-123-4567' WHERE user_id = a;
  UPDATE public.profiles SET phone = '+972501234567' WHERE user_id = e;

  r := public.start_trial(a, 'quarterly', 30, '1111', '1230');
  IF r->>'started' <> 'true' THEN RAISE EXCEPTION 'first person gets the month: %', r; END IF;

  -- Deleting the account must not give the month back.
  DELETE FROM auth.users WHERE id = a;
  IF EXISTS (SELECT 1 FROM public.billing_user_state WHERE user_id = a) THEN RAISE EXCEPTION 'setup: state should be gone'; END IF;

  -- Same mailbox in another spelling, registered after the first account is gone.
  INSERT INTO auth.users (id, email, instance_id, aud, role)
    VALUES (b, 'john+2@googlemail.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  IF NOT public.trial_precheck(b) THEN RAISE EXCEPTION 'dots and plus tag must still match'; END IF;
  IF public.start_trial(b, 'quarterly', 30, '2222', '0131')->>'started' <> 'false' THEN RAISE EXCEPTION 'same email, new account'; END IF;

  IF public.start_trial(c, 'quarterly', 30, '1111', '1230')->>'started' <> 'false' THEN RAISE EXCEPTION 'same card, new email'; END IF;
  IF NOT public.trial_precheck(e) THEN RAISE EXCEPTION 'same phone must match'; END IF;

  IF public.trial_precheck(d) THEN RAISE EXCEPTION 'a stranger must not match'; END IF;
  r := public.start_trial(d, 'quarterly', 30, '3333', '0929');
  IF r->>'started' <> 'true' THEN RAISE EXCEPTION 'a stranger gets the month: %', r; END IF;

  IF (SELECT count(*) FROM public.trial_blocks) <> 4 THEN RAISE EXCEPTION 'every refusal is logged, got %', (SELECT count(*) FROM public.trial_blocks); END IF;
  IF EXISTS (SELECT 1 FROM public.trial_fingerprints WHERE fingerprint LIKE '%@%' OR fingerprint LIKE '%1111%') THEN RAISE EXCEPTION 'no raw values stored'; END IF;
  RAISE NOTICE 'trial fingerprint invariants passed';
END $$;

-- The admin screen's read: admins only.
DO $$
DECLARE adm UUID := gen_random_uuid(); usr UUID := gen_random_uuid(); r JSONB; denied BOOLEAN := false;
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
    (adm, adm::TEXT || '@admin.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (usr, usr::TEXT || '@user.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  INSERT INTO public.user_roles (user_id, role) VALUES (adm, 'admin');
  INSERT INTO public.trial_blocks (user_id, stage, matched_kinds) VALUES (usr, 'precheck', ARRAY['email']);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', usr, 'role', 'authenticated')::TEXT, true);
  BEGIN PERFORM public.admin_trial_blocks(10); EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'a non-admin must be refused'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::TEXT, true);
  r := public.admin_trial_blocks(10);
  IF jsonb_array_length(r->'recent') < 1 OR jsonb_array_length(r->'daily') < 1 THEN RAISE EXCEPTION 'admin sees the blocks: %', r; END IF;
  RAISE NOTICE 'admin trial blocks read passed';
END $$;
