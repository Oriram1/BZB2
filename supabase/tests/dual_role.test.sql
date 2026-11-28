-- Run only against an isolated local database. All fixture writes roll back.
BEGIN;
UPDATE public.billing_settings SET value = 'off' WHERE key = 'task_billing';
SELECT set_config('test.dual_user', gen_random_uuid()::text, true);
SELECT set_config('test.dual_task', gen_random_uuid()::text, true);
SELECT set_config('test.other_worker', gen_random_uuid()::text, true);
INSERT INTO auth.users(id,email,instance_id,aud,role)
VALUES (current_setting('test.dual_user')::uuid, 'dual-role@testing.invalid',
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.user_roles(user_id,role) VALUES (current_setting('test.dual_user')::uuid,'tasker');
INSERT INTO auth.users(id,email,instance_id,aud,role)
VALUES (current_setting('test.other_worker')::uuid, 'other-worker@testing.invalid',
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.user_roles(user_id,role) VALUES (current_setting('test.other_worker')::uuid,'bee');
INSERT INTO public.tasks(id,creator_id,category,name,short_desc,payment)
VALUES(current_setting('test.dual_task')::uuid,current_setting('test.dual_user')::uuid,'housework','fixture','fixture',10);
-- Publish the fixture after a successful safety screen.
UPDATE public.tasks SET screening = 'clean' WHERE id = current_setting('test.dual_task')::uuid;
SELECT set_config('request.jwt.claims',json_build_object('role','authenticated','sub',current_setting('test.dual_user'))::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    INSERT INTO public.task_applications(task_id,applicant_id,status)
    VALUES(current_setting('test.dual_task')::uuid,current_setting('test.dual_user')::uuid,'pending');
    RAISE EXCEPTION 'self_application_was_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',json_build_object('role','authenticated','sub',current_setting('test.other_worker'))::text,true);
SET LOCAL ROLE authenticated;
INSERT INTO public.task_applications(task_id,applicant_id,status)
VALUES(current_setting('test.dual_task')::uuid,current_setting('test.other_worker')::uuid,'pending');
ROLLBACK;
