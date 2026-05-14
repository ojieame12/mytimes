import pg from "pg";

const { Pool } = pg;

const providedBaseURL = process.env.SLOTBOARD_API_URL;
let baseURL = providedBaseURL || "";
const databaseURL =
  process.env.SLOTBOARD_DATABASE_URL ||
  "postgres://slotboard:slotboard@localhost:5434/slotboard?sslmode=disable";
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const pool = new Pool({ connectionString: databaseURL, application_name: "slotboard-concurrency-privacy-test" });

process.env.SLOTBOARD_DATABASE_URL ||= databaseURL;
const { closePool: closeApiPool } = await import("../apps/slots-api/src/db.ts");

let closeStartedApi;

try {
  if (!providedBaseURL) {
    closeStartedApi = await startSourceApi();
  }
  await request("/healthz");
  await request("/readyz");

  const boardA = await createBoard({
    title: `Concurrency Privacy Board A ${suffix}`,
    organizerEmail: `organizer-a+${suffix}@example.com`,
    avatarStyle: "lorelei",
    dayOffset: 21,
  });
  assert(boardA.event.avatarStyle === "lorelei", `expected created board avatar style to persist, got ${boardA.event.avatarStyle}`);
  assert(typeof boardA.event.avatarSeed === "string" && boardA.event.avatarSeed.length > 0, "expected created board to return stable avatar seed");
  const publicTokenA = tokenFromLink(boardA.links.public);
  const adminTokenA = tokenFromLink(boardA.links.admin);
  const publicBeforeClaim = await request("/api/slotboard/book", { token: publicTokenA });
  assert(publicBeforeClaim.event.avatarStyle === "lorelei", `expected public board avatar style to persist, got ${publicBeforeClaim.event.avatarStyle}`);
  assert(publicBeforeClaim.event.avatarSeed === boardA.event.avatarSeed, "expected public board avatar seed to match created event");
  assert(publicBeforeClaim.slots.length === 1, `expected one claimable slot, got ${publicBeforeClaim.slots.length}`);

  const slotIdA = publicBeforeClaim.slots[0].id;
  const claimAttempts = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      requestRaw("/api/slotboard/book/claim", {
        method: "POST",
        token: publicTokenA,
        json: {
          slotId: slotIdA,
          participantName: `Concurrent Participant ${index}`,
          participantEmail: `concurrent-${index}+${suffix}@example.com`,
          notes: `Private concurrent notes ${index}`,
        },
      }),
    ),
  );
  const successfulClaims = claimAttempts.filter((item) => item.status === 201);
  const conflictClaims = claimAttempts.filter((item) => item.status === 409);
  assert(successfulClaims.length === 1, `expected exactly one successful concurrent claim, got ${successfulClaims.length}`);
  assert(conflictClaims.length === 7, `expected seven conflicted concurrent claims, got ${conflictClaims.length}`);

  const claimed = successfulClaims[0].json;
  const manageTokenA = tokenFromLink(claimed.links.manage);
  assert(
    (await activeBookingCount(slotIdA)) === 1,
    "expected database to contain exactly one active booking after concurrent claims",
  );

  const publicAfterClaim = await request("/api/slotboard/book", { token: publicTokenA });
  assert(publicAfterClaim.slots.length === 0, "expected booked slot to be hidden from public board");
  assertNoParticipantLeak(publicAfterClaim, [
    claimed.booking.participantName,
    claimed.booking.participantEmail,
    claimed.booking.notes,
  ]);
  assertNoRawTokenLeak(publicAfterClaim, [publicTokenA, adminTokenA, manageTokenA]);

  const adminA = await request("/api/slotboard/admin", { token: adminTokenA });
  assert(adminA.event.avatarStyle === "lorelei", `expected admin board avatar style to persist, got ${adminA.event.avatarStyle}`);
  assert(inJson(adminA, claimed.booking.participantEmail), "expected admin dashboard to show participant email");
  assert(inJson(adminA, claimed.booking.notes), "expected admin dashboard to show participant notes");
  assertNoRawTokenLeak(adminA, [publicTokenA, adminTokenA, manageTokenA]);
  assert(!jsonText(adminA).includes("token_hash"), "expected admin dashboard to hide token hash fields");

  await request("/api/slotboard/manage", { token: publicTokenA, expectedStatus: 404 });
  await request("/api/slotboard/manage", { token: adminTokenA, expectedStatus: 404 });
  await request("/api/slotboard/admin", { token: publicTokenA, expectedStatus: 404 });
  await request("/api/slotboard/book", { token: adminTokenA, expectedStatus: 404 });

  const pendingBoard = await createBoard({
    title: `Concurrency Privacy Pending Payment Board ${suffix}`,
    organizerEmail: `organizer-pending+${suffix}@example.com`,
    dayOffset: 24,
  });
  const pendingPublicToken = tokenFromLink(pendingBoard.links.public);
  const pendingPublicBefore = await request("/api/slotboard/book", { token: pendingPublicToken });
  assert(pendingPublicBefore.slots.length === 1, "expected pending test board to start with one public slot");
  await markEventPaymentPending(pendingBoard.event.id);
  const pendingPublicAfter = await request("/api/slotboard/book", { token: pendingPublicToken });
  assert(pendingPublicAfter.slots.length === 0, "expected pending-payment board to hide public slots");
  await request("/api/slotboard/book/claim", {
    method: "POST",
    token: pendingPublicToken,
    expectedStatus: 402,
    json: {
      slotId: pendingPublicBefore.slots[0].id,
      participantName: "Pending Payment Participant",
      participantEmail: `pending-payment+${suffix}@example.com`,
      notes: "Pending payment board should not be bookable.",
    },
  });

  const boardB = await createBoard({
    title: `Concurrency Privacy Board B ${suffix}`,
    organizerEmail: `organizer-b+${suffix}@example.com`,
    dayOffset: 22,
  });
  const adminTokenB = tokenFromLink(boardB.links.admin);
  await request(`/api/slotboard/admin/slots/${slotIdA}/close`, {
    method: "POST",
    token: adminTokenB,
    expectedStatus: 404,
  });
  await request(`/api/slotboard/admin/bookings/${claimed.booking.id}/cancel`, {
    method: "POST",
    token: adminTokenB,
    expectedStatus: 404,
    json: { reason: "Cross-board cancellation must fail." },
  });
  const adminB = await request("/api/slotboard/admin", { token: adminTokenB });
  assertNoParticipantLeak(adminB, [claimed.booking.participantEmail, claimed.booking.notes]);

  const cancelAttempts = await Promise.all(
    Array.from({ length: 6 }, () =>
      requestRaw("/api/slotboard/manage/cancel", {
        method: "POST",
        token: manageTokenA,
        json: { reason: "Concurrent participant cancellation." },
      }),
    ),
  );
  assert(
    cancelAttempts.every((item) => item.status === 200),
    `expected concurrent cancellations to be idempotent 200s, got ${cancelAttempts.map((item) => item.status).join(",")}`,
  );
  assert(
    cancelAttempts.every((item) => item.json?.booking?.status === "cancelled"),
    "expected every concurrent cancellation response to show cancelled booking",
  );
  assert((await activeBookingCount(slotIdA)) === 0, "expected no active bookings after participant cancellation");
  const cancellationDeliveryCounts = await emailDeliveryCounts(claimed.booking.id);
  assert(
    cancellationDeliveryCounts.booking_cancellation === 1,
    `expected exactly one participant cancellation email, got ${cancellationDeliveryCounts.booking_cancellation ?? 0}`,
  );
  assert(
    cancellationDeliveryCounts.organizer_cancellation_notice === 1,
    `expected exactly one organizer cancellation email, got ${cancellationDeliveryCounts.organizer_cancellation_notice ?? 0}`,
  );
  const publicAfterCancel = await request("/api/slotboard/book", { token: publicTokenA });
  assert(publicAfterCancel.slots.some((slot) => slot.id === slotIdA), "expected cancelled booking to reopen public slot");

  const deleteBoard = await createBoard({
    title: `Concurrency Privacy Delete Board ${suffix}`,
    organizerEmail: `organizer-delete+${suffix}@example.com`,
    dayOffset: 23,
  });
  const deletePublicToken = tokenFromLink(deleteBoard.links.public);
  const deleteAdminToken = tokenFromLink(deleteBoard.links.admin);
  const deletePublicBoard = await request("/api/slotboard/book", { token: deletePublicToken });
  const deleteClaim = await request("/api/slotboard/book/claim", {
    method: "POST",
    token: deletePublicToken,
    expectedStatus: 201,
    json: {
      slotId: deletePublicBoard.slots[0].id,
      participantName: "Delete Privacy Participant",
      participantEmail: `delete-participant+${suffix}@example.com`,
      notes: "Delete board private notes.",
    },
  });
  const deleteManageToken = tokenFromLink(deleteClaim.links.manage);
  await request("/api/slotboard/admin/delete", { method: "POST", token: deleteAdminToken });
  await request("/api/slotboard/book", { token: deletePublicToken, expectedStatus: 404 });
  await request("/api/slotboard/admin", { token: deleteAdminToken, expectedStatus: 404 });
  await request("/api/slotboard/manage", { token: deleteManageToken, expectedStatus: 404 });

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseURL,
        checked: [
          "health",
          "readiness",
          "concurrent-claim-single-winner",
          "single-active-booking-db-invariant",
          "public-booking-pii-redaction",
          "admin-token-redaction",
          "wrong-token-purpose-rejection",
          "pending-payment-public-slots-hidden",
          "pending-payment-claim-rejection",
          "cross-admin-slot-rejection",
          "cross-admin-booking-rejection",
          "concurrent-cancel-idempotency",
          "concurrent-cancel-single-email-side-effect",
          "cancel-reopens-public-slot",
          "deleted-manage-token-rejection",
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

async function createBoard({ title, organizerEmail, dayOffset, avatarStyle = "notionists" }) {
  const slotDate = isoDateAfterDays(dayOffset);
  const slotWeekday = new Date(`${slotDate}T00:00:00.000Z`).getUTCDay();
  return request("/api/slotboard/events", {
    method: "POST",
    expectedStatus: 201,
    json: {
      title,
      description: "Automated concurrency/privacy test.",
      organizerName: "Concurrency Organizer",
      organizerEmail,
      avatarStyle,
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
    },
  });
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

async function emailDeliveryCounts(bookingId) {
  const result = await pool.query(
    `
      select email_type, count(*)::int as count
      from slotboard.email_delivery_logs
      where booking_id = $1
      group by email_type
    `,
    [bookingId],
  );
  return Object.fromEntries(result.rows.map((row) => [row.email_type, Number(row.count)]));
}

async function markEventPaymentPending(eventId) {
  await pool.query(
    `
      update slotboard.booking_events
      set plan_key = 'event_pass',
          payment_status = 'pending',
          booking_limit = 75,
          slot_limit = 200
      where id = $1
    `,
    [eventId],
  );
}

async function request(path, options = {}) {
  const response = await requestRaw(path, options);
  const expectedStatus = options.expectedStatus || 200;
  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}, expected ${expectedStatus}: ${response.text}`);
  }
  return response.json;
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
    "x-forwarded-for": process.env.SMOKE_ACTOR_KEY || `concurrency-privacy-${suffix}`,
    "x-slotboard-smoke-actor": process.env.SMOKE_ACTOR_KEY || `concurrency-privacy-${suffix}`,
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

function assertNoParticipantLeak(value, privateValues) {
  const text = jsonText(value);
  for (const privateValue of privateValues) {
    if (privateValue) {
      assert(!text.includes(privateValue), `response leaked private participant value: ${privateValue}`);
    }
  }
}

function assertNoRawTokenLeak(value, rawTokens) {
  const text = jsonText(value);
  for (const token of rawTokens) {
    assert(!text.includes(token), "response leaked a raw bearer token");
  }
}

function inJson(value, needle) {
  return jsonText(value).includes(needle);
}

function jsonText(value) {
  return JSON.stringify(value);
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
