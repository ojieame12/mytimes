# mytimes Production Runbook

This is the operational checklist for taking mytimes from "deployed" to
"recoverable production service".

## 1. Backup And Restore

Backups are not complete until a restore has been tested.

Local backup from `SLOTBOARD_DATABASE_URL` or the default Compose database:

```sh
npm run db:backup
npm run db:restore-check
```

Deliberate Railway production backup:

```sh
npm run db:backup:railway
```

Railway backup wiring check without copying production data:

```sh
SLOTBOARD_BACKUP_SCHEMA_ONLY=true npm run db:backup:railway
```

The Railway backup mode streams `pg_dump` from the `postgres` service over
Railway SSH into `backups/*.dump`. Those files contain customer data and are
ignored by git. Store long-lived copies in an encrypted location only.

Before launch, record:

```txt
Last production backup: 2026-05-15T08:22:12Z, `/Users/ojieame/caboo-slots-mini/backups/mytimes-railway-2026-05-15T08-22-12-741Z.dump`, 220004 bytes
Last restore-check result: passed on 2026-05-15T08:22Z, restored into temporary local database `slotboard_restore_1778833351979_r988tq`, verified 19 slotboard tables, 119 booking events, 227 time slots, 93 bookings, then dropped temporary database
Encrypted storage location:
Railway snapshot/backups enabled:
Restore owner:
```

## 2. Payments

Run the billing readiness probe against the live app:

```sh
npm run billing:ready
```

Latest production check:

```txt
2026-05-15T08:23Z: `SLOTBOARD_API_URL=https://mytimes.co npm run billing:ready` passed.
Stripe production ready: true.
Event Pass: $19, `price_1TWzwLEyVU0foL2MNuKxT2C0`.
Company monthly: $49, `price_1TWzwLEyVU0foL2MraZv8dCi`.
Company annual: $480, `price_1TWzwMEyVU0foL2MRpfg03kO`.
```

Then test the actual Stripe flows:

```txt
1. Create a free board.
2. Trigger the board unlock checkout.
3. Complete Stripe Checkout in test mode.
4. Confirm the webhook upgrades the board to Event Pass.
5. Book a slot on the upgraded board.
6. Start a Company monthly checkout.
7. Start a Company annual checkout.
8. Cancel the test subscription and confirm downgrade behavior.
```

## 3. Email

Run readiness first:

```sh
npm run email:ready
```

Then send real provider-backed emails to Gmail, Outlook, and one corporate
mailbox:

```sh
SLOTBOARD_TEST_EMAIL=you@example.com npm run email:test
```

Latest production check:

```txt
2026-05-15T08:23Z: `SLOTBOARD_API_URL=https://mytimes.co npm run email:ready` passed.
Provider: resend.
Sender: mytimes <bookings@mytimes.co>.
Delivery configured: true.
Webhook configured: true.
Bounce tracking configured: true.
```

Confirm:

```txt
event created email includes public and admin links
booking confirmation includes a usable .ics attachment
organizer booking notice is delivered
participant cancellation email is delivered
organizer cancellation notice is delivered
admin recovery email is delivered
my boards link email is delivered
```

## 4. Live Smoke

Run the live readiness suite:

```sh
npm run security:ready
```

Latest production check:

```txt
2026-05-15T08:23Z: `npm run security:ready` passed.
Root domain, www domain, security headers, live bundles, billing readiness, email readiness, and CORS all passed.
```

Then manually exercise:

```txt
create board
book slot
participant cancel
admin recover
CSV export
pricing page
account sign in
Company checkout entry point
```

## 5. Retention Cron

Retention must run as a separate Railway cron service. The service should use:

```txt
Config file: /railway.retention.toml
Schedule: 0 2 * * * (02:00 UTC daily)
Command: npm run retention:prod --workspace @fresh-feel/slots-api
```

## 6. Observability

Frontend and API Sentry code is present, but production is not complete until
the Railway services have DSNs configured.

Latest production check:

```txt
2026-05-15T08:24Z: `https://mytimes.co/readyz` reported observability.productionReady=false.
Missing API variable: SENTRY_DSN.
Recommended API variables: SENTRY_DSN, SENTRY_ENVIRONMENT=production, SENTRY_RELEASE=<git sha or Railway commit sha>.
Recommended frontend variables: VITE_SENTRY_DSN, VITE_SENTRY_ENVIRONMENT=production, VITE_SENTRY_RELEASE=<git sha or Railway commit sha>.
```

After creating or changing the service, trigger one manual deployment/run and
confirm the logs contain:

```txt
slotboard_retention_completed
```

Daily operational check:

```txt
Retention service last successful run:
Retention service last failure:
Retention owner:
```

If retention has not completed in 48 hours, run it manually from the same image
or through Railway with:

```sh
npm run retention:prod
```

Then inspect the logs and rerun `npm run smoke:retention` locally before making
more retention changes.

## 6. Webhook Recovery

Stripe retries webhook delivery for a limited window. If the API was down or a
delivery failed repeatedly, replay the affected events from the Stripe
dashboard after the API is healthy. Confirm the board or subscription state in
the app, then rerun:

```sh
npm run billing:ready
```

## 7. Monitoring

Minimum launch alerts:

```txt
https://mytimes.co
https://mytimes.co/pricing
https://mytimes.co/readyz
https://mytimes.co/api/slotboard/billing/readiness
https://mytimes.co/api/slotboard/ops/email-readiness
```

Add error tracking before broad launch. Sentry is enough for v1 if API and
frontend errors both report release SHA and environment.
