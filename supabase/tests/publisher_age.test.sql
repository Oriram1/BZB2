BEGIN;
SELECT set_config('test.new_user',gen_random_uuid()::text,true);
INSERT INTO auth.users(id,email,instance_id,aud,role)
VALUES(current_setting('test.new_user')::uuid,'new-publisher@testing.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated');
SELECT set_config('request.jwt.claims',json_build_object('role','authenticated','sub',current_setting('test.new_user'))::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    INSERT INTO public.user_roles(user_id,role) VALUES(auth.uid(),'tasker');
    RAISE EXCEPTION 'publisher_without_birth_date_allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'publisher_age_restricted' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;
