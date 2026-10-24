-- Read-only assertions, safe to run against the linked database.
BEGIN;
DO $$
DECLARE
  signature text;
  client_role text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.archive_record(text,text,jsonb,uuid)',
    'public.run_billing_renew()',
    'public.run_parent_digest()',
    'public.run_quiet_digest()',
    'public.enqueue_notification(uuid,public.notification_event,jsonb,text)',
    'public.purge_expired_archives()'
  ] LOOP
    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_function_privilege(client_role, signature, 'EXECUTE') THEN
        RAISE EXCEPTION '% can execute internal function %', client_role, signature;
      END IF;
    END LOOP;
    IF NOT has_function_privilege('service_role', signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role lost access to %', signature;
    END IF;
    IF NOT has_function_privilege('postgres', signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'scheduler owner lost access to %', signature;
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid = 'public.user_avg_ratings'::regclass
      AND reloptions @> ARRAY['security_invoker=true']
  ) THEN
    RAISE EXCEPTION 'ratings view must respect caller RLS';
  END IF;
END;
$$;
SET LOCAL ROLE anon;
SELECT count(*) FROM public.user_avg_ratings;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT count(*) FROM public.user_avg_ratings;
RESET ROLE;
ROLLBACK;
