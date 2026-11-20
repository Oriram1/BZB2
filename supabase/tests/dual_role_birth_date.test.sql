-- Isolated local database only; fixture data is rolled back.
BEGIN;
SELECT set_config('test.adult', gen_random_uuid()::text, true);
SELECT set_config('test.minor', gen_random_uuid()::text, true);
INSERT INTO auth.users(id,email,instance_id,aud,role)
SELECT current_setting('test.' || label)::uuid, label || '@dual-test.invalid',
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
FROM unnest(ARRAY['adult','minor']) AS label;
INSERT INTO public.user_roles(user_id,role) VALUES
  (current_setting('test.adult')::uuid,'bee'),
  (current_setting('test.minor')::uuid,'bee');
SELECT set_config('request.jwt.claims', json_build_object('role','authenticated','sub',current_setting('test.adult'))::text,true);
SET LOCAL ROLE authenticated;
SELECT public.set_my_birth_date((CURRENT_DATE - INTERVAL '20 years')::date);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND age=20) THEN
    RAISE EXCEPTION 'profile_age_not_synced';
  END IF;
END $$;
SELECT public.switch_my_role('tasker');
DO $$ BEGIN
  IF has_table_privilege('authenticated', 'private.user_birth_dates', 'SELECT') THEN
    RAISE EXCEPTION 'birth_dates_exposed';
  END IF;
  BEGIN
    PERFORM public.switch_my_role('admin');
    RAISE EXCEPTION 'admin_escalation_allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'role_switch_not_allowed' THEN RAISE; END IF;
  END;
  IF public.get_my_active_role() <> 'tasker' THEN RAISE EXCEPTION 'active_role_not_saved'; END IF;
  IF (SELECT count(*) FROM public.user_roles WHERE user_id=auth.uid() AND role IN ('bee','tasker')) <> 2 THEN
    RAISE EXCEPTION 'both_roles_must_survive';
  END IF;
  BEGIN
    PERFORM public.set_my_birth_date((CURRENT_DATE - INTERVAL '30 years')::date);
    RAISE EXCEPTION 'birth_date_changed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'birth_date_already_set' THEN RAISE; END IF;
  END;
END $$;
SELECT public.switch_my_role('bee');
DO $$ BEGIN
  IF public.get_my_active_role() <> 'bee' OR
    (SELECT count(*) FROM public.user_roles WHERE user_id=auth.uid() AND role IN ('bee','tasker')) <> 2 THEN
    RAISE EXCEPTION 'switch_did_not_preserve_roles';
  END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', json_build_object('role','authenticated','sub',current_setting('test.minor'))::text,true);
SET LOCAL ROLE authenticated;
SELECT public.set_my_birth_date((CURRENT_DATE - INTERVAL '16 years')::date);
DO $$ BEGIN
  BEGIN
    INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'tasker');
    RAISE EXCEPTION 'minor_added_publisher_directly';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'publisher_age_restricted' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.switch_my_role('tasker');
    RAISE EXCEPTION 'minor_became_publisher';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'publisher_age_restricted' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;
