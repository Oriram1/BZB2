# Edge Functions hardening — 2026-08-08

## Scope

Applied shared boundary hardening to existing Supabase Edge Functions. No new Node API is required.

Functions audited:

`add-parent-contact`, `admin-manage-users`, `admin-reset-password`, `create-family-link-code`, `geocode-address`, `notify-dispatch`, `notify-parent-signin`, `parent-prefs`, `parent-view`, `push-subscribe`, `redeem-family-link-code`, `request-parent-contact`, `send-auth-email`, `send-parent-digest`, `send-quiet-digest`.

## Changes

- Added `readJsonObject()` in `supabase/functions/_shared/auth.ts`.
  - Rejects malformed JSON and JSON arrays/primitives.
  - Rejects payloads above a bounded size.
  - Prevents the previous `req.json().catch(() => ({}))` pattern from silently turning attacker input into an empty command.
- Added `requireSecret()` for cron/internal functions.
- Added stable `400` and `413` responses for malformed and oversized requests.
- Applied strict JSON parsing to authenticated mutations, public token endpoints, push subscription, admin actions, and digest dispatches.
- Applied strict JSON parsing to sign-in notification calls; webhook email retains raw-body parsing because signature verification requires exact bytes.
- Added shared parser tests for valid objects, malformed JSON, arrays/primitives, and oversized payloads.
- Replaced `as any` in `parent-view` with explicit narrow response shapes.
- Preserved service-role usage only inside server-side functions after authentication or independent cron-secret verification.
- Preserved allow-listed preference updates in `parent-prefs`.
- Preserved hashed family-link codes and canonical RPC redemption.

## Contract

- Browser functions: `POST` only, with `OPTIONS` preflight.
- Authenticated functions: `Authorization: Bearer <Supabase access token>`; identity verified by Supabase Auth.
- Cron functions: `x-notify-secret` must equal `NOTIFY_DISPATCH_SECRET`.
- Public parent-view functions: opaque share token is the credential; invalid token returns `404`.
- Client input errors: stable JSON `{ "error": "..." }` with `400`, `401`, `403`, `404`, `409`, `413`, or `429` as appropriate.
- Server/provider failures: generic `500`; diagnostic details stay in server logs.

## Residual risk

- Existing functions still need dedicated Deno/Vitest tests and a live Supabase integration run.
- `send-auth-email` intentionally reads raw text because webhook signature verification covers the exact body; its signature check must remain before parsing.
- Cron idempotency is partly enforced by database constraints and existing query logic; each cron workflow should receive a dedicated idempotency migration before high-volume operation.
- Root lint currently contains unrelated pre-existing errors in `src/components/CookieConsent.tsx` and `supabase/functions/parent-view/index.ts` was fixed here; full root lint must be rerun after resolving remaining frontend errors.

## Verification

Run from repository root:

```bash
npm run lint
npm test
npm run build
```

For Supabase checks, load `.env.supabase.local` first, then run the project-specific CLI checks. Do not commit secrets or service-role keys.
