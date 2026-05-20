import { createHmac } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

const providedBaseURL = process.env.SLOTBOARD_API_URL;
let baseURL = providedBaseURL || "";
const databaseURL =
  process.env.SLOTBOARD_DATABASE_URL ||
  "postgres://slotboard:slotboard@localhost:5434/slotboard?sslmode=disable";
const webhookSecret = process.env.SLOTBOARD_STRIPE_WEBHOOK_SECRET || "whsec_slotboard_billing_test";
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const pool = new Pool({ connectionString: databaseURL, application_name: "slotboard-billing-entitlements-test" });

process.env.SLOTBOARD_DATABASE_URL ||= databaseURL;
process.env.SLOTBOARD_STRIPE_SECRET_KEY ||= "sk_test_slotboard_billing_test";
process.env.SLOTBOARD_STRIPE_WEBHOOK_SECRET ||= webhookSecret;

const { handleStripeWebhook } = await import("../apps/slots-api/src/billing.ts");
const {
  isActiveCustomDomainOrigin,
  readActiveCustomDomainBaseURL,
} = await import("../apps/slots-api/src/customDomains.ts");
const {
  FREE_ACTIVE_BOARD_LIMIT,
  readCreationEntitlement,
} = await import("../apps/slots-api/src/entitlements.ts");
const { closePool: closeApiPool } = await import("../apps/slots-api/src/db.ts");

let closeStartedApi;

try {
  await ensureBillingTestSchema();
  if (!providedBaseURL) {
    closeStartedApi = await startSourceApi();
  }
  await request("/healthz");
  await request("/readyz");

  assert(FREE_ACTIVE_BOARD_LIMIT === 1, `expected Free active board limit to be 1, got ${FREE_ACTIVE_BOARD_LIMIT}`);
  const freeLimitEmail = `free-active-limit+${suffix}@example.com`;
  const firstFreeBoard = await createBoard({
    title: `Billing Free Active Limit ${suffix}`,
    organizerEmail: freeLimitEmail,
    dayOffset: 42,
    days: 1,
  });
  await request("/api/slotboard/events", {
    method: "POST",
    expectedStatus: 402,
    expectedError: "active_board_limit_reached",
    json: {
      title: `Billing Free Active Limit Blocked ${suffix}`,
      description: "Automated billing entitlement active-board limit test.",
      organizerName: "Billing Test Organizer",
      organizerEmail: freeLimitEmail,
      timezone: "Africa/Johannesburg",
      allowMultipleBookings: false,
      availability: {
        startDate: isoDateAfterDays(43),
        endDate: isoDateAfterDays(43),
        weekdays: [new Date(`${isoDateAfterDays(43)}T00:00:00.000Z`).getUTCDay()],
        dailyStart: "09:00",
        dailyEnd: "10:00",
        durationMinutes: 60,
        timezone: "Africa/Johannesburg",
        blockedRanges: [],
      },
    },
  });
  const archivedFreeBoard = await request("/api/slotboard/admin/archive", {
    method: "POST",
    token: tokenFromLink(firstFreeBoard.links.admin),
  });
  assert(archivedFreeBoard.event.status === "archived", "expected archived free board to release active-board slot");
  await createBoard({
    title: `Billing Free Active Limit Replacement ${suffix}`,
    organizerEmail: freeLimitEmail,
    dayOffset: 44,
    days: 1,
  });

  const pendingBoard = await createBoard({
    title: `Billing Pending Event Pass ${suffix}`,
    organizerEmail: `pending-pass+${suffix}@example.com`,
    dayOffset: 45,
    days: 3,
  });
  const pendingPublicToken = tokenFromLink(pendingBoard.links.public);
  const pendingAdminToken = tokenFromLink(pendingBoard.links.admin);
  const pendingSessionId = `cs_test_pending_${suffix}`;
  await markEventPassPending(pendingBoard.event.id, pendingBoard.event.organizerEmail, pendingSessionId);

  const pendingPublic = await request("/api/slotboard/book", { token: pendingPublicToken });
  const pendingRow = await eventRow(pendingBoard.event.id);
  assert(pendingRow.plan_key === "free", `expected pending board to stay free, got ${pendingRow.plan_key}`);
  assert(pendingRow.payment_status === "pending", "expected pending payment status");
  assert(pendingPublic.slots.length === 0, `expected pending board to hide public slots, got ${pendingPublic.slots.length}`);
  const pendingAdmin = await request("/api/slotboard/admin", { token: pendingAdminToken });
  assert(pendingAdmin.slots.length === 48, `expected 48 stored slots, got ${pendingAdmin.slots.length}`);
  await request("/api/slotboard/book/claim", {
    method: "POST",
    token: pendingPublicToken,
    expectedStatus: 402,
    expectedError: "event_payment_pending",
    json: {
      slotId: pendingAdmin.slots[0].id,
      participantName: "Hidden Pending Slot",
      participantEmail: `hidden-pending+${suffix}@example.com`,
      notes: "Pending payment must not accept claims.",
    },
  });
  const pendingCsv = await requestText("/api/slotboard/admin/export.csv", { token: pendingAdminToken });
  assert(pendingCsv.includes("event_id,event_title"), "expected pending board admin CSV to remain available");

  const eventPassWebhook = stripeEvent({
    id: `evt_event_pass_${suffix}`,
    type: "checkout.session.completed",
    object: checkoutSession({
      id: pendingSessionId,
      eventId: pendingBoard.event.id,
      organizerEmail: pendingBoard.event.organizerEmail,
      paymentStatus: "paid",
    }),
  });
  const fulfilled = await deliverStripeWebhook(eventPassWebhook);
  assert(fulfilled.ok === true && fulfilled.duplicate !== true, "expected first Event Pass webhook to process");
  const duplicateFulfilled = await deliverStripeWebhook(eventPassWebhook);
  assert(duplicateFulfilled.duplicate === true, "expected duplicate Event Pass webhook to be idempotent");
  assert((await stripeWebhookEventCount(eventPassWebhook.id)) === 1, "expected one stored Stripe webhook event");
  assert((await eventPurchaseCount(pendingSessionId)) === 1, "expected one Event Pass purchase row");

  const paidRow = await eventRow(pendingBoard.event.id);
  assert(paidRow.plan_key === "event_pass", `expected Event Pass plan, got ${paidRow.plan_key}`);
  assert(paidRow.payment_status === "paid", "expected paid payment status");
  assert(paidRow.booking_limit === 75, `expected 75 bookings, got ${paidRow.booking_limit}`);
  assert(paidRow.slot_limit === 200, `expected 200 slots, got ${paidRow.slot_limit}`);
  const paidPublic = await request("/api/slotboard/book", { token: pendingPublicToken });
  assert(paidPublic.slots.length === 48, `expected paid board to publish all 48 slots, got ${paidPublic.slots.length}`);
  await requestText("/api/slotboard/admin/export.csv", { token: pendingAdminToken });

  const failedBoard = await createBoard({
    title: `Billing Failed Event Pass ${suffix}`,
    organizerEmail: `failed-pass+${suffix}@example.com`,
    dayOffset: 49,
    days: 1,
  });
  const failedSessionId = `cs_test_failed_${suffix}`;
  await markEventPassPending(failedBoard.event.id, failedBoard.event.organizerEmail, failedSessionId);
  await deliverStripeWebhook(stripeEvent({
    id: `evt_event_pass_failed_${suffix}`,
    type: "checkout.session.async_payment_failed",
    object: checkoutSession({
      id: failedSessionId,
      eventId: failedBoard.event.id,
      organizerEmail: failedBoard.event.organizerEmail,
      paymentStatus: "unpaid",
    }),
  }));
  const failedRow = await eventRow(failedBoard.event.id);
  assert(failedRow.plan_key === "free", `expected failed checkout to stay free, got ${failedRow.plan_key}`);
  assert(failedRow.payment_status === "failed", `expected failed payment status, got ${failedRow.payment_status}`);
  assert(failedRow.stripe_checkout_session_id === null, "expected failed checkout session id to be cleared");

  const ownerUserId = `billing-user-${suffix}`;
  const ownerEmail = `billing-owner+${suffix}@example.com`;
  const customDomainHostname = `book-${suffix}.example.com`;
  await createAuthUser(ownerUserId, ownerEmail);
  const companyOnly = await createBoard({
    title: `Billing Company Only ${suffix}`,
    organizerEmail: `company-only+${suffix}@example.com`,
    dayOffset: 52,
    days: 1,
  });
  const eventPassThenCompany = await createBoard({
    title: `Billing Event Pass Survives ${suffix}`,
    organizerEmail: `company-pass+${suffix}@example.com`,
    dayOffset: 53,
    days: 1,
  });
  const lateEventPassDuringCompany = await createBoard({
    title: `Billing Late Event Pass During Company ${suffix}`,
    organizerEmail: `company-late-pass+${suffix}@example.com`,
    dayOffset: 54,
    days: 1,
  });
  await setOwner(companyOnly.event.id, ownerUserId);
  await setOwner(eventPassThenCompany.event.id, ownerUserId);
  await setOwner(lateEventPassDuringCompany.event.id, ownerUserId);
  const lateEventPassSessionId = `cs_test_late_company_${suffix}`;
  await markEventPassPending(
    lateEventPassDuringCompany.event.id,
    lateEventPassDuringCompany.event.organizerEmail,
    lateEventPassSessionId,
  );
  await deliverStripeWebhook(stripeEvent({
    id: `evt_survival_pass_${suffix}`,
    type: "checkout.session.completed",
    object: checkoutSession({
      id: `cs_test_survival_${suffix}`,
      eventId: eventPassThenCompany.event.id,
      organizerEmail: eventPassThenCompany.event.organizerEmail,
      paymentStatus: "paid",
    }),
  }));

  const subscriptionId = `sub_test_${suffix}`;
  await deliverStripeWebhook(stripeEvent({
    id: `evt_subscription_active_${suffix}`,
    type: "customer.subscription.created",
    object: subscription({
      id: subscriptionId,
      ownerUserId,
      ownerEmail,
      status: "active",
      currentPeriodEnd: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    }),
  }));
  assert((await eventRow(companyOnly.event.id)).plan_key === "company_standby", "expected company board to upgrade");
  assert((await eventRow(eventPassThenCompany.event.id)).plan_key === "company_standby", "expected Event Pass board to inherit Company Standby while active");
  assert((await eventRow(lateEventPassDuringCompany.event.id)).plan_key === "company_standby", "expected pending Event Pass board to inherit Company Standby while active");
  assert((await readCreationEntitlement(ownerUserId)).planKey === "company_standby", "expected active subscription creation entitlement");
  await upsertActiveCustomDomain(ownerUserId, ownerEmail, customDomainHostname);
  assert(
    (await readActiveCustomDomainBaseURL({ ownerUserId, ownerEmail })) === `https://${customDomainHostname}`,
    "expected active Company subscription to enable custom-domain participant links",
  );
  const rotatedCompanyLink = await request("/api/slotboard/admin/public-link/rotate", {
    method: "POST",
    token: tokenFromLink(companyOnly.links.admin),
  });
  assert(
    rotatedCompanyLink.links.public.startsWith(`https://${customDomainHostname}/b/`),
    `expected rotated participant link to use owner custom domain, got ${rotatedCompanyLink.links.public}`,
  );
  assert(
    (await isActiveCustomDomainOrigin(`https://${customDomainHostname}`)) === true,
    "expected active Company subscription to enable custom-domain CORS",
  );

  await deliverStripeWebhook(stripeEvent({
    id: `evt_late_pass_during_company_${suffix}`,
    type: "checkout.session.completed",
    object: checkoutSession({
      id: lateEventPassSessionId,
      eventId: lateEventPassDuringCompany.event.id,
      organizerEmail: lateEventPassDuringCompany.event.organizerEmail,
      paymentStatus: "paid",
    }),
  }));
  const latePaidDuringCompany = await eventRow(lateEventPassDuringCompany.event.id);
  assert(latePaidDuringCompany.plan_key === "company_standby", `expected late Event Pass webhook to preserve Company Standby, got ${latePaidDuringCompany.plan_key}`);
  assert(latePaidDuringCompany.booking_limit === 100000, "expected late Event Pass webhook to keep Company Standby booking limit");
  assert(latePaidDuringCompany.slot_limit === 100000, "expected late Event Pass webhook to keep Company Standby slot limit");

  await deliverStripeWebhook(stripeEvent({
    id: `evt_subscription_deleted_${suffix}`,
    type: "customer.subscription.deleted",
    object: subscription({
      id: subscriptionId,
      ownerUserId,
      ownerEmail,
      status: "canceled",
      currentPeriodEnd: Math.floor(Date.now() / 1000) - 60,
      cancelAtPeriodEnd: true,
    }),
  }));
  const downgradedCompanyOnly = await eventRow(companyOnly.event.id);
  assert(downgradedCompanyOnly.plan_key === "free", `expected company-only board to downgrade to free, got ${downgradedCompanyOnly.plan_key}`);
  assert(downgradedCompanyOnly.booking_limit === 15, "expected company-only booking limit to return to free");
  assert(downgradedCompanyOnly.slot_limit === 30, "expected company-only slot limit to return to free");
  const restoredPass = await eventRow(eventPassThenCompany.event.id);
  assert(restoredPass.plan_key === "event_pass", `expected paid pass board to restore Event Pass, got ${restoredPass.plan_key}`);
  assert(restoredPass.booking_limit === 75, "expected restored Event Pass booking limit");
  assert(restoredPass.slot_limit === 200, "expected restored Event Pass slot limit");
  const restoredLatePass = await eventRow(lateEventPassDuringCompany.event.id);
  assert(restoredLatePass.plan_key === "event_pass", `expected late paid pass board to restore Event Pass, got ${restoredLatePass.plan_key}`);
  assert(restoredLatePass.booking_limit === 75, "expected restored late Event Pass booking limit");
  assert(restoredLatePass.slot_limit === 200, "expected restored late Event Pass slot limit");
  assert((await readCreationEntitlement(ownerUserId)).planKey === "free", "expected canceled subscription creation entitlement to downgrade");
  assert(
    (await readActiveCustomDomainBaseURL({ ownerUserId, ownerEmail })) === undefined,
    "expected lapsed Company subscription to disable custom-domain participant links",
  );
  assert(
    (await isActiveCustomDomainOrigin(`https://${customDomainHostname}`)) === false,
    "expected lapsed Company subscription to disable custom-domain CORS",
  );

  console.log(JSON.stringify({
    ok: true,
    baseURL,
    checked: [
      "event-pass-pending-stays-free",
      "free-active-board-limit-enforced",
      "archived-free-board-allows-replacement-board",
      "pending-public-slots-hidden",
      "pending-csv-export-available",
      "pending-claim-blocked",
      "event-pass-webhook-fulfills-paid-limits",
      "stripe-webhook-duplicate-idempotent",
      "event-pass-failure-resets-free",
      "company-standby-subscription-upgrades-owner-events",
      "company-standby-subscription-enables-custom-domain",
      "custom-domain-links-use-owner-user-id",
      "late-event-pass-webhook-preserves-company-standby",
      "subscription-delete-downgrades-company-only-events",
      "subscription-delete-restores-paid-event-pass-events",
      "subscription-delete-disables-custom-domain",
    ],
  }, null, 2));
} finally {
  if (closeStartedApi) {
    await closeStartedApi();
  }
  await pool.end();
  await closeApiPool();
}

async function ensureBillingTestSchema() {
  await pool.query(`
    create table if not exists slotboard.stripe_webhook_events (
      id uuid primary key default gen_random_uuid(),
      provider_event_id text not null unique,
      event_type text not null,
      processed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
}

async function startSourceApi() {
  const { serve } = await import("@hono/node-server");
  const { app } = await import("../apps/slots-api/src/app.ts");

  let server;
  await new Promise((resolve) => {
    server = serve(
      {
        fetch: app.fetch,
        hostname: "127.0.0.1",
        port: 0,
      },
      (info) => {
        baseURL = `http://127.0.0.1:${info.port}`;
        resolve();
      },
    );
  });

  return () =>
    new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
}

async function createBoard({ title, organizerEmail, dayOffset, days }) {
  const startDate = isoDateAfterDays(dayOffset);
  const endDate = isoDateAfterDays(dayOffset + days - 1);
  return request("/api/slotboard/events", {
    method: "POST",
    expectedStatus: 201,
    json: {
      title,
      description: "Automated billing entitlement test.",
      organizerName: "Billing Test Organizer",
      organizerEmail,
      timezone: "Africa/Johannesburg",
      allowMultipleBookings: false,
      availability: {
        startDate,
        endDate,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        dailyStart: "09:00",
        dailyEnd: "17:00",
        durationMinutes: 30,
        timezone: "Africa/Johannesburg",
        blockedRanges: [],
      },
    },
  });
}

async function markEventPassPending(eventId, ownerEmail, checkoutSessionId) {
  await pool.query(
    `
      update slotboard.booking_events
      set payment_status = 'pending',
          stripe_checkout_session_id = $2
      where id = $1
    `,
    [eventId, checkoutSessionId],
  );
  await pool.query(
    `
      insert into slotboard.event_purchases (
        event_id,
        owner_email,
        provider_checkout_session_id,
        product_key,
        amount,
        currency,
        status
      )
      values ($1, $2, $3, 'event_pass', 1900, 'usd', 'pending')
      on conflict (provider_checkout_session_id) do update
      set status = 'pending'
    `,
    [eventId, ownerEmail, checkoutSessionId],
  );
}

async function createAuthUser(ownerUserId, ownerEmail) {
  await pool.query(
    `
      insert into slotboard.auth_users (
        id,
        name,
        email,
        email_verified
      )
      values ($1, 'Billing Owner', $2, true)
      on conflict (id) do update
      set email = excluded.email
    `,
    [ownerUserId, ownerEmail],
  );
}

async function setOwner(eventId, ownerUserId) {
  await pool.query(
    `
      update slotboard.booking_events
      set owner_user_id = $2
      where id = $1
    `,
    [eventId, ownerUserId],
  );
}

async function upsertActiveCustomDomain(ownerUserId, ownerEmail, hostname) {
  await pool.query(
    `
      insert into slotboard.custom_domains (
        owner_email,
        owner_user_id,
        hostname,
        status,
        verification_token,
        txt_record_name,
        txt_record_value,
        cname_target,
        verified_at,
        activated_at
      )
      values (
        $1,
        $2,
        $3,
        'active',
        'test-token',
        $4,
        'mytimes-domain-verification=test-token',
        'slots-production-12d4.up.railway.app',
        now(),
        now()
      )
      on conflict (owner_user_id) where owner_user_id is not null do update
      set owner_email = excluded.owner_email,
          hostname = excluded.hostname,
          status = excluded.status,
          verification_token = excluded.verification_token,
          txt_record_name = excluded.txt_record_name,
          txt_record_value = excluded.txt_record_value,
          cname_target = excluded.cname_target,
          verified_at = excluded.verified_at,
          activated_at = excluded.activated_at
    `,
    [ownerEmail, ownerUserId, hostname, `_mytimes.${hostname}`],
  );
}

async function eventRow(eventId) {
  const result = await pool.query(
    `
      select
        plan_key,
        payment_status,
        booking_limit,
        slot_limit,
        stripe_checkout_session_id
      from slotboard.booking_events
      where id = $1
    `,
    [eventId],
  );
  return result.rows[0];
}

async function eventPurchaseCount(checkoutSessionId) {
  const result = await pool.query(
    `
      select count(*)::int as count
      from slotboard.event_purchases
      where provider_checkout_session_id = $1
    `,
    [checkoutSessionId],
  );
  return result.rows[0]?.count ?? 0;
}

async function stripeWebhookEventCount(eventId) {
  const result = await pool.query(
    `
      select count(*)::int as count
      from slotboard.stripe_webhook_events
      where provider_event_id = $1
        and processed_at is not null
    `,
    [eventId],
  );
  return result.rows[0]?.count ?? 0;
}

function stripeEvent({ id, type, object }) {
  return {
    id,
    object: "event",
    api_version: "2026-02-25.clover",
    created: Math.floor(Date.now() / 1000),
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
  };
}

function checkoutSession({ id, eventId, organizerEmail, paymentStatus }) {
  return {
    id,
    object: "checkout.session",
    amount_total: 1900,
    currency: "usd",
    customer: `cus_${id.replace(/[^a-zA-Z0-9]/g, "").slice(-12)}`,
    customer_details: { email: organizerEmail },
    metadata: {
      productKey: "event_pass",
      eventId,
      organizerEmail,
    },
    mode: "payment",
    payment_intent: `pi_${id.replace(/[^a-zA-Z0-9]/g, "").slice(-12)}`,
    payment_status: paymentStatus,
  };
}

function subscription({ id, ownerUserId, ownerEmail, status, currentPeriodEnd, cancelAtPeriodEnd = false }) {
  return {
    id,
    object: "subscription",
    cancel_at_period_end: cancelAtPeriodEnd,
    customer: `cus_${ownerUserId.replace(/[^a-zA-Z0-9]/g, "").slice(-12)}`,
    current_period_start: Math.floor(Date.now() / 1000) - 60,
    current_period_end: currentPeriodEnd,
    metadata: {
      productKey: "company_standby",
      ownerUserId,
      ownerEmail,
    },
    status,
  };
}

async function deliverStripeWebhook(event) {
  const rawBody = JSON.stringify(event);
  return handleStripeWebhook({
    rawBody,
    signature: stripeSignature(rawBody),
  });
}

function stripeSignature(rawBody) {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = `${timestamp}.${rawBody}`;
  const digest = createHmac("sha256", webhookSecret).update(payload, "utf8").digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

async function request(path, options = {}) {
  const response = await requestRaw(path, options);
  const expectedStatus = options.expectedStatus || 200;
  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}, expected ${expectedStatus}: ${response.text}`);
  }
  if (options.expectedError) {
    assert(response.json?.error === options.expectedError, `expected error ${options.expectedError}, got ${response.text}`);
  }
  return response.json;
}

async function requestText(path, options = {}) {
  const response = await fetch(`${baseURL}${path}`, {
    method: options.method || "GET",
    headers: headers(options),
    body: options.json === undefined ? undefined : JSON.stringify(options.json),
  });
  const text = await response.text();
  const expectedStatus = options.expectedStatus || 200;
  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}, expected ${expectedStatus}: ${text}`);
  }
  if (options.expectedError) {
    const json = parseJson(text, path);
    assert(json?.error === options.expectedError, `expected error ${options.expectedError}, got ${text}`);
  }
  return text;
}

async function requestRaw(path, options = {}) {
  const response = await fetch(`${baseURL}${path}`, {
    method: options.method || "GET",
    headers: headers(options),
    body: options.json === undefined ? undefined : JSON.stringify(options.json),
  });
  const text = await response.text();
  return {
    status: response.status,
    text,
    json: text ? parseJson(text, path) : undefined,
  };
}

function headers(options) {
  const result = {
    "x-forwarded-for": process.env.SMOKE_ACTOR_KEY || options.actorKey || `billing-${suffix}`,
    "x-slotboard-smoke-actor": process.env.SMOKE_ACTOR_KEY || options.actorKey || `billing-${suffix}`,
  };
  if (options.json !== undefined) {
    result["content-type"] = "application/json";
  }
  if (options.token) {
    result.authorization = `Bearer ${options.token}`;
  }
  return result;
}

function parseJson(text, path) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${path} returned non-JSON response: ${text}`);
  }
}

function tokenFromLink(link) {
  const token = new URL(link).pathname.split("/").filter(Boolean).at(-1);
  assert(token, `expected token in link ${link}`);
  return token;
}

function isoDateAfterDays(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
