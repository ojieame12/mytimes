# mytimes Backend End-to-End Plan

This plan describes the complete backend path for mytimes: current state, target architecture, missing work, implementation phases, tests, and deployment operations.

mytimes remains a standalone scheduling app inside this repo. It does not depend on the main web app runtime.

## Current State

### Implemented

- `apps/slots-api` contains the Hono API.
- `packages/slotboard-core` contains pure helpers for slot generation, token generation/hashing, and ICS generation.
- Postgres schema exists under the `slotboard` schema.
- Migration runner exists through `npm run migrate --workspace @fresh-feel/slots-api`.
- Docker Compose local stack exists with Postgres, migration, API, and static frontend services.
- Railway API config exists in `railway.toml`.
- Production startup rejects the development token pepper.

Implemented routes:

| Method | Route | Notes |
| --- | --- | --- |
| `GET` | `/healthz` | Health check |
| `POST` | `/api/slotboard/availability/preview` | DB-free slot preview |
| `POST` | `/api/slotboard/events` | Create event and slots |
| `GET` | `/api/slotboard/book` | Bearer public token |
| `GET` | `/api/slotboard/book/:publicToken` | Browser link compatibility |
| `POST` | `/api/slotboard/book/claim` | Bearer public token |
| `POST` | `/api/slotboard/book/:publicToken/claim` | Browser link compatibility |
| `GET` | `/api/slotboard/manage` | Bearer manage token |
| `GET` | `/api/slotboard/manage/:manageToken` | Browser link compatibility |
| `POST` | `/api/slotboard/manage/cancel` | Bearer manage token |
| `POST` | `/api/slotboard/manage/:manageToken/cancel` | Browser link compatibility |
| `GET` | `/api/slotboard/admin` | Bearer admin token |
| `GET` | `/api/slotboard/admin/:adminToken` | Browser link compatibility |
| `PATCH` | `/api/slotboard/admin/event` | Bearer admin token |
| `PATCH` | `/api/slotboard/admin/:adminToken/event` | Browser link compatibility |
| `POST` | `/api/slotboard/admin/archive` | Bearer admin token |
| `POST` | `/api/slotboard/admin/:adminToken/archive` | Browser link compatibility |
| `POST` | `/api/slotboard/admin/delete` | Bearer admin token |
| `POST` | `/api/slotboard/admin/:adminToken/delete` | Browser link compatibility |
| `POST` | `/api/slotboard/admin/slots/:slotId/close` | Bearer admin token |
| `POST` | `/api/slotboard/admin/:adminToken/slots/:slotId/close` | Browser link compatibility |
| `POST` | `/api/slotboard/admin/slots/:slotId/reopen` | Bearer admin token |
| `POST` | `/api/slotboard/admin/:adminToken/slots/:slotId/reopen` | Browser link compatibility |
| `POST` | `/api/slotboard/admin/bookings/:bookingId/cancel` | Bearer admin token |
| `POST` | `/api/slotboard/admin/:adminToken/bookings/:bookingId/cancel` | Browser link compatibility |
| `GET` | `/api/slotboard/admin/export.csv` | Bearer admin token |
| `GET` | `/api/slotboard/admin/:adminToken/export.csv` | Browser link compatibility |
| `GET/POST` | `/api/auth/*` | Better Auth organizer account handler |
| `GET` | `/api/slotboard/account/events` | Better Auth session cookie |
| `GET/PATCH` | `/api/slotboard/account/events/:eventId` | Better Auth session cookie |
| `POST` | `/api/slotboard/account/events/:eventId/archive` | Better Auth session cookie |
| `POST` | `/api/slotboard/account/events/:eventId/delete` | Better Auth session cookie |
| `POST` | `/api/slotboard/account/events/:eventId/slots/:slotId/close` | Better Auth session cookie |
| `POST` | `/api/slotboard/account/events/:eventId/slots/:slotId/reopen` | Better Auth session cookie |
| `POST` | `/api/slotboard/account/events/:eventId/bookings/:bookingId/cancel` | Better Auth session cookie |
| `GET` | `/api/slotboard/account/events/:eventId/export.csv` | Better Auth session cookie |
| `POST` | `/api/slotboard/recover` | Generic response and rate limit |

### Remaining

- Production email provider activation. The backend has Resend/Postmark support,
  but Railway is still configured with `SLOTBOARD_EMAIL_PROVIDER=console`.
- Email verification, password reset, or passwordless magic-link auth before
  public account registration is treated as a first-class conversion path.
- Account and billing entitlements. Current accounts are ownership dashboards
  only; they do not enforce plans, limits, purchases, or subscriptions.

## Product Scope

### V1 Model

mytimes is a link-based one-off booking board:

- Full user accounts are optional for V1.
- Organizers create one board and receive a public link plus a private admin link.
- Participants open the public link and claim a slot.
- Participants receive a private manage link.
- Admin/manage/public credentials are opaque bearer tokens.
- Only token hashes are stored in the database.

### Non-Goals For V1

- Multi-organizer accounts.
- Calendar OAuth sync.
- Recurring event templates.
- Payment processing.
- Team permissions.
- Team admin permissions.

### Auth Direction

The current link-token model is appropriate for V1. It is simpler than account auth and matches the product shape.

Use this model now:

- Public token grants read/claim access to one event.
- Admin token grants organizer actions for one event.
- Manage token grants participant actions for one booking.
- API clients should use `Authorization: Bearer <token>` after parsing the initial browser link.
- URL-token routes remain only for direct link entry and backward compatibility.

Account auth now supports signed-in organizer dashboards:

- Better Auth handles email/password sessions under `/api/auth/*`.
- Signed-in event creation stores `owner_user_id` on the board.
- `/api/slotboard/account/events` lists and manages boards owned by the signed-in organizer.
- Account auth does not replace public/manage participant links or direct admin links. Those remain token-based.

### Timezone Handling

mytimes uses one source timezone per event, exact UTC instants for slots,
and participant-local rendering on the booking page.

Backend rules:

- Store `booking_events.timezone` as an IANA timezone such as `Europe/London`.
- Store `time_slots.starts_at` and `time_slots.ends_at` as `timestamptz`.
- Store source wall-clock metadata on each slot: `source_date`,
  `source_start_time`, and `source_end_time`.
- Store participant timezone metadata when a slot is claimed:
  `participant_timezone`, `participant_locale`, and
  `participant_offset_at_booking`.
- Generate `.ics` files with UTC `DTSTART` and `DTEND`.
- Reject nonexistent local wall times and ambiguous fall-back wall times during
  availability generation. The generator must never silently shift a selected
  organizer wall-clock time.
- Lock the event timezone when slots are created. In V1, changing the source
  timezone after bookings exist should be treated as a new-board operation.

Frontend/API rules:

- Public slot APIs return UTC instants, not preformatted time strings.
- Participant booking UI detects the viewer timezone, lets the participant
  override it, and sends that selected timezone when claiming a slot.
- Organizer/admin views default to the event source timezone.
- Confirmation screens and emails should show participant-local time first and
  organizer source time second.

## Account and Billing Roadmap

This roadmap preserves the mytimes wedge: participants never create accounts,
organizers can create value before being asked to sign in, and paid plans are
priced around the booking board/interview round rather than default SaaS seats.

### Identity Layers

#### Layer 1: Token-Only Boards

Status: implemented and should remain the core V1 path.

- Organizer creates a board.
- API generates public/admin links.
- Participants book through public links.
- Participants cancel through manage links.
- Admin links remain valid without an organizer account.

Backend requirements:

- Keep token hashes only.
- Keep direct URL-token routes for shared browser entry.
- Never require participant login.
- Keep account cookies separate from public/admin/manage token authority.

#### Layer 2: Lightweight Organizer Account

Status: partially implemented with Better Auth email/password.

Target product shape:

- Account access should feel like email-based recovery/dashboard access, not
  mandatory onboarding.
- Existing password auth may stay behind the current `/signin` and `/signup`
  screens for now, but the product-facing direction is passwordless or
  verification-first.
- Dashboard appears after at least one board or from explicit sign-in, not as
  the first screen.

Backend requirements:

- Add verified organizer email state to the board lifecycle.
- Add magic-link or email-OTP auth using Better Auth verification records, or
  equivalent passwordless session creation.
- Add account-linking by organizer email after verification:
  boards created anonymously with `organizer_email` can be claimed by the
  verified matching account.
- Add password reset if password auth remains public.
- Continue storing `owner_user_id` on boards created while signed in.

Recommended transition:

1. Keep current password auth for internal/admin testing.
2. Activate real email delivery.
3. Add "email me a sign-in link" as the preferred organizer login flow.
4. Hide password-first copy from the main product journey.
5. Use email verification to claim anonymous boards into accounts.

#### Layer 3: Workspaces and Teams

Status: not started and intentionally not V1.

Add only after real usage shows demand for shared billing, multiple organizers,
ownership transfer, or templates.

Backend requirements:

- `organizations`
- `organization_members`
- role model: `owner`, `admin`, `member`
- board ownership can be either `owner_user_id` or `organization_id`
- transfer ownership audit/activity event
- team billing customer and subscription relationship

### Monetization Model

Recommended launch sequence:

1. Free private beta with usage tracking only.
2. Manual paid pilots before payment integration.
3. Event Pass: one-time paid unlock attached to one board.
4. Pro subscription for repeat individual organizers.
5. Team plan for shared billing and workspaces.

Recommended product keys:

| Product | Initial price | Unit |
| --- | ---: | --- |
| `free` | `$0` | organizer/account |
| `event_pass` | `$9 once` | one booking board |
| `pro_monthly` | `$12/month` | individual organizer |
| `pro_yearly` | `$99/year` | individual organizer |
| `team_monthly` | `$39/month` | workspace |
| `team_yearly` | `$399/year` | workspace |
| `business_annual` | from `$1,500/year` | organization |

Pricing should be configurable in code/data rather than scattered through UI
copy, because it will change during validation.

### Free Limits

Initial suggested free limits:

- 1 active free board per organizer email/account.
- 15 bookings per board.
- 30 generated slots per board.
- 30-day active board window.
- confirmation emails and ICS included.
- participant cancellation included.
- admin link recovery included.
- CSV export can remain free during beta, then become a paid entitlement.

Backend enforcement points:

- `POST /api/slotboard/events`: enforce active-board and slot limits before
  publishing.
- `POST /api/slotboard/book/claim`: enforce booking limit before accepting a
  new claim.
- `GET /api/slotboard/*/export.csv`: check export entitlement.
- retention worker: use plan retention days.
- UI should receive entitlement reason codes, not infer limits locally.

### Event Pass

Event Pass is the first self-serve paid product.

Backend state additions:

```sql
alter table slotboard.booking_events
  add column if not exists plan_key text not null default 'free',
  add column if not exists payment_status text not null default 'free',
  add column if not exists published_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists booking_limit int,
  add column if not exists slot_limit int;

create table if not exists slotboard.billing_customers (
  id uuid primary key default gen_random_uuid(),
  user_id text references slotboard.auth_users(id) on delete set null,
  provider text not null,
  provider_customer_id text not null,
  billing_email text not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_customer_id)
);

create table if not exists slotboard.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id text references slotboard.auth_users(id) on delete set null,
  event_id uuid references slotboard.booking_events(id) on delete set null,
  provider text not null,
  provider_payment_id text not null,
  product_key text not null,
  amount int not null,
  currency text not null,
  status text not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);
```

Recommended statuses:

- `payment_status='free'`
- `payment_status='pending_payment'`
- `payment_status='paid'`
- `payment_status='refunded'`
- `payment_status='failed'`

Board publishing behavior:

- Free boards within limits publish immediately.
- Boards above free limits can be created as `pending_payment` or active but
  unpublished.
- Public booking for a `pending_payment` board returns a closed/paywall state.
- Payment success upgrades the board to `event_pass`, sets paid limits, and
  publishes the board.

### Subscriptions

Add subscriptions after Event Pass proves demand.

Backend state additions:

```sql
create table if not exists slotboard.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text references slotboard.auth_users(id) on delete set null,
  organization_id uuid,
  provider text not null,
  provider_customer_id text not null,
  provider_subscription_id text not null,
  plan_key text not null,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);

create table if not exists slotboard.plan_entitlements (
  plan_key text primary key,
  active_board_limit int,
  bookings_per_board_limit int,
  slots_per_board_limit int,
  csv_export_enabled boolean not null default false,
  branding_removal_enabled boolean not null default false,
  templates_enabled boolean not null default false,
  team_members_limit int,
  retention_days int not null
);
```

Entitlements must be enforced from the mytimes database, not only trusted from
the payment provider.

### Payment Provider Strategy

Provider integration should be adapter-based, the same way email delivery is.

Suggested interface:

```ts
type BillingProvider = {
  createEventPassCheckout(input): Promise<{ checkoutURL: string; providerPaymentId: string }>;
  createSubscriptionCheckout(input): Promise<{ checkoutURL: string; providerCustomerId: string }>;
  createBillingPortalSession(input): Promise<{ portalURL: string }>;
  verifyWebhook(input): Promise<BillingWebhookEvent>;
};
```

Initial provider decision:

- Stripe is the stronger default if the operating entity can use Stripe
  normally and international card payments are the primary target.
- Paystack should be evaluated first if the operating entity is primarily
  South African and local payment rails/ZAR settlement are important.
- Do not build provider-specific assumptions into core entitlement logic.

### Billing Webhooks

Required webhook handling:

- Checkout completed.
- Payment failed.
- Charge refunded.
- Subscription active.
- Subscription past due.
- Subscription cancelled.
- Invoice paid.
- Invoice failed.

Webhook rules:

- Verify provider signatures.
- Store provider event ids idempotently.
- Update purchases/subscriptions in transaction.
- Recompute entitlements from local database state.
- Never publish a paid board from client-only success redirects.

### Paywall UX Backing API

The frontend should ask the backend why an action is blocked.

Recommended endpoint shapes:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/slotboard/account/entitlements` | Current account limits and usage |
| `GET` | `/api/slotboard/account/events/:eventId/entitlements` | Board-level limits and paywall reasons |
| `POST` | `/api/slotboard/account/events/:eventId/checkout/event-pass` | Create one-time checkout |
| `POST` | `/api/slotboard/account/checkout/pro` | Create subscription checkout |
| `POST` | `/api/slotboard/account/billing-portal` | Hosted billing portal session |
| `POST` | `/api/slotboard/webhooks/billing-provider` | Stripe/Paystack webhook entry |

Example entitlement response:

```json
{
  "planKey": "free",
  "usage": {
    "activeBoards": 1,
    "slots": 42,
    "bookings": 8
  },
  "limits": {
    "activeBoards": 1,
    "slotsPerBoard": 30,
    "bookingsPerBoard": 15
  },
  "blockedActions": [
    {
      "action": "publish_board",
      "reason": "slot_limit_exceeded",
      "upgradeProductKey": "event_pass"
    }
  ]
}
```

### Account/Billing Implementation Phases

#### V1.1: Email Verification and Account Claiming

Tasks:

- Activate production email provider.
- Add organizer email verification flow for board activation or account claim.
- Add password reset if password auth remains.
- Add passwordless login/magic-link path.
- Add board claiming by verified organizer email.
- Add smoke tests for account claim and verification links.

Acceptance:

- Anonymous board creation still works.
- Participants still never sign in.
- A verified organizer account can see boards created with the same organizer
  email.
- Unverified emails cannot claim other organizers' boards.

#### V1.2: Entitlement Skeleton Without Payments

Tasks:

- Add `plan_key`, `payment_status`, `published_at`, `expires_at`,
  `booking_limit`, and `slot_limit` to `booking_events`.
- Add entitlement resolver and usage calculator.
- Add enforcement to create, claim, CSV export, and retention.
- Add admin/account API response fields for limits and upgrade reasons.
- Keep every account on `free`.

Acceptance:

- Free limits are enforced consistently.
- Paywall reason codes are deterministic.
- Existing boards migrate safely to sensible defaults.

#### V1.3: Manual Pilot Purchases

Tasks:

- Add `billing_customers` and `purchases`.
- Add internal/manual endpoint or script to grant `event_pass`.
- Record purchase metadata without taking payment in-app.
- Upgrade selected boards to `event_pass`.

Acceptance:

- Manual paid pilot can unlock board limits.
- Purchase audit trail exists.
- No payment provider dependency yet.

#### V1.4: Event Pass Checkout

Tasks:

- Pick provider: Stripe or Paystack.
- Add provider adapter.
- Add checkout creation endpoint.
- Add billing webhook table and handler.
- On successful checkout, upgrade event to `event_pass`.
- Add payment smoke tests with provider test mode.

Acceptance:

- User can unlock one board.
- Client redirect alone cannot unlock the board.
- Duplicate webhooks are idempotent.
- Failed/refunded payments do not leave paid entitlements active.

#### V2: Pro Subscription

Tasks:

- Add subscriptions table.
- Add hosted billing portal.
- Add Pro entitlement resolver.
- Add templates, duplication, and longer retention behind entitlements.
- Add downgrade behavior.

Acceptance:

- Pro subscription updates local entitlement state through webhooks.
- Cancelled Pro users keep existing paid/event-pass boards through expiry.
- New boards fall back to free limits after subscription expiry.

#### V3: Teams

Tasks:

- Add organizations and memberships.
- Add shared billing customer/subscription.
- Add roles and ownership transfer.
- Add team templates and team exports.

Acceptance:

- Existing individual users can join/create a team without losing boards.
- Team entitlements apply to team-owned boards only.
- Participants still do not need accounts.

## Architecture

```txt
apps/slots
  React/Vite frontend
  Calls API over HTTP

apps/slots-api
  Hono API
  Postgres access
  Email provider adapters
  Migration runner
  Railway/Docker runtime

packages/slotboard-core
  Slot generation
  Token generation/hash helpers
  ICS generation
  Pure domain logic only

Postgres
  slotboard.booking_events
  slotboard.time_slots
  slotboard.bookings
  slotboard.email_delivery_logs
  slotboard.email_webhook_events
  slotboard.rate_limit_events
  slotboard.idempotency_keys
  slotboard.auth_users
  slotboard.auth_sessions
  slotboard.auth_accounts
  slotboard.auth_verifications
```

Rules:

- `apps/slots-api` must not import from `apps/slots`.
- `apps/slots` must not import from `apps/slots-api`.
- Shared code goes into `packages/slotboard-core` only when it is pure and framework-free.
- Database objects stay under the `slotboard` schema.
- Environment variables use `SLOTBOARD_` unless Railway provides standard `DATABASE_URL`.

## Data Model

### `booking_events`

Purpose: one organizer-created booking board.

Important fields:

- `id`
- `title`
- `description`
- `organizer_name`
- `organizer_email`
- `timezone`
- `meeting_duration_minutes`
- `allow_multiple_bookings`
- `availability_config`
- `public_token_hash`
- `admin_token_hash`
- `status`: `active`, `archived`, `deleted`
- `archived_at`
- `deleted_at`
- `created_at`
- `updated_at`

Completion needs:

- Add `last_admin_activity_at` if retention depends on admin activity.
- Add `deleted_after_at` if delete grace periods are user-triggered.

### `time_slots`

Purpose: generated claimable time windows.

Important fields:

- `id`
- `event_id`
- `starts_at`
- `ends_at`
- `capacity`
- `status`: `open`, `closed`
- `close_after_booking`

Completion needs:

- Decide whether capacity greater than 1 is supported in the UI. Current app behaves like capacity 1.
- If capacity remains 1, simplify contracts and tests around that invariant.

### `bookings`

Purpose: participant claim records.

Important fields:

- `id`
- `event_id`
- `slot_id`
- `participant_name`
- `participant_email`
- `dedupe_email`
- `notes`
- `manage_token_hash`
- `booked_at`
- `cancelled_at`
- `cancelled_by`
- `cancelled_reason`
- `ics_sequence`

Completion needs:

- Add fields for scrubbed PII state if hard deletion is not immediate.
- Consider `participant_email_normalized` instead of relying only on `dedupe_email`.

### `email_delivery_logs`

Purpose: audit trail for outbound email attempts and provider webhooks.

Important fields:

- `id`
- `event_id`
- `booking_id`
- `email_type`
- `recipient_email`
- `provider`
- `provider_message_id`
- `status`: `queued`, `sent`, `bounced`, `failed`
- `error`

Completion needs:

- Add `payload_hash` or `idempotency_key` if provider retries can duplicate logs.
- Add `attempt_count` if implementing retry.

### `rate_limit_events`

Purpose: simple database-backed rate limiting.

Completion needs:

- Add scheduled cleanup for old rows.
- Consider Redis or Railway/Vercel edge rate limiting if traffic increases.

## Environment Variables

Required in production:

```txt
NODE_ENV=production
PORT=<platform port>
SLOTBOARD_TOKEN_PEPPER=<long random secret, at least 32 chars>
SLOTBOARD_AUTH_SECRET=<long random Better Auth secret, at least 32 chars>
SLOTBOARD_AUTH_BASE_URL=https://<api-domain>
SLOTBOARD_PUBLIC_APP_URL=https://<frontend-domain>
SLOTBOARD_WEB_ORIGINS=https://<frontend-domain>
SLOTBOARD_DB_POOL_MAX=10
SLOTBOARD_DB_CONNECTION_TIMEOUT_MS=5000
SLOTBOARD_DB_IDLE_TIMEOUT_MS=30000
SLOTBOARD_DB_QUERY_TIMEOUT_MS=10000
SLOTBOARD_DB_STATEMENT_TIMEOUT_MS=10000
SLOTBOARD_GRACEFUL_SHUTDOWN_MS=10000
```

Database:

```txt
SLOTBOARD_DATABASE_URL=<postgres url>
```

Fallback:

```txt
DATABASE_URL=<railway postgres url>
```

Email:

```txt
SLOTBOARD_EMAIL_PROVIDER=console|resend|postmark
SLOTBOARD_SENDER_EMAIL=bookings@example.com
SLOTBOARD_RESEND_API_KEY=<secret>
SLOTBOARD_POSTMARK_SERVER_TOKEN=<secret>
SLOTBOARD_EMAIL_WEBHOOK_SECRET=<secret>
```

Optional runtime tuning:

```txt
SLOTBOARD_RATE_LIMIT_ENABLED=true
SLOTBOARD_RETENTION_ENABLED=true
SLOTBOARD_RETENTION_ARCHIVE_AFTER_DAYS=30
SLOTBOARD_RETENTION_DELETE_ARCHIVED_AFTER_DAYS=365
SLOTBOARD_RETENTION_PII_SCRUB_AFTER_DAYS=30
SLOTBOARD_RETENTION_RATE_LIMIT_AFTER_DAYS=7
SLOTBOARD_RETENTION_IDEMPOTENCY_AFTER_DAYS=7
SLOTBOARD_LOG_LEVEL=info
```

## API Contracts

### Error Shape

All JSON errors should follow:

```json
{
  "error": "machine_code",
  "message": "Human readable message"
}
```

HTTP status rules:

- `400`: validation or malformed JSON
- `401`: missing or invalid token
- `404`: event, slot, or booking not found
- `409`: race conflict or invalid state transition
- `429`: rate limit
- `500`: unexpected error

Never include raw tokens in errors or logs.

### Create Event

Route:

```txt
POST /api/slotboard/events
```

Request:

```json
{
  "title": "Senior Engineer interview",
  "description": "Optional details.",
  "organizerName": "Jane Doe",
  "organizerEmail": "jane@example.com",
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
    "blockedRanges": []
  }
}
```

Response:

```json
{
  "event": {
    "id": "uuid",
    "title": "Senior Engineer interview",
    "description": "Optional details.",
    "organizerName": "Jane Doe",
    "organizerEmail": "jane@example.com",
    "timezone": "Africa/Johannesburg",
    "meetingDurationMinutes": 60,
    "allowMultipleBookings": false,
    "status": "active",
    "slotCount": 24,
    "createdAt": "2026-05-13T18:00:00.000Z"
  },
  "links": {
    "public": "https://app.example.com/b/<public-token>",
    "admin": "https://app.example.com/a/<admin-token>"
  }
}
```

Completion needs:

- Send event-created email after commit.
- Log email outcome.
- Add idempotency support using `Idempotency-Key`.

### Public Board Read

Preferred route:

```txt
GET /api/slotboard/book
Authorization: Bearer <public-token>
```

Browser-compatible route:

```txt
GET /api/slotboard/book/:publicToken
```

Response:

```json
{
  "event": {
    "id": "uuid",
    "title": "Senior Engineer interview",
    "description": "Optional details.",
    "organizerName": "Jane Doe",
    "organizerEmail": "jane@example.com",
    "timezone": "Africa/Johannesburg",
    "durationMinutes": 60,
    "allowMultipleBookings": false,
    "status": "active",
    "createdAt": "2026-05-13T18:00:00.000Z",
    "updatedAt": "2026-05-13T18:00:00.000Z"
  },
  "slots": [
    {
      "id": "uuid",
      "eventId": "uuid",
      "startsAt": "2026-05-18T07:00:00.000Z",
      "endsAt": "2026-05-18T08:00:00.000Z",
      "state": "open"
    }
  ]
}
```

Privacy rules:

- Never return participant names.
- Never return participant emails.
- Never return participant notes.
- Return only open slots for public view.

### Claim Slot

Preferred route:

```txt
POST /api/slotboard/book/claim
Authorization: Bearer <public-token>
```

Request:

```json
{
  "slotId": "uuid",
  "participantName": "Pat Smith",
  "participantEmail": "pat@example.com",
  "notes": "Optional notes"
}
```

Response:

```json
{
  "event": {},
  "slot": {
    "id": "uuid",
    "state": "just-claimed"
  },
  "booking": {
    "id": "uuid",
    "status": "active"
  },
  "links": {
    "manage": "https://app.example.com/m/<manage-token>"
  }
}
```

Transaction rules:

1. Resolve event by `public_token_hash`.
2. Lock event row if needed.
3. Lock selected slot row with `FOR UPDATE`.
4. Verify event status is `active`.
5. Verify slot status is `open`.
6. Count active bookings against slot capacity.
7. Enforce email dedupe when `allow_multiple_bookings = false`.
8. Insert booking with hashed manage token.
9. Commit.
10. Send participant confirmation and organizer notification after commit.

Conflict rules:

- Return `409 slot_unavailable` when the slot is taken.
- Return `409 duplicate_booking` when the participant email already has an active booking.

### Manage Booking

Preferred route:

```txt
GET /api/slotboard/manage
Authorization: Bearer <manage-token>
```

Response:

```json
{
  "event": {},
  "slot": {},
  "booking": {
    "id": "uuid",
    "participantName": "Pat Smith",
    "participantEmail": "pat@example.com",
    "status": "active"
  }
}
```

Privacy rules:

- Manage token returns exactly one booking.
- Manage token does not reveal other bookings on the same event.

### Participant Cancel

Route:

```txt
POST /api/slotboard/manage/cancel
Authorization: Bearer <manage-token>
```

Request:

```json
{
  "reason": "Optional participant reason"
}
```

Rules:

1. Lock booking and slot rows.
2. If already cancelled, return current cancelled state.
3. Mark booking cancelled by `participant`.
4. Increment `ics_sequence`.
5. Reopen slot unless `close_after_booking = true`.
6. Commit.
7. Send participant cancellation and organizer notification emails.

### Admin Dashboard

Preferred route:

```txt
GET /api/slotboard/admin
Authorization: Bearer <admin-token>
```

Response:

```json
{
  "event": {},
  "slots": [
    {
      "id": "uuid",
      "state": "booked",
      "bookedName": "Pat Smith",
      "bookedEmail": "pat@example.com",
      "bookedNotes": "Optional notes"
    }
  ]
}
```

Rules:

- Admin can see participant PII for that event.
- Admin route must never return raw admin/manage/public tokens.
- Admin activity should update `last_admin_activity_at` once that field is added.

### Admin Event Update

Route:

```txt
PATCH /api/slotboard/admin/event
Authorization: Bearer <admin-token>
```

Editable V1 fields:

- `title`
- `description`
- `organizerName`
- `organizerEmail`

Future fields:

- `timezone`, only while zero bookings exist.
- `status`, via explicit archive/delete routes rather than generic patch.

### Admin Slot Actions

Routes:

```txt
POST /api/slotboard/admin/slots/:slotId/close
POST /api/slotboard/admin/slots/:slotId/reopen
Authorization: Bearer <admin-token>
```

Rules:

- Closed slots do not appear in public view.
- Booked slots stay booked until cancelled.
- Reopening a booked slot should not expose it publicly while an active booking exists.

### Admin Cancel Booking

Route:

```txt
POST /api/slotboard/admin/bookings/:bookingId/cancel
Authorization: Bearer <admin-token>
```

Request:

```json
{
  "reason": "Optional organizer reason",
  "reopenSlot": true
}
```

Rules:

- Lock booking and slot.
- Mark cancelled by `organizer`.
- Increment `ics_sequence`.
- Reopen slot only when requested and allowed.
- Send cancellation emails after commit.

### CSV Export

Route:

```txt
GET /api/slotboard/admin/export.csv
Authorization: Bearer <admin-token>
```

Rules:

- Include event, slot, booking, and cancellation fields.
- Escape CSV values.
- Do not include raw tokens.

### Recovery

Route:

```txt
POST /api/slotboard/recover
```

Request:

```json
{
  "organizerEmail": "jane@example.com"
}
```

Response:

```json
{
  "ok": true
}
```

Rules:

- Always return generic success.
- Rate-limit by IP and normalized email.
- Do not reveal whether an event exists.
- Once email is implemented, rotate admin token inside a transaction and email the fresh admin link.
- Do not rotate admin tokens until fresh links can be delivered reliably.

### Email Provider Webhook

Route:

```txt
POST /api/slotboard/webhooks/email-provider
```

Provider needs:

- Resend webhook support.
- Postmark webhook support.
- Signature verification.
- Idempotent event processing.

Webhook rules:

- Verify provider signature before reading event as trusted.
- Resolve provider message id to `email_delivery_logs.provider_message_id`.
- Mark delivery logs as `sent`, `bounced`, or `failed`.
- Surface bounce state on admin slots where relevant.
- Never trust provider-supplied recipient data without matching local log records.

## Email Service Plan

### Module Shape

Create:

```txt
apps/slots-api/src/email/
  index.ts
  types.ts
  consoleProvider.ts
  resendProvider.ts
  postmarkProvider.ts
  templates.ts
```

Interfaces:

```ts
type EmailProvider = {
  send(message: OutboundEmail): Promise<EmailSendResult>;
};

type OutboundEmail = {
  type: EmailType;
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    contentType: string;
    content: string;
  }>;
  metadata: {
    eventId?: string;
    bookingId?: string;
  };
};
```

Email types:

- `event_created`
- `booking_confirmation`
- `organizer_booking_notification`
- `participant_cancelled`
- `organizer_cancelled`
- `admin_link_recovery`

### Delivery Rules

- Insert a queued `email_delivery_logs` row before provider send.
- Update to `sent` when provider accepts the message.
- Update to `failed` on provider error.
- Never roll back core booking/event work because email failed.
- Expose delivery failure only in admin surfaces.

### ICS Attachments

Use `packages/slotboard-core/src/ics.ts`.

Booking confirmation:

- `METHOD:REQUEST`
- `SEQUENCE:0`
- Organizer as organizer.
- Participant as attendee.

Cancellation:

- `METHOD:CANCEL`
- Increment `ics_sequence`.
- Same UID as original booking.

Acceptance criteria:

- Gmail, Apple Calendar, and Outlook recognize the attachment.
- Cancellation updates/removes the original calendar item.
- ICS snapshot tests cover both request and cancel methods.

## Retention Plan

### Archive Job

Goal: keep old boards from staying active forever.

Rules:

- Archive events when all slots are in the past and no admin activity occurred recently.
- Suggested threshold: 30 days after last slot ends.
- Archived public links should show archived state and no open slots.
- Archived admin links should remain readable.

### Delete and PII Cleanup

Rules:

- If organizer requests deletion, set `deleted_at` and `deleted_after_at`.
- During grace period, hide public/manage access.
- After grace period, scrub participant PII:
  - `participant_name`
  - `participant_email`
  - `notes`
  - `dedupe_email`
- Keep aggregate event/slot records if needed for operational audit.

### Job Runtime

Options:

- Railway cron service calling an internal endpoint.
- Separate one-off worker image using the same API Dockerfile.
- `npm run retention --workspace @fresh-feel/slots-api`.

Do not run long background loops inside the web API process.

## Security Plan

### Token Security

- Generate with cryptographically secure randomness.
- Store only SHA-256 hashes with `SLOTBOARD_TOKEN_PEPPER`.
- Enforce production pepper length.
- Never log raw tokens or full token links.
- Prefer bearer headers for API calls.
- Keep URL token routes for initial browser navigation only.

### Request Security

- Validate every JSON body.
- Normalize emails before storage and dedupe.
- Set `Referrer-Policy: no-referrer`.
- Set `X-Content-Type-Options: nosniff`.
- Set `Cache-Control: no-store` on API responses.
- Restrict CORS to `SLOTBOARD_WEB_ORIGINS`.

### Rate Limits

Current:

- Public reads by IP.
- Public claims by IP.
- Recovery by IP and email.

Add:

- Admin mutation limits by token hash.
- Manage cancel limits by token hash.
- Webhook ingestion limits by provider/IP.
- Cleanup job for old `rate_limit_events`.

### Abuse Cases

Must handle:

- Token brute force.
- Slot claim race. Covered by `npm run test:api`.
- Duplicate participant booking. Covered by smoke/API tests.
- Recovery enumeration.
- CSV injection.
- Webhook forgery.
- Stale frontend submitting already-booked slot.

CSV export should consider prefixing risky cells starting with `=`, `+`, `-`, or `@` if exports are opened in spreadsheet tools.

## Observability Plan

### Logs

Use structured logs:

```txt
event=slotboard_booking_claimed event_id=<uuid> booking_id=<uuid>
event=slotboard_email_failed event_id=<uuid> booking_id=<uuid> provider=<provider>
```

Rules:

- No raw tokens.
- No participant notes in logs.
- No full request bodies.

### Metrics

Track:

- Created events count.
- Claim success count.
- Claim conflict count.
- Email sent/failed/bounced counts.
- Recovery requests.
- Route latency.
- DB transaction errors.

### Health Checks

Current:

- `/healthz` only verifies API process.

Add:

- `/readyz` checks Postgres connectivity.
- Optional email provider readiness check should be shallow, not a real send.

## Deployment Plan

### Local Compose

Command:

```sh
docker compose up --build
```

Services:

- `postgres`
- `migrate`
- `api`
- `slots`

Rules:

- `migrate` must finish before API starts.
- API health must pass before frontend starts.

### Railway

Railway does not run this `docker-compose.yml` as-is. Map services separately:

- Railway Postgres service.
- API service from repo root using `railway.toml`.
- Frontend service from `apps/slots/Dockerfile` if hosting frontend on Railway.

API service:

- Builder: Dockerfile.
- Dockerfile path: `apps/slots-api/Dockerfile`.
- Pre-deploy: `npm run migrate:prod --workspace @fresh-feel/slots-api`.
- Health check: `/healthz`.
- Required variables:
  - `SLOTBOARD_TOKEN_PEPPER`
  - `SLOTBOARD_PUBLIC_APP_URL`
  - `SLOTBOARD_WEB_ORIGINS`
  - `DATABASE_URL` or `SLOTBOARD_DATABASE_URL`

Frontend service:

- Dockerfile path: `apps/slots/Dockerfile`.
- Must receive public API base URL once frontend HTTP integration is implemented.

## Testing Plan

### Unit Tests

Core:

- Slot generation.
- Timezone and DST edge cases.
- Token entropy format and hash behavior.
- ICS request/cancel snapshots.

API validation:

- Create-event validation.
- Availability validation.
- Claim payload validation.
- Admin patch validation.
- Recovery payload validation.

### Integration Tests

Use a real Postgres test database.

Scenarios:

- Migration applies cleanly.
- Create event writes event plus slots.
- Public board read returns open slots only.
- Public board read redacts booking PII.
- Claim slot creates booking and manage token.
- Duplicate claim returns `409`.
- Ten concurrent claims produce exactly one successful booking.
- Dedupe email returns `409` when multiple bookings are not allowed.
- Manage token reads only one booking.
- Participant cancel reopens slot.
- Admin cancel can reopen or keep closed.
- Admin dashboard includes booked details.
- CSV export escapes values.
- Recovery always returns generic response.
- Webhook rejects invalid signatures.

### End-to-End Smoke

Minimum smoke flow:

1. Run migration.
2. Start API.
3. `GET /healthz`.
4. Create event.
5. Read public board.
6. Claim first slot.
7. Read manage booking.
8. Read admin dashboard.
9. Export CSV.
10. Cancel booking.
11. Verify public slot is open again when allowed.

### Load and Race Tests

Focus only where risk exists:

- Simultaneous claims for one slot.
- Many public reads on one token.
- Recovery rate limits.
- CSV export on event with hundreds of bookings.

## Implementation Phases

### Phase 0: Stabilize Current Backend

Status: mostly complete.

Tasks:

- Keep typecheck and build green.
- Keep Compose stack green.
- Add automated smoke script for the current manual smoke flow.
- Add missing `/readyz`.
- Add old rate-limit row cleanup.

Acceptance:

- `npm run typecheck` passes.
- `npm run build` passes.
- `docker compose up --build` starts all services.
- Smoke script passes from a clean Postgres volume.

### Phase 1: Frontend API Integration

Tasks:

- Add frontend API client with configurable base URL.
- Wire create flow to `POST /api/slotboard/events`.
- Store returned public/admin links in done screen state.
- Wire public booking page to backend.
- Add claim modal and submit claim route.
- Wire manage page.
- Wire admin dashboard page.

Acceptance:

- Organizer can create a board from UI.
- Participant can book from public link.
- Participant receives manage link in response UI.
- Admin link shows booked participant details.
- No mock data is used for real token routes.

### Phase 2: Email and ICS

Tasks:

- Build provider abstraction.
- Implement console provider as dev baseline.
- Implement Resend provider.
- Implement Postmark provider if still required.
- Add email templates.
- Attach ICS request/cancel files.
- Add delivery log lifecycle.
- Call email service after create, claim, participant cancel, admin cancel.

Acceptance:

- Event-created email sends.
- Booking confirmation email sends with ICS.
- Organizer booking notification sends.
- Cancellation email sends with ICS cancel.
- Email failure does not roll back booking/event transactions.
- Delivery logs reflect queued/sent/failed states.

### Phase 3: Recovery

Tasks:

- Generate fresh admin token per matching active event.
- Store new token hash in transaction.
- Email fresh admin link.
- Log delivery.
- Keep generic response.
- Add tests for token rotation.

Acceptance:

- Recovery does not reveal whether email exists.
- Old admin token stops working after successful recovery rotation.
- New emailed admin token works.
- If email send fails, do not leave organizer locked out. Either do not rotate until provider acceptance, or store a staged token and activate after send.

Recommended implementation:

1. Generate candidate token.
2. Send email with candidate link.
3. If provider accepts, update token hash.
4. If provider fails, keep old token.

This avoids rotating to an undelivered link.

### Phase 4: Webhooks and Bounce State

Tasks:

- Add provider webhook signature verification. Done.
- Process delivered/bounced/failed events. Done.
- Update `email_delivery_logs`. Done.
- Surface bounced participant email state in admin dashboard. Done.
- Add idempotency for provider retries. Done with `slotboard.email_webhook_events`.

Acceptance:

- Invalid signatures return `401` or `403`.
- Duplicate webhook events do not duplicate state changes.
- Admin dashboard marks bounced participant emails.

### Phase 5: Retention and Deletion

Tasks:

- Add archive job. Done.
- Add admin archive/delete routes. Done for soft archive/delete.
- Add delete grace period fields. Deferred; current worker uses `deleted_at` as the grace-period anchor.
- Add PII scrub job. Done using `deleted_at` as the grace-period anchor.
- Add docs for data lifecycle. Done.

Acceptance:

- Expired events archive automatically.
- Deleted events stop public/admin/manage access.
- PII is scrubbed after grace period.
- Admin can export archived boards before deletion.

### Phase 6: Production Hardening

Tasks:

- Add `/readyz`. Done.
- Add structured logger. Done with JSON-line request/startup/shutdown/error logs, URL-token path redaction, and metadata-only console email logs.
- Add DB query timeout. Done with pool, connection, idle, query, and statement timeout envs.
- Add graceful shutdown. Done for API server and Postgres pools.
- Add CORS tests. Done in `npm run test:hardening`.
- Add CSV injection mitigation. Done by prefixing spreadsheet formula-leading CSV cells.
- Add idempotency for create-event and claim. Done with hashed idempotency guards that prevent duplicate writes without storing raw response links.
- Add backups and restore notes for Railway Postgres.

Acceptance:

- Clean deploy on Railway.
- Health and readiness checks pass.
- Logs contain useful operational data without PII leaks.
- Restore procedure is documented.

## Completion Definition

Backend can be considered complete for V1 when:

- Event creation, public booking, manage cancellation, and admin operations work from the real frontend.
- Email and ICS flows are live and tested.
- Recovery safely rotates admin links and delivers them.
- Email webhooks update delivery/bounce state.
- Retention and PII cleanup jobs are active.
- Automated integration tests cover concurrency, privacy, CORS, idempotency, CSV safety, and retention cleanup rules.
- Railway deployment is documented and repeatable.
- No raw tokens are stored or logged.
- A clean `docker compose up --build` can run the full app locally.

## Priority Order

1. Automated smoke/integration tests around current backend. Done for smoke, retention, concurrency, privacy, CORS, idempotency, and CSV safety.
2. Frontend API wiring.
3. Email provider plus ICS attachments.
4. Recovery token rotation.
5. Webhooks and bounce state.
6. Retention/PII cleanup.
7. Production observability and hardening.

The critical path is frontend API wiring plus email delivery. Recovery, webhooks, and retention are important, but they depend on the email service being reliable first.
