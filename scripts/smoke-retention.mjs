import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const baseURL = process.env.SLOTBOARD_API_URL || "http://127.0.0.1:3014";
const databaseURL =
  process.env.SLOTBOARD_DATABASE_URL ||
  "postgres://slotboard:slotboard@localhost:5434/slotboard?sslmode=disable";
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const pool = new Pool({ connectionString: databaseURL, application_name: "slotboard-retention-smoke" });

try {
  await request("/healthz");
  await request("/readyz");

  const pastDate = isoDateAfterDays(-40);
  const pastWeekday = new Date(`${pastDate}T00:00:00.000Z`).getUTCDay();
  const pastEvent = await createBoard({
    title: `Retention Past Board ${suffix}`,
    organizerEmail: `retention-past+${suffix}@example.com`,
    slotDate: pastDate,
    slotWeekday: pastWeekday,
  });
  const pastPublicToken = tokenFromLink(pastEvent.links.public);

  const archiveResult = runRetention({
    SLOTBOARD_RETENTION_ARCHIVE_AFTER_DAYS: "0",
    SLOTBOARD_RETENTION_DELETE_ARCHIVED_AFTER_DAYS: "9999",
    SLOTBOARD_RETENTION_PII_SCRUB_AFTER_DAYS: "9999",
    SLOTBOARD_RETENTION_RATE_LIMIT_AFTER_DAYS: "9999",
  });
  assert(archiveResult.archivedEvents >= 1, "expected retention to archive at least one event");

  const archivedBoard = await request("/api/slotboard/book", {
    token: pastPublicToken,
  });
  assert(archivedBoard.event.status === "archived", `expected archived board, got ${archivedBoard.event.status}`);
  assert(archivedBoard.slots.length === 0, "expected archived board to hide public slots");

  await pool.query(
    `
      update slotboard.booking_events
      set archived_at = now() - interval '2 days'
      where id = $1
    `,
    [pastEvent.event.id],
  );
  const deleteArchivedResult = runRetention({
    SLOTBOARD_RETENTION_ARCHIVE_AFTER_DAYS: "9999",
    SLOTBOARD_RETENTION_DELETE_ARCHIVED_AFTER_DAYS: "1",
    SLOTBOARD_RETENTION_PII_SCRUB_AFTER_DAYS: "9999",
    SLOTBOARD_RETENTION_RATE_LIMIT_AFTER_DAYS: "9999",
  });
  assert(deleteArchivedResult.deletedArchivedEvents >= 1, "expected retention to delete old archived event");
  await request("/api/slotboard/book", {
    token: pastPublicToken,
    expectedStatus: 404,
  });

  const futureDate = isoDateAfterDays(14);
  const futureWeekday = new Date(`${futureDate}T00:00:00.000Z`).getUTCDay();
  const deletedFixture = await createBoard({
    title: `Retention PII Board ${suffix}`,
    organizerEmail: `retention-pii+${suffix}@example.com`,
    slotDate: futureDate,
    slotWeekday: futureWeekday,
  });
  const deletedPublicToken = tokenFromLink(deletedFixture.links.public);
  const deletedAdminToken = tokenFromLink(deletedFixture.links.admin);
  const deletedPublicBoard = await request("/api/slotboard/book", {
    token: deletedPublicToken,
  });
  const claimed = await request("/api/slotboard/book/claim", {
    method: "POST",
    token: deletedPublicToken,
    expectedStatus: 201,
    json: {
      slotId: deletedPublicBoard.slots[0].id,
      participantName: "Retention Participant",
      participantEmail: `retention-participant+${suffix}@example.com`,
      notes: "Contains participant notes that must be scrubbed.",
    },
  });
  assert(claimed.booking.status === "active", `expected active booking, got ${claimed.booking.status}`);
  await request("/api/slotboard/product-events", {
    method: "POST",
    expectedStatus: 202,
    json: {
      name: "retention.deleted_event_metric",
      actorType: "participant",
      eventId: deletedFixture.event.id,
      bookingId: claimed.booking.id,
      metadata: {
        participantEmail: claimed.booking.participantEmail,
      },
    },
  });

  await request("/api/slotboard/admin/delete", {
    method: "POST",
    token: deletedAdminToken,
  });

  const scrubResult = runRetention({
    SLOTBOARD_RETENTION_ARCHIVE_AFTER_DAYS: "9999",
    SLOTBOARD_RETENTION_DELETE_ARCHIVED_AFTER_DAYS: "9999",
    SLOTBOARD_RETENTION_PII_SCRUB_AFTER_DAYS: "0",
    SLOTBOARD_RETENTION_RATE_LIMIT_AFTER_DAYS: "9999",
  });
  assert(scrubResult.scrubbedEvents >= 1, "expected retention to scrub deleted event metadata");
  assert(scrubResult.scrubbedBookings >= 1, "expected retention to scrub deleted event bookings");
  assert(scrubResult.scrubbedEmailLogs >= 1, "expected retention to scrub deleted event email logs");
  assert(scrubResult.scrubbedActivityEvents >= 1, "expected retention to scrub deleted event activity logs");
  assert(scrubResult.scrubbedProductEvents >= 1, "expected retention to scrub deleted event product events");

  const scrubbedEvent = await one(
    `
      select title, description, organizer_name, organizer_email, public_token_hash, admin_token_hash
      from slotboard.booking_events
      where id = $1
    `,
    [deletedFixture.event.id],
  );
  assert(scrubbedEvent.title === "Deleted board", `expected scrubbed event title, got ${scrubbedEvent.title}`);
  assert(scrubbedEvent.description === "", "expected scrubbed event description");
  assert(scrubbedEvent.organizer_name === "Deleted organizer", "expected scrubbed organizer name");
  assert(scrubbedEvent.organizer_email.endsWith("@slotboard.invalid"), "expected scrubbed organizer email");
  assert(scrubbedEvent.public_token_hash.startsWith("scrubbed:public:"), "expected scrubbed public token hash");
  assert(scrubbedEvent.admin_token_hash.startsWith("scrubbed:admin:"), "expected scrubbed admin token hash");

  const scrubbedBooking = await one(
    `
      select participant_name, participant_email, dedupe_email, notes, cancelled_reason, manage_token_hash
      from slotboard.bookings
      where event_id = $1
      limit 1
    `,
    [deletedFixture.event.id],
  );
  assert(scrubbedBooking.participant_name === "Deleted participant", "expected scrubbed participant name");
  assert(scrubbedBooking.participant_email.endsWith("@slotboard.invalid"), "expected scrubbed participant email");
  assert(scrubbedBooking.dedupe_email === null, "expected scrubbed dedupe email");
  assert(scrubbedBooking.notes === "", "expected scrubbed booking notes");
  assert(scrubbedBooking.cancelled_reason === null, "expected scrubbed cancellation reason");
  assert(scrubbedBooking.manage_token_hash.startsWith("scrubbed:manage:"), "expected scrubbed manage token");

  const emailLogSummary = await one(
    `
      select count(*)::int as total,
             count(*) filter (where recipient_email like 'scrubbed+%@slotboard.invalid')::int as scrubbed
      from slotboard.email_delivery_logs
      where event_id = $1
    `,
    [deletedFixture.event.id],
  );
  assert(emailLogSummary.total > 0, "expected email delivery logs for deleted event");
  assert(
    emailLogSummary.total === emailLogSummary.scrubbed,
    "expected all deleted event email recipients to be scrubbed",
  );

  const activitySummary = await one(
    `
      select count(*)::int as total,
             count(*) filter (
               where (actor_label is null or actor_label = 'scrubbed')
                 and metadata = '{}'::jsonb
             )::int as scrubbed
      from slotboard.activity_events
      where event_id = $1
    `,
    [deletedFixture.event.id],
  );
  assert(activitySummary.total > 0, "expected activity logs for deleted event");
  assert(
    activitySummary.total === activitySummary.scrubbed,
    "expected all deleted event activity rows to be scrubbed",
  );

  const productEventSummary = await one(
    `
      select count(*)::int as total,
             count(*) filter (
               where actor_key_hash is null
                 and metadata = '{}'::jsonb
             )::int as scrubbed
      from slotboard.product_events
      where event_id = $1
    `,
    [deletedFixture.event.id],
  );
  assert(productEventSummary.total > 0, "expected product events for deleted event");
  assert(
    productEventSummary.total === productEventSummary.scrubbed,
    "expected all deleted event product events to be scrubbed",
  );

  const oldRateLimit = await one(
    `
      insert into slotboard.rate_limit_events (route_key, actor_key, created_at)
      values ($1, $2, now() - interval '2 days')
      returning id
    `,
    [`retention-smoke-old-${suffix}`, `actor-${suffix}`],
  );
  const freshRateLimit = await one(
    `
      insert into slotboard.rate_limit_events (route_key, actor_key, created_at)
      values ($1, $2, now())
      returning id
    `,
    [`retention-smoke-fresh-${suffix}`, `actor-${suffix}`],
  );
  const rateLimitResult = runRetention({
    SLOTBOARD_RETENTION_ARCHIVE_AFTER_DAYS: "9999",
    SLOTBOARD_RETENTION_DELETE_ARCHIVED_AFTER_DAYS: "9999",
    SLOTBOARD_RETENTION_PII_SCRUB_AFTER_DAYS: "9999",
    SLOTBOARD_RETENTION_RATE_LIMIT_AFTER_DAYS: "1",
  });
  assert(rateLimitResult.deletedRateLimitEvents >= 1, "expected retention to delete old rate limit rows");
  assert(!(await rowExists("slotboard.rate_limit_events", oldRateLimit.id)), "expected old rate-limit row to be deleted");
  assert(await rowExists("slotboard.rate_limit_events", freshRateLimit.id), "expected fresh rate-limit row to remain");

  const oldIdempotencyKey = await one(
    `
      insert into slotboard.idempotency_keys (
        route_key,
        actor_key_hash,
        idempotency_key_hash,
        request_hash,
        status,
        created_at
      )
      values ($1, $2, $3, $4, 'succeeded', now() - interval '2 days')
      returning id
    `,
    [`retention-smoke-${suffix}`, `old-actor-${suffix}`, `old-key-${suffix}`, `old-request-${suffix}`],
  );
  const freshIdempotencyKey = await one(
    `
      insert into slotboard.idempotency_keys (
        route_key,
        actor_key_hash,
        idempotency_key_hash,
        request_hash,
        status,
        created_at
      )
      values ($1, $2, $3, $4, 'succeeded', now())
      returning id
    `,
    [`retention-smoke-${suffix}`, `fresh-actor-${suffix}`, `fresh-key-${suffix}`, `fresh-request-${suffix}`],
  );
  const idempotencyResult = runRetention({
    SLOTBOARD_RETENTION_ARCHIVE_AFTER_DAYS: "9999",
    SLOTBOARD_RETENTION_DELETE_ARCHIVED_AFTER_DAYS: "9999",
    SLOTBOARD_RETENTION_PII_SCRUB_AFTER_DAYS: "9999",
    SLOTBOARD_RETENTION_RATE_LIMIT_AFTER_DAYS: "9999",
    SLOTBOARD_RETENTION_IDEMPOTENCY_AFTER_DAYS: "1",
  });
  assert(idempotencyResult.deletedIdempotencyKeys >= 1, "expected retention to delete old idempotency rows");
  assert(!(await rowExists("slotboard.idempotency_keys", oldIdempotencyKey.id)), "expected old idempotency row to be deleted");
  assert(await rowExists("slotboard.idempotency_keys", freshIdempotencyKey.id), "expected fresh idempotency row to remain");

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseURL,
        checked: [
          "health",
          "readiness",
          "auto-archive-expired-board",
          "public-archived-read",
          "delete-old-archived-board",
          "deleted-public-token-rejection",
          "deleted-event-pii-scrub",
          "deleted-booking-pii-scrub",
          "deleted-email-log-scrub",
          "deleted-activity-log-scrub",
          "deleted-product-event-scrub",
          "rate-limit-cleanup",
          "idempotency-key-cleanup",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}

async function createBoard({ title, organizerEmail, slotDate, slotWeekday }) {
  return request("/api/slotboard/events", {
    method: "POST",
    expectedStatus: 201,
    json: {
      title,
      description: "Automated retention smoke test.",
      organizerName: "Retention Organizer",
      organizerEmail,
      timezone: "Africa/Johannesburg",
      allowMultipleBookings: false,
      availability: {
        startDate: slotDate,
        endDate: slotDate,
        weekdays: [slotWeekday],
        dailyStart: "09:00",
        dailyEnd: "11:00",
        durationMinutes: 60,
        timezone: "Africa/Johannesburg",
        blockedRanges: [],
      },
    },
  });
}

function runRetention(overrides) {
  const output = execFileSync("npm", ["run", "retention", "--workspace", "@fresh-feel/slots-api"], {
    cwd: rootDir,
    env: {
      ...process.env,
      SLOTBOARD_DATABASE_URL: databaseURL,
      SLOTBOARD_TOKEN_PEPPER: process.env.SLOTBOARD_TOKEN_PEPPER || "retention-smoke-token-pepper-32chars",
      SLOTBOARD_RETENTION_ENABLED: "true",
      ...overrides,
    },
    encoding: "utf8",
  });
  const jsonLine = output
    .trim()
    .split("\n")
    .reverse()
    .find((line) => line.trim().startsWith("{"));
  assert(jsonLine, `expected retention JSON output, got ${output}`);
  return JSON.parse(jsonLine);
}

async function request(path, options = {}) {
  const response = await fetch(`${baseURL}${path}`, {
    method: options.method || "GET",
    headers: headers(options),
    body: options.json === undefined ? undefined : JSON.stringify(options.json),
  });
  const expectedStatus = options.expectedStatus || 200;
  const text = await response.text();

  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}, expected ${expectedStatus}: ${text}`);
  }

  return text ? JSON.parse(text) : undefined;
}

function headers(options) {
  const result = {
    "x-forwarded-for": process.env.SMOKE_ACTOR_KEY || `retention-smoke-${suffix}`,
    "x-slotboard-smoke-actor": process.env.SMOKE_ACTOR_KEY || `retention-smoke-${suffix}`,
  };
  if (options.json !== undefined) {
    result["content-type"] = "application/json";
  }
  if (options.token) {
    result.authorization = `Bearer ${options.token}`;
  }
  return result;
}

async function one(query, values) {
  const result = await pool.query(query, values);
  const row = result.rows[0];
  assert(row, "expected one database row");
  return row;
}

async function rowExists(table, id) {
  const result = await pool.query(`select 1 from ${table} where id = $1 limit 1`, [id]);
  return Boolean(result.rows[0]);
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
