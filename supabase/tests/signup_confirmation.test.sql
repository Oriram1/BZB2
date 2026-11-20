BEGIN;
SELECT set_config('test.confirm_user',gen_random_uuid()::text,true);
INSERT INTO auth.users(id,email,instance_id,aud,role,raw_user_meta_data)
VALUES(current_setting('test.confirm_user')::uuid,'confirmation-fixture@example.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated',jsonb_build_object('first_name','דנה','last_name','בדיקה','app_role','bee','birth_date',(CURRENT_DATE - INTERVAL '25 years')::date::text,'signup_details',jsonb_build_object('address','כתובת בדיקה','phone','0501234567','gender','unspecified','marketing_consent',false,'also_publisher',true)));
DO $$ BEGIN
  IF (SELECT count(*) FROM public.user_roles WHERE user_id=current_setting('test.confirm_user')::uuid AND role IN ('bee','tasker')) <> 2 THEN
    RAISE EXCEPTION 'signup_roles_not_saved';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id=current_setting('test.confirm_user')::uuid AND phone='0501234567' AND address='כתובת בדיקה' AND age >= 18) THEN
    RAISE EXCEPTION 'signup_profile_not_saved';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id=current_setting('test.confirm_user')::uuid AND (raw_user_meta_data ? 'signup_details' OR raw_user_meta_data ? 'birth_date')) THEN
    RAISE EXCEPTION 'signup_details_retained_in_metadata';
  END IF;
END $$;
ROLLBACK;
