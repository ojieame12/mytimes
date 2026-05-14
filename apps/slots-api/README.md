# mytimes API

Backend boundary for the mytimes MVP.

This app is intentionally separate from the main web app and from `apps/auth-edge`. It powers the mytimes booking product while keeping the existing `/api/slotboard` routes, `SLOTBOARD_*` env vars, and `slotboard` Postgres schema stable.

## Boundary

```txt
apps/
  slots/       frontend
  slots-api/   backend

packages/
  slotboard-core/   pure domain helpers shared by API and future server/UI code
```

The API should not import from `apps/web` or `apps/slots`. Frontend code should call the API over HTTP until there is a clear reason to merge runtime boundaries.

## Commands

```sh
npm run dev --workspace @fresh-feel/slots-api
npm run migrate --workspace @fresh-feel/slots-api
npm run retention --workspace @fresh-feel/slots-api
npm run typecheck --workspace @fresh-feel/slots-api
npm run build --workspace @fresh-feel/slots-api
npm run test:api
npm run test:hardening
npm run auth:links
```

## Environment

All app-specific env vars are prefixed with `SLOTBOARD_` to avoid collisions.

See `.env.example`.

Email delivery supports three providers:

- `SLOTBOARD_EMAIL_PROVIDER=console` for local development and Docker Compose.
- `SLOTBOARD_EMAIL_PROVIDER=resend` with `SLOTBOARD_RESEND_API_KEY` or `RESEND_API_KEY`.
- `SLOTBOARD_EMAIL_PROVIDER=postmark` with `SLOTBOARD_POSTMARK_SERVER_TOKEN` or `POSTMARK_SERVER_TOKEN`.

Set `SLOTBOARD_SENDER_EMAIL` to a verified sender before using Resend or
Postmark in Railway.

Check email readiness without exposing secrets:

```sh
npm run email:ready
SLOTBOARD_API_URL=https://<api-service>.up.railway.app npm run email:ready
SLOTBOARD_REQUIRE_PRODUCTION_EMAIL=true npm run email:ready
```

The API also exposes `GET /api/slotboard/ops/email-readiness` and includes the
same email status in `GET /readyz`.

After the readiness check passes with Resend or Postmark, send a real provider
test from the deployed API:

```sh
SLOTBOARD_API_URL=https://<api-service>.up.railway.app \
SLOTBOARD_OPS_SECRET=<same-secret-set-on-api-service> \
SLOTBOARD_TEST_EMAIL=you@example.com \
npm run email:test
```

`POST /api/slotboard/ops/email-test` requires `SLOTBOARD_OPS_SECRET`, refuses
the `console` provider, and logs the delivery as `email_type=email_test`.
Board creation also sends the organizer an `event_links` email with the public
booking URL and private admin URL.

For the current Railway project, Resend can be activated with:

```sh
SLOTBOARD_RESEND_API_KEY=<resend-api-key> \
SLOTBOARD_SENDER_EMAIL="mytimes <bookings@yourdomain.com>" \
SLOTBOARD_TEST_EMAIL=you@example.com \
SLOTBOARD_OPS_SECRET=<same-secret-set-on-api-service> \
npm run email:activate:resend
```

The script sets the API service variables, triggers the provider flip, waits
for production readiness, and sends a provider-backed test email when test
credentials are supplied. The Resend key is written through Railway stdin.
Set `SLOTBOARD_EMAIL_ACTIVATION_DRY_RUN=true` to validate the command without
changing Railway variables.

Webhook security:

- Resend: set `SLOTBOARD_RESEND_WEBHOOK_SECRET` or `RESEND_WEBHOOK_SECRET` from the webhook details page.
- Postmark: set `SLOTBOARD_EMAIL_WEBHOOK_SECRET` and send it as `X-SlotBoard-Webhook-Secret` or an `Authorization: Bearer <value>` header.
- Stripe: set `SLOTBOARD_STRIPE_WEBHOOK_SECRET` or `STRIPE_WEBHOOK_SECRET`; paid checkout is blocked until both this and the Stripe secret key exist.

Provider webhook deliveries are tracked in `slotboard.email_webhook_events`.
Resend uses the signed `svix-id` as the provider event key; generic/Postmark
webhooks fall back to a hash of the verified raw payload. Duplicate retries are
acknowledged without reapplying delivery-log updates.

Billing:

- `GET /api/slotboard/billing/readiness` reports Stripe checkout/webhook readiness without exposing secrets.
- `GET /api/slotboard/billing/account` returns the signed-in organizer's Stripe customer and Company subscription summary.
- `POST /api/slotboard/billing/customer-portal` creates a signed-in organizer Stripe Customer Portal session when a billing customer exists.
- `GET /api/slotboard/account/custom-domain` returns the signed-in organizer's custom-domain eligibility and DNS records.
- `POST /api/slotboard/account/custom-domain` requests or changes a Company custom booking subdomain.
- `POST /api/slotboard/account/custom-domain/verify` checks TXT and CNAME DNS records and marks DNS verified when both match.
- `POST /api/slotboard/ops/custom-domain/activate` marks a DNS-verified custom domain active after the Railway frontend domain has been attached.
- `POST /api/slotboard/billing/event-pass/checkout` starts a hidden one-board unlock checkout from a bearer admin token.
- `POST /api/slotboard/account/events/:eventId/billing/event-pass/checkout` starts the one-board unlock checkout for a signed-in owner.
- `POST /api/slotboard/billing/company-standby/checkout` starts the signed-in organizer's Company subscription checkout; pass `billingInterval: "year"` for the $480 annual lead offer or `"month"` for $49 monthly.
- `POST /api/slotboard/webhooks/stripe` fulfills one-board unlock purchases and stores subscription status.

Use:

```txt
SLOTBOARD_STRIPE_SECRET_KEY=sk_...
SLOTBOARD_STRIPE_WEBHOOK_SECRET=whsec_...
SLOTBOARD_STRIPE_EVENT_PASS_PRICE_ID=price_...
SLOTBOARD_STRIPE_COMPANY_STANDBY_PRICE_ID=price_...
SLOTBOARD_STRIPE_COMPANY_STANDBY_ANNUAL_PRICE_ID=price_...
SLOTBOARD_BILLING_CURRENCY=usd
SLOTBOARD_EVENT_PASS_AMOUNT=1900
SLOTBOARD_COMPANY_STANDBY_AMOUNT=4900
SLOTBOARD_COMPANY_STANDBY_ANNUAL_AMOUNT=48000
SLOTBOARD_CUSTOM_DOMAIN_CNAME_TARGET=slots-production-12d4.up.railway.app
```

When Stripe price IDs are configured, Checkout uses those catalog prices. When
they are absent, Checkout falls back to inline `price_data` from the configured
amounts and currency.

Free boards get a 60-day window, publish the first 60 generated slots, and
accept up to 25 active bookings. One-board unlock fulfillment marks one board paid,
sets a 180-day paid window, raises limits to 75 bookings and 200 slots, and removes
the mytimes footer on that board. Company stores the Stripe subscription against the organizer email/user
and applies high-limit workspace entitlements to the signed-in organizer's
active boards. Custom domains are gated to active/trialing Company
subscriptions. DNS verification checks a TXT record and CNAME target. Final
Railway custom-domain attachment stays an operations step; after attachment,
run the activation command so the API accepts the custom origin through CORS:

```sh
SLOTBOARD_CUSTOM_DOMAIN=book.company.com \
SLOTBOARD_API_URL=https://<api-service>.up.railway.app \
SLOTBOARD_OPS_SECRET=<same-secret-set-on-api-service> \
npm run custom-domain:activate
```

The command runs `railway domain --service slots --port 4174 --json <domain>`
and then calls `/api/slotboard/ops/custom-domain/activate`. Add
`SLOTBOARD_CUSTOM_DOMAIN_SKIP_RAILWAY=true` when the domain has already been
attached in Railway. Active custom domains are used for public booking links,
rotated public links, and participant manage links. Private admin, billing, and
account links remain on the main mytimes app host.

Organizer account auth:

- Better Auth is mounted at `/api/auth/*`.
- Email/password auth is enabled for organizer accounts.
- Better Auth tables live in the same Postgres `slotboard` schema with
  `auth_`-prefixed table names.
- `SLOTBOARD_AUTH_SECRET` or `BETTER_AUTH_SECRET` must be a separate long
  production secret.
- `SLOTBOARD_AUTH_BASE_URL` should be the API origin, not the frontend origin.
- Frontend auth URLs are `/signup`, `/signin`, and `/account`; run
  `npm run auth:links` to print local or Railway URLs from the current env.
- Public booking links, admin links, and manage links still use opaque bearer
  tokens. Account cookies do not replace those shared-link credentials.

Retention is a separate worker command, not a background loop in the web API
process. Defaults are conservative:

- `SLOTBOARD_RETENTION_ENABLED=true`
- `SLOTBOARD_RETENTION_ARCHIVE_AFTER_DAYS=30`
- `SLOTBOARD_RETENTION_DELETE_ARCHIVED_AFTER_DAYS=365`
- `SLOTBOARD_RETENTION_PII_SCRUB_AFTER_DAYS=30`
- `SLOTBOARD_RETENTION_RATE_LIMIT_AFTER_DAYS=7`
- `SLOTBOARD_RETENTION_IDEMPOTENCY_AFTER_DAYS=7`

Operational controls:

- `SLOTBOARD_DB_POOL_MAX=10`
- `SLOTBOARD_DB_CONNECTION_TIMEOUT_MS=5000`
- `SLOTBOARD_DB_IDLE_TIMEOUT_MS=30000`
- `SLOTBOARD_DB_QUERY_TIMEOUT_MS=10000`
- `SLOTBOARD_DB_STATEMENT_TIMEOUT_MS=10000`
- `SLOTBOARD_GRACEFUL_SHUTDOWN_MS=10000`

The API writes JSON-line logs for startup, shutdown, request summaries, and
unexpected errors. Request paths are redacted for URL-token routes before they
are logged. The console email provider logs delivery metadata only, not email
bodies, recipient addresses, notes, or private links.

Idempotency:

- `POST /api/slotboard/events` accepts `Idempotency-Key`.
- `POST /api/slotboard/book/claim` accepts `Idempotency-Key`.
- The guard stores only hashed actor/key/body state and completion status.
- Completed duplicates return `409 idempotency_request_replayed` instead of
  replaying raw public/admin/manage links from storage.

## Database

The migration creates a dedicated `slotboard` schema:

```sh
psql "$SLOTBOARD_DATABASE_URL" -f apps/slots-api/migrations/0001_slotboard.sql
```

Tables:

- `slotboard.booking_events`
- `slotboard.time_slots`
- `slotboard.bookings`
- `slotboard.email_delivery_logs`
- `slotboard.email_webhook_events`
- `slotboard.rate_limit_events`
- `slotboard.idempotency_keys`
- `slotboard.auth_users`
- `slotboard.auth_sessions`
- `slotboard.auth_accounts`
- `slotboard.auth_verifications`
- `slotboard.billing_customers`
- `slotboard.event_purchases`
- `slotboard.subscriptions`
- `slotboard.custom_domains`

The migration includes the important v1 constraints:

- one active booking per slot
- one active booking per participant email per event when `dedupe_email` is set
- composite booking foreign key against `(event_id, slot_id)`
- hashed public/admin/manage tokens only

The full backend implementation plan is in [BACKEND_PLAN.md](./BACKEND_PLAN.md).

## Implemented

- `GET /healthz`
- `POST /api/slotboard/availability/preview`
- `POST /api/slotboard/events`
- `GET /api/slotboard/book` with `Authorization: Bearer <publicToken>`
- `GET /api/slotboard/book/:publicToken`
- `POST /api/slotboard/book/claim` with `Authorization: Bearer <publicToken>`
- `POST /api/slotboard/book/:publicToken/claim`
- `GET /api/slotboard/manage` with `Authorization: Bearer <manageToken>`
- `GET /api/slotboard/manage/:manageToken`
- `GET /api/slotboard/manage/calendar.ics` with `Authorization: Bearer <manageToken>`
- `GET /api/slotboard/manage/:manageToken/calendar.ics`
- `POST /api/slotboard/manage/resend-email` with `Authorization: Bearer <manageToken>`
- `POST /api/slotboard/manage/:manageToken/resend-email`
- `POST /api/slotboard/manage/cancel` with `Authorization: Bearer <manageToken>`
- `POST /api/slotboard/manage/:manageToken/cancel`
- `GET /api/slotboard/admin` with `Authorization: Bearer <adminToken>`
- `GET /api/slotboard/admin/:adminToken`
- `PATCH /api/slotboard/admin/event` with `Authorization: Bearer <adminToken>`
- `PATCH /api/slotboard/admin/:adminToken/event`
- `POST /api/slotboard/admin/archive` with `Authorization: Bearer <adminToken>`
- `POST /api/slotboard/admin/:adminToken/archive`
- `POST /api/slotboard/admin/delete` with `Authorization: Bearer <adminToken>`
- `POST /api/slotboard/admin/:adminToken/delete`
- `POST /api/slotboard/admin/slots/:slotId/close` with `Authorization: Bearer <adminToken>`
- `POST /api/slotboard/admin/:adminToken/slots/:slotId/close`
- `POST /api/slotboard/admin/slots/:slotId/reopen` with `Authorization: Bearer <adminToken>`
- `POST /api/slotboard/admin/:adminToken/slots/:slotId/reopen`
- `POST /api/slotboard/admin/bookings/:bookingId/cancel` with `Authorization: Bearer <adminToken>`
- `POST /api/slotboard/admin/:adminToken/bookings/:bookingId/cancel`
- `POST /api/slotboard/admin/bookings/:bookingId/resend-email` with `Authorization: Bearer <adminToken>`
- `POST /api/slotboard/admin/:adminToken/bookings/:bookingId/resend-email`
- `GET /api/slotboard/admin/export.csv` with `Authorization: Bearer <adminToken>`
- `GET /api/slotboard/admin/:adminToken/export.csv`
- `GET|POST /api/auth/*` for Better Auth organizer accounts
- `GET /api/slotboard/account/events` with a Better Auth session cookie
- `GET /api/slotboard/account/events/:eventId`
- `PATCH /api/slotboard/account/events/:eventId`
- `POST /api/slotboard/account/events/:eventId/archive`
- `POST /api/slotboard/account/events/:eventId/delete`
- `POST /api/slotboard/account/events/:eventId/slots/:slotId/close`
- `POST /api/slotboard/account/events/:eventId/slots/:slotId/reopen`
- `POST /api/slotboard/account/events/:eventId/bookings/:bookingId/cancel`
- `POST /api/slotboard/account/events/:eventId/bookings/:bookingId/resend-email`
- `GET /api/slotboard/account/events/:eventId/export.csv`
- `GET /api/slotboard/billing/readiness`
- `GET /api/slotboard/account/custom-domain`
- `POST /api/slotboard/account/custom-domain`
- `POST /api/slotboard/account/custom-domain/verify`
- `POST /api/slotboard/ops/custom-domain/activate`
- `POST /api/slotboard/billing/event-pass/checkout`
- `POST /api/slotboard/account/events/:eventId/billing/event-pass/checkout`
- `POST /api/slotboard/billing/company-standby/checkout`
- `POST /api/slotboard/recover`
- `GET /api/slotboard/ops/email-readiness`
- `POST /api/slotboard/ops/email-test` with `Authorization: Bearer <SLOTBOARD_OPS_SECRET>`
- `POST /api/slotboard/ops/custom-domain/activate` with `Authorization: Bearer <SLOTBOARD_OPS_SECRET>`
- `POST /api/slotboard/webhooks/email-provider`
- `POST /api/slotboard/webhooks/stripe`

The preview endpoint is intentionally DB-free. It lets the frontend availability builder use the same slot generation rules as the backend before the create-event transaction is wired.

The create-event endpoint writes the `booking_events` row and all generated `time_slots` rows in one transaction, stores only hashed public/admin tokens, and returns the public/admin URLs once in the response.

Booking claim and cancellation routes now attempt transactional email delivery
after the database transaction commits. Delivery failures are logged in
`slotboard.email_delivery_logs` and do not roll back the booking state.
Admin-link recovery rotates the admin token and sends a fresh admin URL to the
organizer email while keeping the HTTP response generic.
Organizer lifecycle routes soft-archive or soft-delete boards. Archived public
links return the event in archived state with no claimable slots, while deleted
boards reject public and admin tokens.
The retention worker archives expired active boards, soft-deletes old archived
boards, scrubs PII and token hashes after deleted-board grace periods, and
removes stale rate-limit rows.

Token routes retain the original URL-token contract for browser links, but API
clients should prefer the header-based variants. This keeps admin/manage tokens
out of API paths once the SPA has parsed the initial link.

Create-event request shape:

```json
{
  "title": "Vision Assessment",
  "description": "Optional plain-text details.",
  "organizerName": "Oyani Solis",
  "organizerEmail": "oyani@example.com",
  "timezone": "Africa/Johannesburg",
  "allowMultipleBookings": false,
  "availability": {
    "startDate": "2026-05-18",
    "endDate": "2026-05-22",
    "weekdays": [1, 2, 3, 4, 5],
    "dailyStart": "09:00",
    "dailyEnd": "17:00",
    "durationMinutes": 60,
    "timezone": "Africa/Johannesburg",
    "blockedRanges": [
      { "start": "12:00", "end": "13:00" }
    ]
  }
}
```

## Remaining Backend Work

- Add frontend account screens if the product needs more persistent organizer dashboard depth.
- Email verification and password-reset templates are wired; keep their smoke tests in the production gate.
