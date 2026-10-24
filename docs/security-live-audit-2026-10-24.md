# Live Supabase security follow-up - 2026-10-24

Project: BZB (`nrqgoaxraywprlbyzrso`). Checked against the live database using
the authenticated CLI. The environment file contains an invalid access token;
after sourcing it, unset `SUPABASE_ACCESS_TOKEN` to use the new CLI login.
No credential values were copied into this report.

## Applied changes

- Denied `PUBLIC`, `anon`, and `authenticated` execution of six internal RPCs:
  `archive_record`, `enqueue_notification`, `purge_expired_archives`,
  `run_billing_renew`, `run_parent_digest`, and `run_quiet_digest`.
  These functions accept arbitrary archive/notification data, delete expired
  archives, or dispatch privileged workers. Service role and scheduler owner
  retain execution. No application call sites use these internal RPCs.
- Made `user_avg_ratings` respect caller permissions and reviews RLS.
- Restricted the reviews admin SELECT policy to authenticated users. The first
  live view test failed because that policy called `private.has_role` for anon,
  which cannot execute it. After correcting the policy, both roles can read
  approved rating aggregates.
- Fixed the search path of `normalize_trial_phone` and `trial_fingerprint` to
  `pg_catalog`; both functions only use built-ins.

## Verification

- CLI dry run confirmed only the first new migration was pending. All three
  new migrations then applied successfully through `supabase db push`.
- Live SQL assertions in `supabase/tests/internal_rpc_permissions.test.sql`
  passed: both client roles denied all six internal RPCs; service role and
  postgres retain access; ratings view uses `security_invoker`; SELECT works
  as anon and authenticated. Test transaction rolled back.
- All public tables have RLS enabled.
- Security advisors after fixes: no ERROR findings; no mutable search-path
  findings; no security-definer-view findings.
- `git diff --check` passed. No frontend, browser, or worker execution tests
  were run; the changes are database permissions and view configuration.

## Remaining findings and limits

Security advisors still report 29 anon-executable and 39 authenticated-executable
security-definer functions. These warnings need individual authorization review;
some functions are intentionally public, some are trigger functions. They are
not proof of exploitation, and zero ERROR findings is not a security guarantee.

Nine tables have RLS with no policies, which denies ordinary clients by default.
Do not add permissive policies merely to remove these INFO notices.

Leaked-password protection remains disabled. Performance advisors report
55 `auth_rls_initplan` and nine `multiple_permissive_policies` warnings.

The preceding audit's remaining items were not changed in this database pass:
credential rotation, email-alias enumeration, broad Vercel CORS, geocoding rate
limits, unknown-payment webhook logging, and dependency advisories. Credential
rotation status was not inferred from successful CLI authentication.

Advisor references:
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
