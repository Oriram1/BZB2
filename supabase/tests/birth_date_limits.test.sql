BEGIN;
SELECT set_config('test.age120',gen_random_uuid()::text,true);
INSERT INTO auth.users(id,email,instance_id,aud,role)
VALUES(current_setting('test.age120')::uuid,'age-limit@testing.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated');
SELECT set_config('request.jwt.claims',json_build_object('role','authenticated','sub',current_setting('test.age120'))::text,true);
SET LOCAL ROLE authenticated;
SELECT public.set_my_birth_date(((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jerusalem')::date - INTERVAL '120 years 1 day')::date);
ROLLBACK;
