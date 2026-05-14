# mytimes

Standalone booking board project for mytimes.

## What's Included

```txt
apps/slots             frontend
apps/slots-api         backend API
packages/slotboard-core shared slot, token, and ICS helpers
```

This project is standalone. It does not depend on the original `Fresh-feel` repo.

## Install

```sh
npm install
```

## Run Frontend

```sh
npm run dev:slots
```

Frontend runs on:

```txt
http://127.0.0.1:5174
```

## Run API

```sh
npm run dev:api
```

API runs on:

```txt
http://127.0.0.1:3014
```

## Database

The API needs Postgres for event creation.

Start only the included local Postgres:

```sh
docker compose up -d postgres
```

Run the mytimes schema migration:

```sh
docker compose exec -T postgres psql -U slotboard -d slotboard < apps/slots-api/migrations/0001_slotboard.sql
```

Use this API env locally:

```sh
export SLOTBOARD_DATABASE_URL='postgres://slotboard:slotboard@localhost:5434/slotboard?sslmode=disable'
export SLOTBOARD_PUBLIC_APP_URL='http://127.0.0.1:5174'
export SLOTBOARD_TOKEN_PEPPER='replace-with-a-long-random-secret'
export SLOTBOARD_AUTH_SECRET='replace-with-a-second-long-random-secret'
export SLOTBOARD_AUTH_BASE_URL='http://127.0.0.1:3014'
export SLOTBOARD_DB_STATEMENT_TIMEOUT_MS=10000
export SLOTBOARD_DB_QUERY_TIMEOUT_MS=10000
```

## Checks

```sh
npm run typecheck
npm run build
```

With the API running, execute the backend smoke flow:

```sh
npm run smoke:api
npm run smoke:auth
npm run smoke:retention
npm run test:api
npm run test:hardening
npm run test:email
```

The billing entitlement regression needs local Postgres, but it does not need
the Docker API. By default it starts the current source API on a random local
port so stale Compose images on `3014` cannot affect the result:

```sh
npm run test:billing
```

To test a specific running API instead, pass its origin explicitly:

```sh
SLOTBOARD_API_URL=http://127.0.0.1:3014 npm run test:billing
```

## Docker Compose

Run the local production-style stack:

```sh
docker compose up --build
```

Services:

```txt
frontend  http://127.0.0.1:5174
api       http://127.0.0.1:3014
postgres 127.0.0.1:5434
```

The `migrate` service runs `apps/slots-api/migrations/0001_slotboard.sql` before the API starts.

## Railway

Railway deploys Compose-style apps as separate services, not by running
`docker-compose.yml` directly. This repo includes `railway.toml` for the API
service, `railway.slots.toml` for the frontend service, and Dockerfiles for
both services.

Recommended Railway setup:

```txt
1. Add a managed Postgres service.
2. Add the API service from this repo.
3. Keep the repo root as the source root.
4. Use railway.toml as the API config file.
5. Set SLOTBOARD_DATABASE_URL or DATABASE_URL from Railway Postgres.
6. Set SLOTBOARD_TOKEN_PEPPER to a long production secret.
7. Set `SLOTBOARD_AUTH_SECRET` or `BETTER_AUTH_SECRET` to a separate long production secret.
8. Set `SLOTBOARD_AUTH_BASE_URL` to the public app origin when the frontend proxies `/api`, for example `https://mytimes.co`.
9. Add the frontend service from this repo and use `railway.slots.toml` as its config file.
10. Leave `VITE_SLOTBOARD_API_URL` unset, or set it to the public app origin, so auth and account calls go through same-origin `/api`.
11. Set SLOTBOARD_WEB_ORIGINS and SLOTBOARD_PUBLIC_APP_URL on the API service to the frontend domain.
12. Set transactional email vars:
   - `SLOTBOARD_EMAIL_PROVIDER=console`, `resend`, or `postmark`
   - `SLOTBOARD_SENDER_EMAIL=mytimes <bookings@yourdomain.com>`
   - `SLOTBOARD_RESEND_API_KEY` or `RESEND_API_KEY` for Resend
   - `SLOTBOARD_RESEND_WEBHOOK_SECRET` or `RESEND_WEBHOOK_SECRET` for Resend webhook signature verification
   - `SLOTBOARD_POSTMARK_SERVER_TOKEN` or `POSTMARK_SERVER_TOKEN` for Postmark
   - `SLOTBOARD_EMAIL_WEBHOOK_SECRET` for Postmark webhook URL/header protection
13. Set Stripe billing vars before enabling paid checkout:
   - `SLOTBOARD_STRIPE_SECRET_KEY` or `STRIPE_SECRET_KEY`
   - `SLOTBOARD_STRIPE_WEBHOOK_SECRET` or `STRIPE_WEBHOOK_SECRET`
   - `SLOTBOARD_BILLING_CURRENCY=usd`
   - `SLOTBOARD_EVENT_PASS_AMOUNT=1900`
   - `SLOTBOARD_COMPANY_STANDBY_AMOUNT=4900`
   - `SLOTBOARD_COMPANY_STANDBY_ANNUAL_AMOUNT=48000`
   - `SLOTBOARD_CUSTOM_DOMAIN_CNAME_TARGET=<frontend-service-host>`
14. Set `SLOTBOARD_OPS_SECRET` to a long secret for protected operational checks.
15. Optional retention vars:
   - `SLOTBOARD_RETENTION_ARCHIVE_AFTER_DAYS=30`
   - `SLOTBOARD_RETENTION_DELETE_ARCHIVED_AFTER_DAYS=365`
   - `SLOTBOARD_RETENTION_PII_SCRUB_AFTER_DAYS=30`
   - `SLOTBOARD_RETENTION_RATE_LIMIT_AFTER_DAYS=7`
   - `SLOTBOARD_RETENTION_IDEMPOTENCY_AFTER_DAYS=7`
16. Optional operational tuning:
   - `SLOTBOARD_DB_POOL_MAX=10`
   - `SLOTBOARD_DB_CONNECTION_TIMEOUT_MS=5000`
   - `SLOTBOARD_DB_IDLE_TIMEOUT_MS=30000`
   - `SLOTBOARD_DB_QUERY_TIMEOUT_MS=10000`
   - `SLOTBOARD_DB_STATEMENT_TIMEOUT_MS=10000`
   - `SLOTBOARD_GRACEFUL_SHUTDOWN_MS=10000`
```

The API Railway config runs the migration as a pre-deploy command and uses
`/healthz` as the deployment health check.

## Backup And Restore

Backups are a launch blocker. A dump only counts once it has restored cleanly
into a separate database.

Create a local backup from `SLOTBOARD_DATABASE_URL`, or from the default local
Compose database when that variable is unset:

```sh
npm run db:backup
```

Restore the latest backup into a temporary local database, verify the core
`slotboard` tables, and drop the temporary database:

```sh
npm run db:restore-check
```

Create a deliberate Railway production backup:

```sh
npm run db:backup:railway
```

To verify Railway SSH backup wiring without copying production data, run a
schema-only dump:

```sh
SLOTBOARD_BACKUP_SCHEMA_ONLY=true npm run db:backup:railway
```

The scripts prefer local `pg_dump`, `pg_restore`, and `psql` when installed.
When those clients are unavailable, they fall back to the Docker
`postgres:17-alpine` client image. Backups are written under `backups/`, ignored
by git, and may contain customer data. Store production copies in encrypted
storage only.

See [docs/production-runbook.md](docs/production-runbook.md) for the launch
runbook and restore-drill fields to fill in.

Check whether the deployed API is actually configured for production email:

```sh
SLOTBOARD_API_URL=https://<api-service>.up.railway.app npm run email:ready
```

For a failing CI-style check, require production delivery:

```sh
SLOTBOARD_API_URL=https://<api-service>.up.railway.app SLOTBOARD_REQUIRE_PRODUCTION_EMAIL=true npm run email:ready
```

The readiness response is safe to expose: it reports provider/configured status,
required variable names, and setup issues, but never returns API keys or webhook
secrets. `SLOTBOARD_EMAIL_PROVIDER=console` means booking emails are logged only
and users will not receive confirmations.

When a board is created, the API sends the organizer an `event_links` email
containing the public participant link and the private admin link. Booking,
cancellation, manage-link resend, recovery, and provider-test emails are all
logged in `slotboard.email_delivery_logs`.
Organizer resend actions rotate the participant manage token before emailing,
so a lost or stale manage link is replaced with a fresh one.

Billing readiness is included in `GET /readyz` and exposed at
`GET /api/slotboard/billing/readiness`. Paid checkout is intentionally blocked
unless both the Stripe secret key and Stripe webhook secret are configured, so
mytimes cannot collect money without a fulfillment webhook.

Check whether the deployed API is actually configured for production billing:

```sh
SLOTBOARD_API_URL=https://<api-service>.up.railway.app npm run billing:ready
```

For a failing CI-style check, require Stripe checkout and webhook readiness:

```sh
SLOTBOARD_API_URL=https://<api-service>.up.railway.app SLOTBOARD_REQUIRE_PRODUCTION_BILLING=true npm run billing:ready
```

To verify live Stripe Checkout session creation without charging a card:

```sh
SLOTBOARD_API_URL=https://mytimes.co \
SLOTBOARD_WEB_ORIGIN=https://mytimes.co \
SLOTBOARD_SMOKE_ORGANIZER_EMAIL=<verified-organizer-email> \
SLOTBOARD_SMOKE_ORGANIZER_PASSWORD=<verified-organizer-password> \
npm run smoke:billing-live
```

This creates a temporary board, starts an Event Pass Checkout session, confirms
that pending payment hides public slots, creates annual and monthly Company
Checkout sessions, and then deletes the temporary board. It does not complete
payment or prove webhook fulfillment; after manually completing one Checkout,
refresh the board/account page to confirm the webhook applied the paid
entitlement. In local/dev environments you can use `SLOTBOARD_AUTH_SECRET`
instead of smoke organizer credentials; the script will create and verify a
temporary account.

Stripe webhook URL:

```txt
https://<api-service>.up.railway.app/api/slotboard/webhooks/stripe
```

Implemented billing entry points:

```txt
GET /api/slotboard/billing/account
POST /api/slotboard/billing/customer-portal
GET /api/slotboard/account/custom-domain
POST /api/slotboard/account/custom-domain
POST /api/slotboard/account/custom-domain/verify
POST /api/slotboard/ops/custom-domain/activate
GET /api/slotboard/account/exports/bookings.csv
POST /api/slotboard/billing/event-pass/checkout
POST /api/slotboard/account/events/:eventId/billing/event-pass/checkout
POST /api/slotboard/billing/company-standby/checkout
POST /api/slotboard/webhooks/stripe
```

Free boards get a 60-day window, publish the first 60 generated slots, accept
up to 25 active bookings, and can export per-board CSV. Cross-board CSV export
returns `402 cross_board_csv_requires_company` unless the signed-in organizer has
an active Company subscription. Board unlock checkout
upgrades one board to 75 bookings, 200 generated slots, removes the public
mytimes footer, and applies a 180-day paid window when Stripe sends
`checkout.session.completed`. Company checkout creates a Stripe subscription record for the signed-in
organizer and applies high-limit workspace entitlements to that organizer's
active boards. Signed-in organizers can read their billing status from the
account page and open the Stripe Customer Portal once a Stripe customer exists.
Company also unlocks the custom-domain request workflow: mytimes stores
one requested booking subdomain, returns the required TXT and CNAME records, and
can verify DNS before a final platform-level Railway domain attachment. Once the
domain is marked active, the API allows that origin through CORS so the public
booking page can call the API from `https://book.company.com`. New public
booking links, rotated public links, and participant manage links prefer the
active custom domain; admin, billing, and account links stay on the main mytimes
app host.

After the customer adds the TXT and CNAME records and the account page reports
DNS verified, attach the domain to the Railway frontend service and activate it
in mytimes:

```sh
SLOTBOARD_CUSTOM_DOMAIN=book.company.com \
SLOTBOARD_API_URL=https://<api-service>.up.railway.app \
SLOTBOARD_OPS_SECRET=<same-secret-set-on-api-service> \
npm run custom-domain:activate
```

The script runs `railway domain --service slots --port 4174 --json <domain>` and
then calls `POST /api/slotboard/ops/custom-domain/activate`. Use
`SLOTBOARD_CUSTOM_DOMAIN_ACTIVATION_DRY_RUN=true` to inspect the command without
changing Railway or API state. If the Railway domain has already been attached
manually, add `SLOTBOARD_CUSTOM_DOMAIN_SKIP_RAILWAY=true` to only mark the
verified domain active.

After configuring Resend or Postmark, send one provider-backed test email from
the deployed API:

```sh
SLOTBOARD_API_URL=https://<api-service>.up.railway.app \
SLOTBOARD_OPS_SECRET=<same-secret-set-on-api-service> \
SLOTBOARD_TEST_EMAIL=you@example.com \
npm run email:test
```

The test endpoint refuses `SLOTBOARD_EMAIL_PROVIDER=console`, requires
`SLOTBOARD_OPS_SECRET`, and writes to `slotboard.email_delivery_logs` with
`email_type=email_test`.

For this Railway project, Resend production activation can be run in one step
after the sender domain is verified and a Resend API key exists:

```sh
SLOTBOARD_RESEND_API_KEY=<resend-api-key> \
SLOTBOARD_SENDER_EMAIL="mytimes <bookings@yourdomain.com>" \
SLOTBOARD_TEST_EMAIL=you@example.com \
SLOTBOARD_OPS_SECRET=<same-secret-set-on-api-service> \
npm run email:activate:resend
```

The activation script sets the API service variables, flips
`SLOTBOARD_EMAIL_PROVIDER=resend`, waits for
`/api/slotboard/ops/email-readiness` to report `productionReady: true`, and
sends a provider-backed test email when `SLOTBOARD_TEST_EMAIL` and
`SLOTBOARD_OPS_SECRET` are supplied. The API key is passed to Railway via
stdin so it is not exposed in the process list.

Add `SLOTBOARD_EMAIL_ACTIVATION_DRY_RUN=true` to validate the command without
changing Railway variables.

Stripe production activation can be run after the Stripe webhook endpoint has
been created and the webhook signing secret is available:

```sh
SLOTBOARD_STRIPE_SECRET_KEY=<stripe-secret-key> \
SLOTBOARD_STRIPE_WEBHOOK_SECRET=<stripe-webhook-secret> \
SLOTBOARD_STRIPE_EVENT_PASS_PRICE_ID=<stripe-event-pass-price-id> \
SLOTBOARD_STRIPE_COMPANY_STANDBY_PRICE_ID=<stripe-company-standby-price-id> \
SLOTBOARD_STRIPE_COMPANY_STANDBY_ANNUAL_PRICE_ID=<stripe-company-annual-price-id> \
SLOTBOARD_BILLING_CURRENCY=usd \
SLOTBOARD_EVENT_PASS_AMOUNT=1900 \
SLOTBOARD_COMPANY_STANDBY_AMOUNT=4900 \
SLOTBOARD_COMPANY_STANDBY_ANNUAL_AMOUNT=48000 \
npm run billing:activate:stripe
```

The activation script sets the API service variables, triggers one Railway
deploy, then waits for `/api/slotboard/billing/readiness` to report
`productionReady: true`. Secrets are passed to Railway via stdin so they are
not exposed in the process list.

Add `SLOTBOARD_STRIPE_ACTIVATION_DRY_RUN=true` to validate the command without
changing Railway variables. Add `SLOTBOARD_STRIPE_TEST_ADMIN_TOKEN=<admin-token>`
to create one board unlock Checkout Session after readiness passes; use this only
with Stripe test mode or a disposable board because it moves that board into
`payment_status=pending`.

If the price ID variables are present, Checkout uses the configured Stripe
catalog prices. If they are omitted, the API falls back to inline `price_data`
using the amount and currency variables.

Better Auth is mounted at `/api/auth/*` for organizer accounts. Link-based
public/admin/manage tokens remain the authority for shared booking links, while
signed-in organizers can create owned boards and manage them through
`/api/slotboard/account/events`.

Frontend auth links:

```txt
/signup
/signin
/account
```

Generate exact local or Railway URLs with:

```sh
npm run auth:links
SLOTBOARD_PUBLIC_APP_URL=https://<frontend-service>.up.railway.app \
SLOTBOARD_AUTH_BASE_URL=https://<api-service>.up.railway.app \
npm run auth:links
```

API logs are JSON lines. Request logs include `X-Request-Id`, method, status,
duration, and token-redacted paths so admin/manage/public URL tokens are not
written to logs. Console email delivery logs contain metadata only, not email
bodies, recipient addresses, notes, or private links.

`POST /api/slotboard/events` and `POST /api/slotboard/book/claim` accept an
optional `Idempotency-Key` header. Replayed keys are rejected with `409` after
the first successful write instead of storing raw private links for response
replay.

Run retention as a separate Railway cron or one-off worker using the same API
image:

```sh
npm run retention:prod --workspace @fresh-feel/slots-api
```

Retention archives expired boards, soft-deletes old archived boards, scrubs PII
for deleted boards, and removes stale rate-limit rows. Tune with
`SLOTBOARD_RETENTION_ARCHIVE_AFTER_DAYS`,
`SLOTBOARD_RETENTION_DELETE_ARCHIVED_AFTER_DAYS`,
`SLOTBOARD_RETENTION_PII_SCRUB_AFTER_DAYS`, and
`SLOTBOARD_RETENTION_RATE_LIMIT_AFTER_DAYS`.

For a separately hosted frontend build, set `VITE_SLOTBOARD_API_URL` to the API
origin at build time. Local development infers `http://127.0.0.1:3014` when the
frontend is served from `127.0.0.1` or `localhost`.
