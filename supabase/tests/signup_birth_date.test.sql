BEGIN;
SELECT set_config('test.signup',gen_random_uuid()::text,true);
INSERT INTO auth.users(id,email,instance_id,aud,role,raw_user_meta_data)
VALUES(current_setting('test.signup')::uuid,'birthday-signup@testing.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated',jsonb_build_object('birth_date', (CURRENT_DATE - INTERVAL '25 years')::date::text));
SELECT set_config('request.jwt.claims',json_build_object('role','authenticated','sub',current_setting('test.signup'))::text,true);
SET LOCAL ROLE authenticated;
INSERT INTO public.user_roles(user_id,role) VALUES(auth.uid(),'tasker');
DO $$ BEGIN
  BEGIN
    PERFORM public.set_my_birth_date((CURRENT_DATE - INTERVAL '30 years')::date);
    RAISE EXCEPTION 'signup_birth_date_was_not_saved';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'birth_date_already_set' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;
