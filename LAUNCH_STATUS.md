# mytimes Launch Status

Last updated: May 14, 2026, 20:07 SAST.

## Overall

Core production path is wired and passing:

- `https://mytimes.co` serves the current frontend.
- `https://www.mytimes.co` serves the same frontend.
- The frontend calls production API routes through same-origin `/api` on `mytimes.co`.
- Stripe billing readiness is green for the hidden board unlock, Company monthly, and Company annual.
- Resend readiness is green with the production sender.
- Organizer signup requires email verification; password reset is wired.
- Public email preview files are no longer shipped.
- The demo board is explicitly read-only.

## Automated Checks

| Check | Status | Notes |
| --- | --- | --- |
| `npm run test:e2e` | Pass | Typecheck, build, email shape, billing/entitlements, frontend readiness. |
| `npm run smoke:live` / `npm run security:ready` | Pass | Live app, routes, security headers, hidden previews, `www`, billing readiness, email readiness, and CORS. |
| `SLOTBOARD_REQUIRE_API_CUSTOM_DOMAIN=true npm run security:ready` | Fails as expected | `api.mytimes.co` does not have public DNS/cert wiring yet. |

## Wiring Status

| Surface | Status | Notes |
| --- | --- | --- |
| Landing page | Done | Live and checked. Demo CTA points to read-only demo board. |
| Pricing page | Done | Public page is Free + Company only. Old Event Pass public column is absent. |
| Create board flow | Done | Free limits and board-unlock states are wired through API tests. |
| Public booking page | Done | Real token routes call the API. `/b/preview` is demo-only and cannot create bookings. |
| Admin/manage links | Done | Existing token routes remain wired. |
| My Boards recovery | Done | `/my-boards` and `/my-boards/request` are routed and call real API endpoints. |
| Email sending | Done | Resend production readiness passes; templates have shape tests, including password reset and account verification. |
| Account verification | Done | Signup sends a logged verification email, unverified signin resends, and `/verify-email` returns users to the app. |
| Billing | Done | Stripe readiness passes; webhook/entitlement transitions have regression tests. |
| Public email previews | Done | Generated previews now write to `.generated/email-previews`, not Vite public output. |
| Apex domain | Done | `mytimes.co` serves production frontend. |
| `www` domain | Done | `www.mytimes.co` resolves and serves production frontend. |
| API same-origin path | Done | Production API endpoints are reachable from the frontend origin. |
| API Railway domain | Internal | The slots proxy uses the Railway API domain as its upstream. It is no longer hardcoded into the browser bundle. |
| Branded API domain | Optional pending | `api.mytimes.co` is configured in Railway metadata but not live in public DNS/cert validation. |

## What Is Left

1. **Decide whether branded API host is worth completing.**
   Current live frontend passes readiness with the same-origin API target. `api.mytimes.co` is optional unless we want a separate branded API origin.

2. **Finish `api.mytimes.co` only if we want a branded API host.**
   Add/fix the DNS record for `api.mytimes.co`, wait for Railway certificate validation, then run:

   ```sh
   SLOTBOARD_API_URL=https://api.mytimes.co \
   SLOTBOARD_REQUIRE_API_CUSTOM_DOMAIN=true \
   npm run security:ready
   ```

3. **Keep frontend API env clean.**
   `VITE_SLOTBOARD_API_URL` should remain unset on the `slots` service while same-origin mode is the launch target. If the chosen target later becomes branded API, redeploy the frontend with `VITE_SLOTBOARD_API_URL=https://api.mytimes.co`.

4. **Non-blocking performance cleanup.**
   The frontend build passes but Vite reports a large JS chunk. Code splitting is worth doing after launch, not before the current production cut.

## Current Verdict

Production-ready for the core one-off booking product on `mytimes.co`.

Not fully clean on separate branded API infrastructure until `api.mytimes.co` public DNS/cert validation is completed, or intentionally removed from the launch target.
