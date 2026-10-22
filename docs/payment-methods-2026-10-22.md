# One-time payment methods

- Subscription checkout, free trial and card replacement continue to use token operations and ordinary credit-card entry. The free month remains unchanged.
- Task payments offer a one-time hosted checkout (card, Apple Pay or Google Pay where supported), and a separate Bit action.
- Both one-time actions use `ChargeOnly` and persist `meta.payment_mode=one_time`. Settlement never replaces the saved recurring card, even if the provider returns a token.
- Bit uses the documented `UrlToBit` from `LowProfile/Create`. This URL is exposed only for `ChargeOnly`. Missing URL returns `409 bit_unavailable`, marks the attempt failed, and leaves the task unpaid. No silent fallback.
- Cardcom terminal approval/configuration is required for all wallets. Bit is prepared in code; activation cannot be inferred from a mock test.

## Provider limitation

The published [v11 schema](https://secure.cardcom.solutions/swagger/v11/swagger.json) has no per-request wallet visibility flags. Live verification below confirmed that the subscription page hides Bit and Google Pay for `ChargeAndCreateToken`. The terminal has a separate global setting for Bit/Google Pay on non-immediate charges; it is disabled. `CreateTokenOnly` and Apple-device visibility were not verified in this live session.

## Verification

- Frontend unit tests: 124 passed, 8 existing skipped.
- Functions tests: 39 passed. Fixed the npm command to grant loopback network access required by existing mock-server tests; its previous command failed for missing network permission.
- Frontend TypeScript, functions TypeScript, targeted frontend lint and production build passed.
- Browser tests on desktop Chrome and mobile Chrome: payment methods, unavailable Bit, card replacement, checkout consent and return flow.
- Real local Auth/database/Edge handlers with mock Cardcom: wallet and Bit settlement, unavailable Bit, saved-card preservation, card replacement.
- No real Apple Pay, Google Pay or Bit charge performed. No Apple device verification.

## Deployment

The environment-file access token returned `401 Invalid access token`. Retrying with the existing CLI login (after loading the environment and unsetting `SUPABASE_ACCESS_TOKEN` in that process) succeeded. `task-pay` is deployed as version 19, ACTIVE, with JWT verification enabled.


## Live browser verification

- Terminal 197542 already has Google Pay, Apple Pay and Bit enabled. Apple Pay logo URL is configured. No wallet activation change was needed.
- Bit success redirect is enabled. Global display of Bit/Google Pay for non-immediate charges is disabled; API operation overrides remain controlled by the integration.
- Created an internal, non-public pending-payment task solely to open checkout pages, with amount 0.10 ILS. No charge was submitted and no payment credentials were entered.
- Both the generic one-time button and the dedicated Bit button opened live hosted checkout. The hosted page initially selected credit card; choosing Bit or Google Pay displayed its respective form and payment button.
- Subscription checkout was opened after explicit consent from the user. Only ordinary credit-card entry appeared; Bit and Google Pay were absent.
- Apple Pay is enabled in terminal configuration. Its availability/payment on an Apple device remains untested. Trial/card replacement were covered by earlier local tests, not a live transaction in this session.
- Closed all three test checkout tabs. Marked both temporary task charge attempts and the subscription order failed with `verification_only_no_payment`; archived the temporary task as a draft. Existing tasks/subscriptions were preserved.
