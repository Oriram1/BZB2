-- Internal workers read Vault secrets and dispatch privileged HTTP requests.
-- Only the scheduler owner and service role may invoke them.
REVOKE EXECUTE ON FUNCTION public.run_billing_renew() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_parent_digest() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_quiet_digest() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_billing_renew() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_parent_digest() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_quiet_digest() TO service_role;

-- This low-level helper accepts arbitrary archive data and actor IDs.
-- Client-facing archive_task performs its own ownership checks instead.
REVOKE EXECUTE ON FUNCTION public.archive_record(text, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_record(text, text, jsonb, uuid) TO service_role;

-- Approved ratings remain visible through the existing reviews SELECT policy.
ALTER VIEW public.user_avg_ratings SET (security_invoker = true);

-- Both helpers use built-in functions only.
ALTER FUNCTION public.normalize_trial_phone(text) SET search_path = pg_catalog;
ALTER FUNCTION public.trial_fingerprint(text, text) SET search_path = pg_catalog;
