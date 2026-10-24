-- Defence in depth: remove anonymous access without widening signed-in access.
-- Never grant every definer function to authenticated: billing internals must
-- remain service-only. Three intentionally public read-only RPCs are exempt.
DO $$
DECLARE
  fn record;
  public_ok text[] := ARRAY[
    'get_public_profile',
    'get_task_fees',
    'get_worker_completed_task_count'
  ];
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prorettype <> 'trigger'::regtype
      AND NOT (p.proname = ANY (public_ok))
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn.sig);
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.is_email_alias_taken(text) FROM PUBLIC, anon, authenticated;
