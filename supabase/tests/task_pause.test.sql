-- Runs only against an isolated local database; all fixtures are rolled back.
BEGIN;
UPDATE public.billing_settings SET value = 'off' WHERE key = 'task_billing';
SELECT set_config('test.pause_owner', gen_random_uuid()::text, true);
SELECT set_config('test.pause_worker', gen_random_uuid()::text, true);
SELECT set_config('test.pause_other', gen_random_uuid()::text, true);
SELECT set_config('test.pause_task', gen_random_uuid()::text, true);
INSERT INTO auth.users(id,email,instance_id,aud,role)
SELECT current_setting('test.pause_' || name)::uuid, name || '@pause.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
FROM unnest(ARRAY['owner','worker','other']) AS name;
INSERT INTO public.user_roles(user_id,role) VALUES
  (current_setting('test.pause_owner')::uuid,'tasker'),
  (current_setting('test.pause_worker')::uuid,'bee'),
  (current_setting('test.pause_other')::uuid,'bee');
INSERT INTO public.tasks(id,creator_id,category,name,short_desc,payment)
VALUES(current_setting('test.pause_task')::uuid,current_setting('test.pause_owner')::uuid,'housework','pause fixture','test',50);
UPDATE public.tasks SET screening='clean' WHERE id=current_setting('test.pause_task')::uuid;
INSERT INTO public.task_applications(task_id,applicant_id,status)
VALUES(current_setting('test.pause_task')::uuid,current_setting('test.pause_worker')::uuid,'pending');

SELECT set_config('request.jwt.claims',json_build_object('role','authenticated','sub',current_setting('test.pause_owner'))::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    UPDATE public.tasks SET paused_at = now() WHERE id=current_setting('test.pause_task')::uuid;
    RAISE EXCEPTION 'direct pause update permitted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'pause_command_required' THEN RAISE; END IF;
  END;
END $$;
SELECT public.set_task_paused(current_setting('test.pause_task')::uuid, true);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tasks WHERE id=current_setting('test.pause_task')::uuid AND paused_at IS NOT NULL AND status='open' AND publish_state='live') THEN RAISE EXCEPTION 'pause changed task state or billing'; END IF;
  IF NOT (current_setting('test.pause_task')::uuid = ANY(public.visible_paused_task_ids(ARRAY[current_setting('test.pause_task')::uuid]))) THEN RAISE EXCEPTION 'owner missing paused id'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.tasks WHERE id=current_setting('test.pause_task')::uuid) THEN RAISE EXCEPTION 'paused task is public'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',json_build_object('role','authenticated','sub',current_setting('test.pause_worker'))::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tasks WHERE id=current_setting('test.pause_task')::uuid) THEN RAISE EXCEPTION 'existing applicant lost task'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',json_build_object('role','authenticated','sub',current_setting('test.pause_other'))::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.tasks WHERE id=current_setting('test.pause_task')::uuid) THEN RAISE EXCEPTION 'paused task is visible to strangers'; END IF;
  IF cardinality(public.visible_paused_task_ids(ARRAY[current_setting('test.pause_task')::uuid])) <> 0 THEN RAISE EXCEPTION 'paused id leaked'; END IF;
  BEGIN
    INSERT INTO public.task_applications(task_id,applicant_id) VALUES(current_setting('test.pause_task')::uuid,current_setting('test.pause_other')::uuid);
    RAISE EXCEPTION 'new application accepted while paused';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    IF SQLERRM = 'new application accepted while paused' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.set_task_paused(current_setting('test.pause_task')::uuid, false);
    RAISE EXCEPTION 'other user resumed task';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'other user resumed task' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',json_build_object('role','authenticated','sub',current_setting('test.pause_owner'))::text,true);
SET LOCAL ROLE authenticated;
SELECT public.set_task_paused(current_setting('test.pause_task')::uuid, false);
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tasks WHERE id=current_setting('test.pause_task')::uuid) THEN RAISE EXCEPTION 'resumed task is not visible'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
