-- Transactional fixture: never send messages, charge cards or retain test data.
BEGIN;
UPDATE public.billing_settings SET value = 'off' WHERE key = 'task_billing';
SELECT set_config('test.owner', gen_random_uuid()::text, true);
SELECT set_config('test.other', gen_random_uuid()::text, true);
SELECT set_config('test.worker', gen_random_uuid()::text, true);
SELECT set_config('test.admin', gen_random_uuid()::text, true);
INSERT INTO auth.users(id,email,instance_id,aud,role)
SELECT current_setting('test.' || name)::uuid, current_setting('test.' || name) || '@security.invalid',
  '00000000-0000-0000-0000-000000000000', 'authenticated','authenticated'
FROM unnest(ARRAY['owner','other','worker','admin']) AS name;
INSERT INTO public.user_roles(user_id,role) VALUES
  (current_setting('test.owner')::uuid,'tasker'),
  (current_setting('test.other')::uuid,'tasker'),
  (current_setting('test.worker')::uuid,'bee'),
  (current_setting('test.admin')::uuid,'admin');
SELECT set_config('test.task',gen_random_uuid()::text,true);
INSERT INTO public.tasks(id,creator_id,category,name,short_desc,payment)
VALUES(current_setting('test.task')::uuid,current_setting('test.owner')::uuid,'housework','security fixture','test',10);
INSERT INTO public.task_applications(task_id,applicant_id,status)
VALUES(current_setting('test.task')::uuid,current_setting('test.worker')::uuid,'pending');
-- Trusted acceptance trigger still creates a conversation after EXECUTE revokes.
UPDATE public.task_applications SET status='accepted' WHERE task_id=current_setting('test.task')::uuid;
SELECT set_config('test.conversation', (SELECT id::text FROM public.conversations WHERE task_id=current_setting('test.task')::uuid LIMIT 1), true);
DO $$
DECLARE f record; t text; q jsonb; baseline bigint; samples integer;
BEGIN
  FOR f IN SELECT oid::regprocedure AS sig, proname, prorettype FROM pg_proc
    WHERE pronamespace='public'::regnamespace AND prosecdef LOOP
    IF has_function_privilege('anon',f.sig,'execute') AND
       f.proname NOT IN ('get_public_profile','get_task_fees','get_worker_completed_task_count') THEN
      RAISE EXCEPTION 'unexpected anon RPC: %', f.sig;
    END IF;
    IF f.prorettype='trigger'::regtype AND has_function_privilege('authenticated',f.sig,'execute') THEN
      RAISE EXCEPTION 'client can execute trigger: %',f.sig;
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['billing_refund_attempts','billing_settings','family_link_attempts',
    'family_link_codes','payment_events','payment_methods','task_views','trial_blocks','trial_fingerprints'] LOOP
    IF has_table_privilege('anon','public.'||t,'SELECT') OR has_table_privilege('authenticated','public.'||t,'SELECT') THEN
      RAISE EXCEPTION 'backend table exposed: %',t;
    END IF;
  END LOOP;
  FOR i IN 1..20 LOOP
    q := public.consume_geocode_quota(current_setting('test.worker')::uuid);
    IF q->>'allowed' <> 'true' THEN RAISE EXCEPTION 'allowed geocode rejected: %',q; END IF;
  END LOOP;
  q := public.consume_geocode_quota(current_setting('test.worker')::uuid);
  IF q->>'allowed' <> 'false' OR (q->>'retry_after')::int < 1 THEN
    RAISE EXCEPTION 'geocode quota not enforced';
  END IF;
  SELECT coalesce(sum(attempts),0) INTO baseline FROM public.payment_webhook_unknown_buckets;
  FOR i IN 1..50 LOOP PERFORM public.record_unknown_payment_webhook('security-fixture-'||i); END LOOP;
  IF (SELECT sum(attempts) FROM public.payment_webhook_unknown_buckets) <> baseline + 50 THEN
    RAISE EXCEPTION 'webhook counts lost';
  END IF;
  SELECT cardinality(sample_ids) INTO samples FROM public.payment_webhook_unknown_buckets WHERE bucket_start=date_trunc('hour',now());
  IF samples > 5 THEN RAISE EXCEPTION 'webhook samples unbounded'; END IF;
END;
$$;

SET LOCAL ROLE anon;
DO $$ DECLARE call_sql text; BEGIN
  PERFORM public.get_task_fees();
  PERFORM public.get_public_profile(current_setting('test.owner')::uuid);
  PERFORM public.get_worker_completed_task_count(current_setting('test.worker')::uuid);
  IF NOT EXISTS (SELECT 1 FROM public.tasks WHERE id=current_setting('test.task')::uuid) THEN
    RAISE EXCEPTION 'public live task hidden';
  END IF;
  BEGIN
    PERFORM public.is_email_alias_taken('nobody@security.invalid');
    RAISE EXCEPTION 'email enumeration RPC exposed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims',json_build_object('role','authenticated','sub',current_setting('test.other'))::text,true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE call_sql text; BEGIN
  UPDATE public.tasks SET short_desc='unauthorized' WHERE id=current_setting('test.task')::uuid;
  IF FOUND THEN RAISE EXCEPTION 'foreign task updated'; END IF;
  FOREACH call_sql IN ARRAY ARRAY[
    format('SELECT public.admin_archive_task(%L::uuid)', current_setting('test.task')),
    'SELECT public.admin_get_task_fees()',
    'SELECT public.admin_set_task_fee(''task_fee'',123)',
    'SELECT public.admin_trial_blocks(1)'
  ] LOOP
    BEGIN
      EXECUTE call_sql;
      RAISE EXCEPTION 'non-admin RPC allowed';
    EXCEPTION
      WHEN insufficient_privilege THEN NULL;
      WHEN raise_exception THEN IF SQLERRM NOT IN ('not authorized','forbidden') THEN RAISE; END IF;
    END;
  END LOOP;
  BEGIN
    PERFORM public.ensure_accepted_task_conversation(current_setting('test.task')::uuid,current_setting('test.worker')::uuid);
    RAISE EXCEPTION 'foreign conversation permitted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'not_allowed' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.admin_set_review_status(gen_random_uuid(),'approved');
    RAISE EXCEPTION 'non-admin accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'not authorized' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id=current_setting('test.owner')::uuid) THEN
    RAISE EXCEPTION 'unrelated private profile exposed';
  END IF;
  PERFORM public.get_public_profile(current_setting('test.owner')::uuid);
  BEGIN
    INSERT INTO public.conversations(task_id,participant_1,participant_2)
    VALUES(current_setting('test.task')::uuid,current_setting('test.other')::uuid,current_setting('test.owner')::uuid);
    RAISE EXCEPTION 'manufactured relationship permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.archive_task(current_setting('test.task')::uuid,current_setting('test.owner')::uuid);
    RAISE EXCEPTION 'foreign archive permitted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'not authorized' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.cancel_task(current_setting('test.task')::uuid);
    RAISE EXCEPTION 'foreign cancel permitted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'task not found' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.complete_task(current_setting('test.task')::uuid);
    RAISE EXCEPTION 'foreign completion permitted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'task not found' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.mark_conversation_messages_read(current_setting('test.conversation')::uuid);
    RAISE EXCEPTION 'foreign read receipts permitted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'not_a_participant' THEN RAISE; END IF; END;
  IF public.resubmit_draft_task(current_setting('test.task')::uuid)->>'error' <> 'task_not_found' THEN
    RAISE EXCEPTION 'foreign draft resubmitted';
  END IF;
  BEGIN
    PERFORM public.switch_my_role('admin');
    RAISE EXCEPTION 'admin self-assignment permitted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'role_switch_not_allowed' THEN RAISE; END IF; END;
  PERFORM public.my_publish_quote(false);
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims',json_build_object('role','authenticated','sub',current_setting('test.owner'))::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  UPDATE public.tasks SET short_desc='authorized' WHERE id=current_setting('test.task')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'owner update denied'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id=current_setting('test.owner')::uuid) THEN
    RAISE EXCEPTION 'own profile hidden';
  END IF;
  IF public.ensure_accepted_task_conversation(current_setting('test.task')::uuid,current_setting('test.worker')::uuid) IS NULL THEN
    RAISE EXCEPTION 'accepted participants cannot access conversation';
  END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims',json_build_object('role','authenticated','sub',current_setting('test.admin'))::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM public.admin_get_task_fees();
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id=current_setting('test.owner')::uuid) THEN
    RAISE EXCEPTION 'admin profile access denied';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;
