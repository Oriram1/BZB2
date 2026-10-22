# One-time payment methods

- Subscription checkout, free trial and card replacement continue to use token operations and ordinary credit-card entry. The free month remains unchanged.
- Task payments offer a one-time hosted checkout (card, Apple Pay or Google Pay where supported), and a separate Bit action.
- Both one-time actions use `ChargeOnly` and persist `meta.payment_mode=one_time`. Settlement never replaces the saved recurring card, even if the provider returns a token.
- Bit uses the documented `UrlToBit` from `LowProfile/Create`. This URL is exposed only for `ChargeOnly`. Missing URL returns `409 bit_unavailable`, marks the attempt failed, and leaves the task unpaid. No silent fallback.
- Cardcom terminal approval/configuration is required for all wallets. Bit is prepared in code; activation cannot be inferred from a mock test.

## Provider limitation

The published [v11 schema](https://secure.cardcom.solutions/swagger/v11/swagger.json) has no per-request wallet visibility flags. This change does not claim to hide buttons inside Cardcom's hosted page. Confirm that Cardcom hides unsupported methods for `CreateTokenOnly` / `ChargeAndCreateToken`, or obtain a supported terminal/page configuration from Cardcom before calling that restriction verified. Never invent undocumented flags.

## Verification

- Frontend unit tests: 124 passed, 8 existing skipped.
- Functions tests: 39 passed. Fixed the npm command to grant loopback network access required by existing mock-server tests; its previous command failed for missing network permission.
- Frontend TypeScript, functions TypeScript, targeted frontend lint and production build passed.
- Browser tests on desktop Chrome and mobile Chrome: payment methods, unavailable Bit, card replacement, checkout consent and return flow.
- Real local Auth/database/Edge handlers with mock Cardcom: wallet and Bit settlement, unavailable Bit, saved-card preservation, card replacement.
- No real Apple Pay, Google Pay or Bit charge performed. No Apple device verification.

## Deployment

Deployment of `task-pay` was attempted but rejected with `401 Invalid access token`. The connected Supabase account does not list this project either. Backend deployment and provider terminal configuration remain outstanding.
