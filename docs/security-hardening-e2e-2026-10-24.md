# Security hardening and E2E follow-up - 2026-10-24

Project: BZB (`nrqgoaxraywprlbyzrso`), frontend Vercel project `bzb-2`, team `bzb1`.

## Changes deployed to Supabase

- Audited every previously client-executable security-definer function listed below.
  Removed trigger/client grants, kept billing/internal workers service-only, moved
  RLS-only helpers to `private`, and restricted user RPCs to signed-in callers.
- Closed direct null-UID conversation creation. Also blocked client-created
  conversations without an accepted application, which could manufacture a
  relationship and expose another person's private profile through RLS.
- Task view counting now respects task visibility and increments atomically.
- Revoked email-alias lookup from both client roles. Registration displays a
  generic recoverable message without asking whether an account exists.
- Replaced every bare request-constant auth.uid() in the reviewed public policies
  with a SELECT initplan. Merged owner/admin permissive SELECT policies using the
  same OR union. Split public and authenticated review/task reads explicitly.
- Verified nine backend-only tables intentionally have no client policies;
  revoked all anon/authenticated table grants rather than opening their RLS.
- CORS only accepts known production/local origins plus `bzb-2-*-bzb1.vercel.app`
  project/team previews. HTTPS and full origin matching required for previews.
- Geocode authenticates the actual user and consumes atomic server quotas before
  contacting Google: 20/minute and 200/day/user, 2000/day/project. Returns 429
  and Retry-After. DB/quota/provider failures fail closed.
- Unknown payment webhooks now increment one hourly audit bucket, with at most
  five sampled IDs and rolling seven-day retention. Unknown IDs never create
  individual payment_events rows. DB lookup failures return 5xx for retry.
- Updated Router to 7.18.4, Vite to 7.3.7, Vitest to 4.1.12 and SWC plugin to
  4.3.3. Removed unused Zod/resolvers; pinned patched postcss-selector-parser
  7.1.6 override. Clean `npm ci` succeeded; npm audit has zero findings including
  dev dependencies. Removed obsolete Router v6 future flags.
- Corrected concurrently authored migration `20261024100000` with user approval:
  it no longer grants every security-definer function to authenticated users.

## RPC review matrix

Access below reflects the final live catalog. Private helpers are not exposed
through PostgREST. Intentionally callable security-definer functions continue
appearing in advisors; removing those grants would break legitimate features.

| Previously callable signature | Final execution access | Authorization / disposition |
| --- | --- | --- |
| `admin_archive_task(uuid)` | authenticated | Authenticated entry point; body requires private.has_role(auth.uid(), admin) before any privileged operation. |
| `admin_get_task_fees()` | authenticated | Authenticated entry point; body requires private.has_role(auth.uid(), admin) before any privileged operation. |
| `admin_set_review_status(uuid,review_status)` | authenticated | Authenticated entry point; body requires private.has_role(auth.uid(), admin) before any privileged operation. |
| `admin_set_task_fee(text,numeric)` | authenticated | Authenticated entry point; body requires private.has_role(auth.uid(), admin) before any privileged operation. |
| `admin_trial_blocks(integer)` | authenticated | Authenticated entry point; body requires private.has_role(auth.uid(), admin) before any privileged operation. |
| `archive_task(uuid,uuid)` | authenticated | Requires caller ID = requested actor and task creator. |
| `cancel_task(uuid)` | authenticated | Locks caller-owned task; rejects completed tasks. |
| `complete_task(uuid)` | authenticated | Locks caller-owned task; requires accepted worker; idempotent. |
| `dispatch_notification()` | backend only | Trigger-only; EXECUTE removed from client roles. Trusted trigger invocation preserved. |
| `enforce_parent_contact_limit()` | backend only | Trigger-only; EXECUTE removed from client roles. Trusted trigger invocation preserved. |
| `enforce_parent_request_limit()` | backend only | Trigger-only; EXECUTE removed from client roles. Trusted trigger invocation preserved. |
| `enforce_task_worker_capacity()` | backend only | Trigger-only; EXECUTE removed from client roles. Trusted trigger invocation preserved. |
| `ensure_accepted_task_conversation(uuid,uuid)` | authenticated | Requires caller participant plus accepted application. Null UID direct calls rejected; trusted acceptance triggers retain access. |
| `get_public_profile(uuid)` | anon + authenticated | Public name/avatar/gender/join date only; no email, phone, address or billing. |
| `get_task_fees()` | anon + authenticated | Published fee configuration only. |
| `get_worker_completed_task_count(uuid)` | anon + authenticated | Public completed-task aggregate only. |
| `has_active_subscription(uuid)` | backend only | Internal helper or account enumeration; client EXECUTE revoked. Server/service access retained. |
| `private.has_role(uuid,app_role)` | authenticated | RLS helper in non-exposed private schema; no PostgREST RPC endpoint. |
| `is_chat_media_participant(text)` | authenticated | RLS helper in non-exposed private schema; no PostgREST RPC endpoint. |
| `is_email_alias_taken(text)` | backend only | Internal helper or account enumeration; client EXECUTE revoked. Server/service access retained. |
| `is_user_blocked(uuid)` | backend only | Internal helper or account enumeration; client EXECUTE revoked. Server/service access retained. |
| `log_plan_price_change()` | backend only | Trigger-only; EXECUTE removed from client roles. Trusted trigger invocation preserved. |
| `mark_conversation_messages_read(uuid)` | authenticated | Requires conversation membership; only marks incoming messages. |
| `my_publish_quote(boolean)` | authenticated | Derives actor from auth.uid; exposes only own quote/card suffix. |
| `on_application_accepted_create_conversation()` | backend only | Trigger-only; EXECUTE removed from client roles. Trusted trigger invocation preserved. |
| `on_application_created()` | backend only | Trigger-only; EXECUTE removed from client roles. Trusted trigger invocation preserved. |
| `on_application_decided()` | backend only | Trigger-only; EXECUTE removed from client roles. Trusted trigger invocation preserved. |
| `on_message_created()` | backend only | Trigger-only; EXECUTE removed from client roles. Trusted trigger invocation preserved. |
| `on_task_completed()` | backend only | Trigger-only; EXECUTE removed from client roles. Trusted trigger invocation preserved. |
| `prevent_client_system_column_changes()` | backend only | Trigger-only; EXECUTE removed from client roles. Trusted trigger invocation preserved. |
| `prevent_role_escalation()` | backend only | Trigger-only; EXECUTE removed from client roles. Trusted trigger invocation preserved. |
| `protect_task_billing_columns()` | backend only | Trigger-only; EXECUTE removed from client roles. Trusted trigger invocation preserved. |
| `record_task_view(uuid)` | authenticated | Requires visible task; unique view per user; atomic increment. |
| `resubmit_draft_task(uuid)` | authenticated | Loads only caller-owned draft/rejected task and recalculates server quote. |
| `switch_my_role(app_role)` | authenticated | Changes caller only; rejects admin target; preserves existing admin membership. |
| `sync_task_accepted_count()` | backend only | Trigger-only; EXECUTE removed from client roles. Trusted trigger invocation preserved. |
| `task_billing_enabled()` | backend only | Internal helper or account enumeration; client EXECUTE revoked. Server/service access retained. |
| `task_billing_on_insert()` | backend only | Trigger-only; EXECUTE removed from client roles. Trusted trigger invocation preserved. |
| `task_is_live(uuid)` | authenticated | RLS helper in non-exposed private schema; no PostgREST RPC endpoint. |
| `unhide_tasks_on_resubscribe()` | backend only | Trigger-only; EXECUTE removed from client roles. Trusted trigger invocation preserved. |

## Verification

- Dry-ran migrations plus security fixtures inside a transaction and rolled back
  before deployment. All four migrations then applied successfully.
- Live SQL suites: security_hardening, internal_rpc_permissions, task_billing,
  task_payment_choice, trial_fingerprints. Fixtures and changes roll back.
- SQL security fixtures cover guest public reads, own/foreign task updates,
  own/foreign accepted conversations, forged relationship inserts, admin denial,
  admin reads, private profile access, alias lookup denial, trigger execution,
  owner RPC denial, role escalation denial, geocode quota and bounded webhook audit.
- Security advisors: no ERROR findings; three deliberately public definer RPCs,
  17 signed-in definer RPCs, eleven intentionally backend-only no-policy tables
  (the original nine plus two new counters/audit tables), leaked-password warning.
- Performance advisors: all 55 auth_rls_initplan and nine multiple-policy warnings
  resolved; no WARN findings remain.
- Frontend unit tests: 129 passed, eight existing skipped. Edge tests: 43 passed.
- Browser tests: 20 auth/navigation/responsive/registration cases passed across
  desktop and mobile. Two additional real-login/profile cases passed (22 total). Registration provider failures are intercepted to avoid
  sending email; no alias RPC is made. Screenshots visually reviewed.
- Live HTTP: correct CORS for production and project previews; foreign Vercel
  origin denied; alias RPC denied for anon/authenticated; no-token geocode denied;
  seeded test-account quota returns 429 with Retry-After; 12 concurrent unknown
  webhooks preserve audit counts without per-ID payment_events growth.
- Typecheck and production build pass. Bundle size warning remains.
- Full lint reports six pre-existing errors in unchanged files:
  scripts/billing-real-terminal.ts, src/pages/TaskDetail.tsx and
  supabase/e2e/billing.e2e.test.ts; plus two existing warnings. Changed-file lint
  is checked separately.

## External configuration

The Supabase Management API rejected enabling password_hibp_enabled with HTTP
402: HaveIBeenPwned protection requires a Pro plan. No paid upgrade authorized
or performed. Do not claim this protection is enabled.

Live Google geocoding initially failed with REQUEST_DENIED: the existing Maps
key has HTTP-referrer restrictions and cannot serve the server Geocoding API.
The handler supports a dedicated GOOGLE_MAPS_SERVER_API_KEY Edge Function
secret. With explicit user approval, created BZB Geocoding Server in Google project
bzb-hive, restricted to Geocoding API only. No HTTP-referrer restriction is used
for server calls; the credential is kept in Supabase Edge Functions Secrets as
GOOGLE_MAPS_SERVER_API_KEY, not in local env files or Git. Temporary transfer
file was removed. The final live HTTP suite passed, including real Google
coordinates, quota denial and concurrent webhook aggregation.

No payment was charged or refunded and no signup email was sent by these tests.
The existing E2E account is used for live auth/quota checks. Its temporary minute
counter override is restored; non-sensitive webhook test aggregates remain as
an audit trail. No secret values are stored in this report.

Additional final checks: the expanded RPC denial matrix passed against the
live database; existing-account login and profile edit controls load on both
desktop and mobile with zero REST errors. Changed-file ESLint passed. The
architecture invariant test now inspects the extracted geocode handler;
input-length and timeout assertions were preserved.

Rejected per-user geocode calls are checked before the shared daily budget, so
one user cannot exhaust the project budget by repeating already-limited calls.
The extra migration was applied with --include-all after a dry-run showed only
that migration; the concurrently supplied migration had a later timestamp.
