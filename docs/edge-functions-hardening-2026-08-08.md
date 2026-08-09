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
- Webhook email retains raw-body parsing because signature verification requires exact bytes.
- Added shared parser tests for valid objects, malformed JSON, arrays/primitives, oversized payloads, bodyless requests, and every `requireSecret()` rejection path.
- Replaced `as any` in `parent-view` with explicit narrow response shapes.

### Follow-up review fixes (same day)

- `notify-parent-signin` no longer parses a body. `supabase.functions.invoke("notify-parent-signin")` sends no body at all, so the added `readJsonObject()` call turned every real sign-in into a `400`, and because `invoke` resolves with `{ error }` rather than throwing, the caller's `.catch()` never saw it — parent sign-in emails stopped silently. The function reads no request field, so parsing bought nothing.
- `notify-dispatch` and `send-quiet-digest` now catch parser errors. Neither is wrapped by `withCors`/`errorResponse`, so a throw escaped the handler and produced an unstructured `500` instead of the `400`/`413` promised below.
- `geocode-address` parses outside its catch-all, which was reporting `payload_too_large` as `Geocoding failed` with a `500`.
- `requireSecret()` takes the header name as a parameter instead of hard-coding `x-notify-secret`, and compares with a constant-time check so response time does not leak a partially-correct guess.
- `push-subscribe` and `parent-prefs` name the shapes they read out of the parsed object; `readJsonObject` returns unknown-valued properties, which does not type-check under `deno check`.
- `parent-view` reports an over-long token as `invalid_token`, not `missing_token`.
- `send-auth-email` echoes the caller's origin in every response, not only the preflight.
- Preserved service-role usage only inside server-side functions after authentication or independent cron-secret verification.
- Preserved allow-listed preference updates in `parent-prefs`.
- Preserved hashed family-link codes and canonical RPC redemption.

## Contract

- Browser functions: `POST` only, with `OPTIONS` preflight.
- Authenticated functions: `Authorization: Bearer <Supabase access token>`; identity verified by Supabase Auth.
- Cron functions: `x-notify-secret` must equal `NOTIFY_DISPATCH_SECRET`.
- Functions that read no request field (`notify-parent-signin`) accept a bodyless `POST`. Only functions that read a field parse one.
- Public parent-view functions: opaque share token is the credential; invalid token returns `404`.
- Client input errors: stable JSON `{ "error": "..." }` with `400`, `401`, `403`, `404`, `409`, `413`, or `429` as appropriate.
- Server/provider failures: generic `500`; diagnostic details stay in server logs.

## Residual risk

- Only `_shared/auth.ts` has tests. The individual handlers still need dedicated tests and a live Supabase integration run — the `notify-parent-signin` regression above shipped precisely because nothing exercised the handler against the real caller.
- `npm test` (vitest) is scoped to `src/**` and cannot run `Deno.test`; the function tests run under `npm run test:functions`. There is no CI, so both must be run by hand before deploying.
- `send-auth-email` intentionally reads raw text because webhook signature verification covers the exact body; its signature check must remain before parsing.
- Cron idempotency is partly enforced by database constraints and existing query logic; each cron workflow should receive a dedicated idempotency migration before high-volume operation.
- Root lint currently contains unrelated pre-existing errors in `src/components/CookieConsent.tsx` and `supabase/functions/parent-view/index.ts` was fixed here; full root lint must be rerun after resolving remaining frontend errors.

## Verification

Run from repository root:

```bash
npm run lint
npm test                    # frontend (vitest, src/** only)
npm run test:functions      # edge functions (deno test)
npm run typecheck:functions # edge functions (deno check)
npm run build
```

For Supabase checks, load `.env.supabase.local` first, then run the project-specific CLI checks. Do not commit secrets or service-role keys.
