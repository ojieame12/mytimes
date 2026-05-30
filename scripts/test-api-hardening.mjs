import { createHash, randomBytes } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

const providedBaseURL = process.env.SLOTBOARD_API_URL;
let baseURL = providedBaseURL || "";
const databaseURL =
  process.env.SLOTBOARD_DATABASE_URL ||
  "postgres://slotboard:slotboard@localhost:5434/slotboard?sslmode=disable";
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const tokenPepper = process.env.SLOTBOARD_TOKEN_PEPPER || "dev-token-pepper-replace-before-production";
const emailWebhookSecret =
  process.env.SLOTBOARD_EMAIL_WEBHOOK_SECRET || "local-source-webhook-secret-change-me-32chars";
const xffActorIp = `2001:db8:${randomBytes(2).toString("hex")}::77`;
const pool = new Pool({ connectionString: databaseURL, application_name: "slotboard-hardening-test" });

process.env.SLOTBOARD_DATABASE_URL ||= databaseURL;
process.env.SLOTBOARD_TOKEN_PEPPER ||= tokenPepper;
process.env.SLOTBOARD_EMAIL_WEBHOOK_SECRET ||= emailWebhookSecret;
const { closePool: closeApiPool } = await import("../apps/slots-api/src/db.ts");

let closeStartedApi;

try {
  if (!providedBaseURL) {
    closeStartedApi = await startSourceApi();
  }
  await request("/healthz");
  await request("/readyz");
  await assertCors();
  await assertSecurityHeaders();
  await assertBodyLimit();
  await assertQuerySecretRejected();
  await assertForwardedHeaderSpoofResistance();
  const contactEmail = `contact-hardening+${suffix}@example.com`;
  const contactResponse = await request("/api/slotboard/contact", {
    method: "POST",
    actorKey: `hardening-contact-${suffix}`,
    expectedStatus: 202,
    json: {
      intent: "enterprise",
      name: "Contact Hardening",
      email: contactEmail,
      company: "Hardening Co",
      role: "Recruiting Ops",
      teamSize: "51-200",
      message: "We want Slack, Teams, and SSO for booking boards.",
      sourcePath: "/contact?intent=enterprise",
      integrationInterest: ["slack", "teams", "sso"],
      website: "",
    },
  });
  assert(contactResponse.lead?.status === "received", "expected contact lead to be received");
  assert((await contactLeadCount(contactEmail)) === 1, "expected contact lead to persist once");

  const idempotentTitle = `Idempotency Create ${suffix}`;
  const idempotencyKey = `create-${suffix}`;
  const createBody = boardBody({
    title: idempotentTitle,
    organizerEmail: `idem-create+${suffix}@example.com`,
    dayOffset: 31,
  });
  await request("/api/slotboard/events", {
    method: "POST",
    idempotencyKey,
    actorKey: `hardening-create-${suffix}`,
    expectedStatus: 201,
    json: createBody,
  });
  await request("/api/slotboard/events", {
    method: "POST",
    idempotencyKey,
    actorKey: `hardening-create-${suffix}`,
    expectedStatus: 409,
    expectedError: "idempotency_request_replayed",
    json: createBody,
  });
  await request("/api/slotboard/events", {
    method: "POST",
    idempotencyKey,
    actorKey: `hardening-create-${suffix}`,
    expectedStatus: 409,
    expectedError: "idempotency_key_reused",
    json: {
      ...createBody,
      title: `${idempotentTitle} Different`,
    },
  });
  await request("/api/slotboard/events", {
    method: "POST",
    idempotencyKey: "short",
    actorKey: `hardening-invalid-idem-${suffix}`,
    expectedStatus: 400,
    expectedError: "invalid_idempotency_key",
    json: boardBody({
      title: `Invalid Idempotency ${suffix}`,
      organizerEmail: `invalid-idem+${suffix}@example.com`,
      dayOffset: 31,
    }),
  });
  assert((await eventCountByTitle(idempotentTitle)) === 1, "expected idempotent create to write one event");

  const publishedLimitTitle = `Published Slot Limit ${suffix}`;
  const publishedLimitBoard = await request("/api/slotboard/events", {
    method: "POST",
    actorKey: `hardening-slot-limit-${suffix}`,
    expectedStatus: 201,
    json: multiDayBoardBody({
      title: publishedLimitTitle,
      organizerEmail: `slot-limit+${suffix}@example.com`,
      dayOffset: 34,
      days: 5,
    }),
  });
  assert(publishedLimitBoard.event.slotCount === 80, `expected 80 stored slots, got ${publishedLimitBoard.event.slotCount}`);
  assert(publishedLimitBoard.event.slotLimit === 30, `expected free slot limit 30, got ${publishedLimitBoard.event.slotLimit}`);
  const publishedLimitPublicToken = tokenFromLink(publishedLimitBoard.links.public);
  const publishedLimitAdminToken = tokenFromLink(publishedLimitBoard.links.admin);
  const publishedLimitPublic = await request("/api/slotboard/book", {
    token: publishedLimitPublicToken,
  });
  assert(
    publishedLimitPublic.slots.length === 30,
    `expected free public board to publish 30 slots, got ${publishedLimitPublic.slots.length}`,
  );
  const publishedLimitAdmin = await request("/api/slotboard/admin", {
    token: publishedLimitAdminToken,
  });
  assert(
    publishedLimitAdmin.slots.length === 80,
    `expected admin dashboard to retain all 80 generated slots, got ${publishedLimitAdmin.slots.length}`,
  );
  const hiddenSlot = publishedLimitAdmin.slots[30];
  assert(hiddenSlot?.id, "expected an unpublished slot after the first 30");
  await request("/api/slotboard/book/claim", {
    method: "POST",
    token: publishedLimitPublicToken,
    expectedStatus: 402,
    expectedError: "slot_limit_reached",
    json: {
      slotId: hiddenSlot.id,
      participantName: "Unpublished Slot Participant",
      participantEmail: `unpublished-slot+${suffix}@example.com`,
      notes: "This claim should not pass the published free slot limit.",
    },
  });

  await request("/api/slotboard/my-boards/request", {
    method: "POST",
    actorKey: `hardening-my-boards-request-${suffix}`,
    expectedStatus: 202,
    json: {
      organizerEmail: `slot-limit+${suffix}@example.com`,
    },
  });
  const myBoardsToken = await issueMyBoardsToken(`slot-limit+${suffix}@example.com`);
  const myBoards = await request("/api/slotboard/my-boards", {
    token: myBoardsToken,
  });
  assert(myBoards.ownerEmail === `slot-limit+${suffix}@example.com`, "expected my boards response for requested email");
  assert(
    myBoards.boards.some((board) => board.id === publishedLimitBoard.event.id && board.slotCount === 30),
    "expected my boards list to include the free board with its published slot count",
  );
  assert(!JSON.stringify(myBoards).includes("/a/"), "expected my boards list not to expose raw admin links");
  const myBoardsAdmin = await request(`/api/slotboard/my-boards/${publishedLimitBoard.event.id}/admin-link`, {
    method: "POST",
    token: myBoardsToken,
    expectedStatus: 201,
  });
  const myBoardsAdminToken = tokenFromLink(myBoardsAdmin.url);
  const myBoardsAdminDashboard = await request("/api/slotboard/admin", {
    token: myBoardsAdminToken,
  });
  assert(
    myBoardsAdminDashboard.event.id === publishedLimitBoard.event.id,
    "expected my boards admin link to open the selected board",
  );

  const oversizedTitle = `Oversized Slot Limit ${suffix}`;
  await request("/api/slotboard/events", {
    method: "POST",
    actorKey: `hardening-oversized-slot-limit-${suffix}`,
    expectedStatus: 402,
    expectedError: "slot_limit_reached",
    json: multiDayBoardBody({
      title: oversizedTitle,
      organizerEmail: `oversized-slot-limit+${suffix}@example.com`,
      dayOffset: 38,
      days: 14,
    }),
  });
  assert((await eventCountByTitle(oversizedTitle)) === 0, "expected oversized board rejection to write no event");

  const claimFixture = await request("/api/slotboard/events", {
    method: "POST",
    expectedStatus: 201,
    json: boardBody({
      title: `Idempotency Claim ${suffix}`,
      organizerEmail: `idem-claim+${suffix}@example.com`,
      dayOffset: 32,
    }),
  });
  const publicToken = tokenFromLink(claimFixture.links.public);
  const publicBoard = await request("/api/slotboard/book", {
    token: publicToken,
  });
  const claimKey = `claim-${suffix}`;
  const claimBody = {
    slotId: publicBoard.slots[0].id,
    participantName: "Idempotent Participant",
    participantEmail: `idem-participant+${suffix}@example.com`,
    notes: "First claim should win.",
  };
  await request("/api/slotboard/book/claim", {
    method: "POST",
    token: publicToken,
    idempotencyKey: claimKey,
    expectedStatus: 201,
    json: claimBody,
  });
  await request("/api/slotboard/book/claim", {
    method: "POST",
    token: publicToken,
    idempotencyKey: claimKey,
    expectedStatus: 409,
    expectedError: "idempotency_request_replayed",
    json: claimBody,
  });
  await request("/api/slotboard/book/claim", {
    method: "POST",
    token: publicToken,
    idempotencyKey: claimKey,
    expectedStatus: 409,
    expectedError: "idempotency_key_reused",
    json: {
      ...claimBody,
      participantEmail: `idem-participant-other+${suffix}@example.com`,
    },
  });
  assert((await activeBookingCount(publicBoard.slots[0].id)) === 1, "expected idempotent claim to write one active booking");

  const suppressionFixture = await request("/api/slotboard/events", {
    method: "POST",
    expectedStatus: 201,
    json: boardBody({
      title: `Suppressed Source Email Claim ${suffix}`,
      organizerEmail: `suppressed-source+${suffix}@example.com`,
      dayOffset: 33,
    }),
  });
  const suppressionPublicToken = tokenFromLink(suppressionFixture.links.public);
  const suppressionAdminToken = tokenFromLink(suppressionFixture.links.admin);
  const suppressionPublicBoard = await request("/api/slotboard/book", {
    token: suppressionPublicToken,
  });
  const suppressionBody = {
    slotId: suppressionPublicBoard.slots[0].id,
    participantName: "Suppressed Source Email",
    participantEmail: `suppressed-source-participant+${suffix}@example.com`,
    notes: "Caboo owns the notifications for this booking.",
    suppressSourceEmails: true,
  };
  await request("/api/slotboard/book/claim", {
    method: "POST",
    token: suppressionPublicToken,
    expectedStatus: 403,
    expectedError: "invalid_admin_token_for_email_suppression",
    json: suppressionBody,
  });
  assert(
    (await activeBookingCount(suppressionPublicBoard.slots[0].id)) === 0,
    "expected unauthenticated email suppression to write no booking",
  );
  const suppressedClaim = await request("/api/slotboard/book/claim", {
    method: "POST",
    token: suppressionPublicToken,
    expectedStatus: 201,
    headers: { "x-mytimes-admin-token": suppressionAdminToken },
    json: suppressionBody,
  });
  assert(suppressedClaim.sourceEmailsSuppressed === true, "expected claim to mark source emails suppressed");
  assert(
    suppressedClaim.email.participantConfirmation.status === "suppressed" &&
      suppressedClaim.email.organizerNotice.status === "suppressed",
    "expected source email delivery records to be suppressed",
  );
  assert(
    (await emailLogCountForBooking(suppressedClaim.booking.id)) === 0,
    "expected suppressed source emails to create no source email logs",
  );

  const rescheduleFixtureBody = boardBody({
    title: `Idempotency Reschedule ${suffix}`,
    organizerEmail: `idem-reschedule+${suffix}@example.com`,
    dayOffset: 35,
  });
  const rescheduleFixture = await request("/api/slotboard/events", {
    method: "POST",
    expectedStatus: 201,
    json: {
      ...rescheduleFixtureBody,
      availability: {
        ...rescheduleFixtureBody.availability,
        dailyEnd: "12:00",
      },
    },
  });
  const reschedulePublicToken = tokenFromLink(rescheduleFixture.links.public);
  const rescheduleAdminToken = tokenFromLink(rescheduleFixture.links.admin);
  const reschedulePublicBoard = await request("/api/slotboard/book", {
    token: reschedulePublicToken,
  });
  assert(reschedulePublicBoard.slots.length === 3, `expected three reschedule slots, got ${reschedulePublicBoard.slots.length}`);
  const rescheduleClaim = await request("/api/slotboard/book/claim", {
    method: "POST",
    token: reschedulePublicToken,
    expectedStatus: 201,
    json: {
      slotId: reschedulePublicBoard.slots[0].id,
      participantName: "Idempotent Rescheduler",
      participantEmail: `idem-rescheduler+${suffix}@example.com`,
      notes: "Original reschedule notes.",
    },
  });
  const rescheduleManageToken = tokenFromLink(rescheduleClaim.links.manage);
  await request("/api/slotboard/manage/reschedule", {
    token: reschedulePublicToken,
    expectedStatus: 404,
    expectedError: "booking_not_found",
  });
  await request("/api/slotboard/manage/reschedule", {
    method: "POST",
    token: rescheduleAdminToken,
    expectedStatus: 404,
    expectedError: "booking_not_found",
    json: {
      slotId: reschedulePublicBoard.slots[1].id,
    },
  });
  const rescheduleOptions = await request("/api/slotboard/manage/reschedule", {
    token: rescheduleManageToken,
  });
  assert(rescheduleOptions.slots.length === 2, `expected two replacement slots, got ${rescheduleOptions.slots.length}`);
  assert(!JSON.stringify(rescheduleOptions).includes(reschedulePublicToken), "expected reschedule options not to leak public token");
  assert(!JSON.stringify(rescheduleOptions).includes(rescheduleAdminToken), "expected reschedule options not to leak admin token");
  await request("/api/slotboard/manage/reschedule", {
    method: "POST",
    token: rescheduleManageToken,
    expectedStatus: 409,
    expectedError: "same_slot",
    json: {
      slotId: reschedulePublicBoard.slots[0].id,
    },
  });
  const rescheduleKey = `reschedule-${suffix}`;
  const rescheduleBody = {
    slotId: rescheduleOptions.slots[0].id,
    participantTimezone: "Africa/Johannesburg",
    participantLocale: "en-ZA",
    participantOffsetAtBooking: "+02:00",
    notes: "Moved once with an idempotency key.",
  };
  const rescheduled = await request("/api/slotboard/manage/reschedule", {
    method: "POST",
    token: rescheduleManageToken,
    idempotencyKey: rescheduleKey,
    expectedStatus: 200,
    json: rescheduleBody,
  });
  assert(rescheduled.booking.id === rescheduleClaim.booking.id, "expected reschedule to keep booking id stable");
  assert(rescheduled.booking.icsSequence > rescheduleClaim.booking.icsSequence, "expected reschedule to increment calendar sequence");
  assert((await activeBookingCount(reschedulePublicBoard.slots[0].id)) === 0, "expected original slot to have no active booking after reschedule");
  assert((await activeBookingCount(rescheduleOptions.slots[0].id)) === 1, "expected replacement slot to have one active booking after reschedule");
  await request("/api/slotboard/manage/reschedule", {
    method: "POST",
    token: rescheduleManageToken,
    idempotencyKey: rescheduleKey,
    expectedStatus: 409,
    expectedError: "idempotency_request_replayed",
    json: rescheduleBody,
  });
  await request("/api/slotboard/manage/reschedule", {
    method: "POST",
    token: rescheduleManageToken,
    idempotencyKey: rescheduleKey,
    expectedStatus: 409,
    expectedError: "idempotency_key_reused",
    json: {
      ...rescheduleBody,
      slotId: rescheduleOptions.slots[1].id,
    },
  });
  await request("/api/slotboard/manage/cancel", {
    method: "POST",
    token: rescheduleManageToken,
    expectedStatus: 200,
    json: {
      reason: "Cancel after reschedule hardening check.",
    },
  });
  const cancelledRescheduleOptions = await request("/api/slotboard/manage/reschedule", {
    token: rescheduleManageToken,
  });
  assert(cancelledRescheduleOptions.slots.length === 0, "expected cancelled booking to expose no reschedule options");
  await request("/api/slotboard/manage/reschedule", {
    method: "POST",
    token: rescheduleManageToken,
    expectedStatus: 409,
    expectedError: "booking_cancelled",
    json: {
      slotId: rescheduleOptions.slots[1].id,
    },
  });

  const csvFixture = await request("/api/slotboard/events", {
    method: "POST",
    expectedStatus: 201,
    json: boardBody({
      title: `=CSV Injection ${suffix}`,
      organizerEmail: `csv+${suffix}@example.com`,
      dayOffset: 33,
    }),
  });
  const csvPublicToken = tokenFromLink(csvFixture.links.public);
  const csvAdminToken = tokenFromLink(csvFixture.links.admin);
  const csvBoard = await request("/api/slotboard/book", {
    token: csvPublicToken,
  });
  await request("/api/slotboard/book/claim", {
    method: "POST",
    token: csvPublicToken,
    expectedStatus: 201,
    json: {
      slotId: csvBoard.slots[0].id,
      participantName: '=HYPERLINK("https://evil.example")',
      participantEmail: `csv-participant+${suffix}@example.com`,
      notes: "+SUM(1,1)",
    },
  });
  await markEventPassPaid(csvFixture.event.id);
  const csv = await requestText("/api/slotboard/admin/export.csv", {
    token: csvAdminToken,
  });
  const rows = parseCsvRows(csv);
  const dataRow = rows[1];
  assert(dataRow?.[1] === `'=CSV Injection ${suffix}`, "expected formula-leading event title to be prefixed");
  assert(
    dataRow?.[9] === `'=HYPERLINK("https://evil.example")`,
    "expected formula-leading participant name to be prefixed",
  );
  assert(dataRow?.[14] === "'+SUM(1,1)", "expected formula-leading notes to be prefixed");
  const allCells = rows.flat();
  assert(!allCells.includes(`=CSV Injection ${suffix}`), "expected unsafe event title not to appear as a raw CSV cell");
  assert(
    !allCells.includes('=HYPERLINK("https://evil.example")'),
    "expected unsafe participant name not to appear as a raw CSV cell",
  );
  assert(!allCells.includes("+SUM(1,1)"), "expected unsafe notes not to appear as a raw CSV cell");

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseURL,
        checked: [
          "cors-allowed-origin",
          "cors-disallowed-origin",
          "api-security-headers",
          "oversized-body-rejection",
          "query-secret-rejection",
          "forwarded-header-spoof-resistance",
          "contact-lead-persistence",
          "idempotent-create-single-write",
          "idempotent-create-replay-conflict",
          "idempotent-create-body-reuse-conflict",
          "invalid-idempotency-key-rejection",
          "free-board-publishes-only-free-slot-limit",
          "unpublished-slot-claim-rejection",
          "my-boards-request-link",
          "my-boards-tokenized-list",
          "my-boards-admin-link-mint",
          "oversized-board-create-rejection",
          "idempotent-claim-single-write",
          "idempotent-claim-replay-conflict",
          "idempotent-claim-body-reuse-conflict",
          "email-suppression-requires-admin-token",
          "email-suppression-writes-booking-without-source-email-logs",
          "reschedule-token-purpose-rejection",
          "reschedule-options-token-redaction",
          "reschedule-same-slot-rejection",
          "idempotent-reschedule-single-write",
          "idempotent-reschedule-replay-conflict",
          "idempotent-reschedule-body-reuse-conflict",
          "cancelled-reschedule-rejection",
          "paid-csv-export",
          "csv-formula-injection-mitigation",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  if (closeStartedApi) {
    await closeStartedApi();
  }
  await pool.end();
  await closeApiPool();
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

async function assertCors() {
  const origin = "http://127.0.0.1:5174";
  const preflight = await fetch(`${baseURL}/api/slotboard/events`, {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization,content-type,idempotency-key",
    },
  });
  assert(preflight.status === 204 || preflight.status === 200, `expected CORS preflight success, got ${preflight.status}`);
  assert(preflight.headers.get("access-control-allow-origin") === origin, "expected allowed CORS origin to echo");
  assert(preflight.headers.get("access-control-allow-credentials") === "true", "expected CORS credentials support");
  assert(
    (preflight.headers.get("access-control-allow-headers") ?? "").toLowerCase().includes("idempotency-key"),
    "expected CORS allow headers to include Idempotency-Key",
  );

  const disallowedOrigin = "https://evil.example";
  const disallowed = await fetch(`${baseURL}/healthz`, {
    headers: {
      origin: disallowedOrigin,
    },
  });
  const allowOrigin = disallowed.headers.get("access-control-allow-origin");
  assert(allowOrigin !== disallowedOrigin && allowOrigin !== "*", "expected disallowed origin not to be allowed");
}

async function assertSecurityHeaders() {
  const readyz = await fetchWithSocketRetry(`${baseURL}/readyz`, { headers: headers({}) });
  assert(readyz.headers.get("referrer-policy") === "no-referrer", "expected Referrer-Policy no-referrer");
  assert(readyz.headers.get("x-content-type-options") === "nosniff", "expected X-Content-Type-Options nosniff");
  assert(readyz.headers.get("x-frame-options") === "DENY", "expected X-Frame-Options DENY");
  assert(
    (readyz.headers.get("permissions-policy") ?? "").includes("geolocation=()"),
    "expected restrictive Permissions-Policy",
  );

  const api = await fetchWithSocketRetry(`${baseURL}/api/slotboard/billing/readiness`, { headers: headers({}) });
  assert(api.headers.get("cache-control") === "no-store", "expected API responses to be no-store");
}

async function assertBodyLimit() {
  await request("/api/slotboard/availability/preview", {
    method: "POST",
    expectedStatus: 413,
    expectedError: "payload_too_large",
    json: {
      startDate: isoDateAfterDays(20),
      endDate: isoDateAfterDays(20),
      weekdays: [1],
      dailyStart: "09:00",
      dailyEnd: "10:00",
      durationMinutes: 60,
      timezone: "Africa/Johannesburg",
      blockedRanges: [],
      excludedSlotStarts: Array.from({ length: 60000 }, () => "2026-01-01T00:00:00.000Z"),
    },
  });
}

async function assertQuerySecretRejected() {
  await request(`/api/slotboard/webhooks/email-provider?secret=${encodeURIComponent(emailWebhookSecret)}`, {
    method: "POST",
    skipActorHeader: true,
    expectedStatus: 401,
    expectedError: "invalid_webhook_secret",
    json: {
      RecordType: "Delivery",
      MessageID: `query-secret-${suffix}`,
    },
  });
}

async function assertForwardedHeaderSpoofResistance() {
  for (let index = 0; index < 5; index += 1) {
    await request("/api/slotboard/recover", {
      method: "POST",
      skipActorHeader: true,
      headers: {
        "x-forwarded-for": `198.51.100.${index + 1}, ${xffActorIp}`,
      },
      expectedStatus: 202,
      json: {
        organizerEmail: `xff-${index}+${suffix}@example.com`,
      },
    });
  }

  await request("/api/slotboard/recover", {
    method: "POST",
    skipActorHeader: true,
    headers: {
      "x-forwarded-for": `198.51.100.200, ${xffActorIp}`,
    },
    expectedStatus: 429,
    expectedError: "rate_limited",
    json: {
      organizerEmail: `xff-limit+${suffix}@example.com`,
    },
  });
}

function boardBody({ title, organizerName = "Hardening Organizer", organizerEmail, dayOffset }) {
  const slotDate = isoDateAfterDays(dayOffset);
  const slotWeekday = new Date(`${slotDate}T00:00:00.000Z`).getUTCDay();
  return {
    title,
    description: "Automated backend hardening test.",
    organizerName,
    organizerEmail,
    timezone: "Africa/Johannesburg",
    allowMultipleBookings: false,
    availability: {
      startDate: slotDate,
      endDate: slotDate,
      weekdays: [slotWeekday],
      dailyStart: "09:00",
      dailyEnd: "10:00",
      durationMinutes: 60,
      timezone: "Africa/Johannesburg",
      blockedRanges: [],
    },
  };
}

function multiDayBoardBody({ title, organizerName = "Hardening Organizer", organizerEmail, dayOffset, days }) {
  const startDate = isoDateAfterDays(dayOffset);
  const endDate = isoDateAfterDays(dayOffset + days - 1);
  return {
    title,
    description: "Automated backend entitlement limit test.",
    organizerName,
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
  };
}

async function eventCountByTitle(title) {
  const result = await pool.query(
    `
      select count(*)::int as count
      from slotboard.booking_events
      where title = $1
    `,
    [title],
  );
  return result.rows[0]?.count ?? 0;
}

async function contactLeadCount(email) {
  const result = await pool.query(
    `
      select count(*)::int as count
      from slotboard.contact_leads
      where email = $1
    `,
    [email],
  );
  return result.rows[0]?.count ?? 0;
}

async function activeBookingCount(slotId) {
  const result = await pool.query(
    `
      select count(*)::int as count
      from slotboard.bookings
      where slot_id = $1
        and cancelled_at is null
    `,
    [slotId],
  );
  return result.rows[0]?.count ?? 0;
}

async function emailLogCountForBooking(bookingId) {
  const result = await pool.query(
    `
      select count(*)::int as count
      from slotboard.email_delivery_logs
      where booking_id = $1
    `,
    [bookingId],
  );
  return result.rows[0]?.count ?? 0;
}

async function markEventPassPaid(eventId) {
  await pool.query(
    `
      update slotboard.booking_events
      set plan_key = 'event_pass',
          payment_status = 'paid',
          paid_at = coalesce(paid_at, now()),
          booking_limit = 75,
          slot_limit = 200
      where id = $1
    `,
    [eventId],
  );
}

async function issueMyBoardsToken(ownerEmail) {
  const rawToken = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(`${tokenPepper}${rawToken}`, "utf8").digest("hex");
  await pool.query(
    `
      insert into slotboard.my_boards_links (
        owner_email,
        token_hash,
        expires_at
      )
      values ($1, $2, now() + interval '14 days')
    `,
    [ownerEmail, tokenHash],
  );
  return rawToken;
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
  });
  const text = await response.text();
  if (response.status !== 200) {
    throw new Error(`${path} returned ${response.status}, expected 200: ${text}`);
  }
  return text;
}

async function requestRaw(path, options = {}) {
  const response = await fetchWithSocketRetry(`${baseURL}${path}`, {
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

async function fetchWithSocketRetry(url, init) {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (!["UND_ERR_SOCKET", "ECONNRESET"].includes(error?.cause?.code)) {
      throw error;
    }
    return fetch(url, init);
  }
}

function headers(options) {
  const result = {};
  if (!options.skipActorHeader) {
    result["x-slotboard-smoke-actor"] = process.env.SMOKE_ACTOR_KEY || options.actorKey || `hardening-${suffix}`;
  }
  if (options.json !== undefined) {
    result["content-type"] = "application/json";
  }
  if (options.token) {
    result.authorization = `Bearer ${options.token}`;
  }
  if (options.idempotencyKey) {
    result["idempotency-key"] = options.idempotencyKey;
  }
  if (options.headers) {
    Object.assign(result, options.headers);
  }
  return result;
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
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
