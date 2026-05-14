import { generateAvailabilitySlots } from "@fresh-feel/slotboard-core";
import { timingSafeEqual } from "node:crypto";
import { Hono, type Context, type Handler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { tokenFromRequest, tokenHash } from "./auth.js";
import {
  createCustomerPortalSession,
  createCompanyStandbyCheckout,
  createEventPassCheckout,
  createOrganizerEventPassCheckout,
  handleStripeWebhook,
  readOrganizerBilling,
  readBillingReadiness,
} from "./billing.js";
import { getPool } from "./db.js";
import {
  activateCustomDomain,
  isActiveCustomDomainOrigin,
  readCustomDomainSettings,
  requestCustomDomain,
  verifyCustomDomain,
} from "./customDomains.js";
import { sendEmailDesignTestBatch, sendOperationalTestEmail } from "./email.js";
import { handleEmailProviderWebhook } from "./emailWebhooks.js";
import { customDomainReadiness, emailReadiness, loadEnv } from "./env.js";
import { createEvent } from "./events.js";
import { ApiError, toErrorResponse } from "./errors.js";
import { idempotencyKeyFromHeaders, runIdempotent } from "./idempotency.js";
import { logError, logInfo, sanitizeRequestPath } from "./logger.js";
import { createMyBoardsAdminLink, readMyBoards, requestMyBoardsLink } from "./myBoards.js";
import { getOrganizerAuth, getOrganizerSession, requireOrganizerSession } from "./organizerAuth.js";
import { recordProductEvent } from "./productEvents.js";
import { assertRateLimit, requestActorKey } from "./rateLimit.js";
import {
  archiveAdminEvent,
  archiveOrganizerEvent,
  cancelBookingByAdmin,
  cancelBookingByOrganizer,
  cancelManagedBooking,
  claimSlot,
  deleteAdminEvent,
  deleteOrganizerEvent,
  exportAdminCsv,
  exportOrganizerCrossBoardCsv,
  exportOrganizerCsv,
  readAdminActivity,
  readAdminDashboard,
  readManagedCalendar,
  readOrganizerActivity,
  readOrganizerDashboard,
  readOrganizerEvents,
  readManageBooking,
  readPublicBoard,
  recoverAdminLinks,
  recoverManageLink,
  resendBookingEmailByAdmin,
  resendBookingEmailByOrganizer,
  resendManagedBookingEmail,
  rotateAdminPublicLink,
  rotateOrganizerPublicLink,
  setAdminSlotStatus,
  setOrganizerSlotStatus,
  updateAdminEvent,
  updateOrganizerEvent,
} from "./slotboard.js";
import {
  toAvailabilityInput,
  toCancelBookingInput,
  toClaimSlotInput,
  toCustomDomainInput,
  toCreateEventInput,
  toEmailDesignTestInput,
  toEmailTestInput,
  toManageLinkRecoveryInput,
  toMyBoardsLinkRequestInput,
  toProductEventInput,
  toRecoveryInput,
  toUpdateEventInput,
} from "./validation.js";

const env = loadEnv();
const API_BODY_LIMIT_BYTES = 1024 * 1024;

export const app = new Hono();

app.use(
  "*",
  cors({
    origin: corsOrigin,
    allowHeaders: ["Authorization", "Content-Type", "Idempotency-Key", "X-SlotBoard-Ops-Secret"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length", "Content-Disposition"],
    credentials: true,
  }),
);

app.use("*", async (c, next) => {
  const requestId = requestIdFromHeaders(c.req.raw.headers);
  const startedAt = performance.now();
  c.header("X-Request-Id", requestId);
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (process.env.NODE_ENV === "production") {
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  if (c.req.path.startsWith("/api/")) {
    c.header("Cache-Control", "no-store");
  }
  try {
    await next();
  } finally {
    logInfo("slotboard_http_request", {
      requestId,
      method: c.req.method,
      path: sanitizeRequestPath(c.req.path),
      status: c.res.status,
      durationMs: Math.round(performance.now() - startedAt),
    });
  }
});

app.use(
  "/api/*",
  bodyLimit({
    maxSize: API_BODY_LIMIT_BYTES,
    onError: (c) =>
      c.json(
        {
          error: "payload_too_large",
          message: `Request body cannot exceed ${Math.round(API_BODY_LIMIT_BYTES / 1024)} KB`,
        },
        413,
      ),
  }),
);

app.use("/api/auth/*", async (c, next) => {
  try {
    if (c.req.method !== "GET" && c.req.method !== "OPTIONS") {
      await assertRateLimit("auth:ip", requestActorKey(c.req.raw.headers), { limit: 30, windowSeconds: 3600 });
    }
  } catch (error) {
    return jsonError(c, error);
  }
  return next();
});

const healthzHandler: Handler = (c) =>
  c.json({
    ok: true,
    service: "slotboard-api",
  });

const readyzHandler: Handler = async (c) => {
  try {
    await getPool().query("select 1");
    return c.json({
      ok: true,
      service: "slotboard-api",
      database: "ready",
      email: emailReadiness(env),
      billing: readBillingReadiness(),
      customDomain: customDomainReadiness(env),
    });
  } catch (error) {
    return jsonError(c, error);
  }
};

app.get("/healthz", healthzHandler);
app.get("/api/healthz", healthzHandler);
app.get("/readyz", readyzHandler);
app.get("/api/readyz", readyzHandler);

app.get("/api/slotboard/ops/email-readiness", (c) =>
  c.json({
    ok: true,
    email: emailReadiness(env),
  }),
);

app.post("/api/slotboard/ops/email-test", async (c) => {
  try {
    assertOpsSecret(c.req.raw.headers);
    await assertRateLimit("ops-email-test", requestActorKey(c.req.raw.headers), { limit: 5, windowSeconds: 3600 });

    const readiness = emailReadiness(env);
    if (env.emailProvider === "console" || !readiness.deliveryConfigured) {
      throw new ApiError(
        409,
        "email_delivery_not_configured",
        readiness.issues[0] ?? "Production email delivery is not configured",
      );
    }

    const body = await readJson(c.req);
    const delivery = await sendOperationalTestEmail(toEmailTestInput(body));
    if (delivery.status === "failed") {
      return c.json({
        ok: false,
        email: readiness,
        delivery,
      }, 502);
    }
    return c.json({
      ok: true,
      email: readiness,
      delivery,
    });
  } catch (error) {
    return jsonError(c, error);
  }
});

app.post("/api/slotboard/ops/email-design-test", async (c) => {
  try {
    assertOpsSecret(c.req.raw.headers);
    await assertRateLimit("ops-email-design-test", requestActorKey(c.req.raw.headers), { limit: 5, windowSeconds: 3600 });

    const readiness = emailReadiness(env);
    if (env.emailProvider === "console" || !readiness.deliveryConfigured) {
      throw new ApiError(
        409,
        "email_delivery_not_configured",
        readiness.issues[0] ?? "Production email delivery is not configured",
      );
    }

    const body = await readJson(c.req);
    const input = toEmailDesignTestInput(body);
    const result = await sendEmailDesignTestBatch(input);
    const anyFailed = result.sent.some((r) => r.status === "failed");
    return c.json(
      { ok: !anyFailed, email: readiness, ...result },
      anyFailed ? 502 : 200,
    );
  } catch (error) {
    return jsonError(c, error);
  }
});

app.post("/api/slotboard/ops/custom-domain/activate", async (c) => activateOpsCustomDomainHandler(c));

app.on(["POST", "GET"], "/api/auth/*", async (c) => {
  try {
    return await getOrganizerAuth().handler(c.req.raw);
  } catch (error) {
    return jsonError(c, error);
  }
});

app.post("/api/slotboard/availability/preview", async (c) => {
  try {
    await assertRateLimit("availability-preview:ip", requestActorKey(c.req.raw.headers), { limit: 60, windowSeconds: 3600 });
    const body = await readJson(c.req);
    const input = toAvailabilityInput(body);
    const slots = safeGenerateAvailabilitySlots(input);
    return c.json({
      count: slots.length,
      slots,
    });
  } catch (error) {
    return jsonError(c, error);
  }
});

app.post("/api/slotboard/events", async (c) => {
  try {
    const body = await readJson(c.req);
    const input = toCreateEventInput(body);
    const session = await optionalOrganizerSession(c.req.raw.headers);
    const actorKey = session?.user.id ? `user:${session.user.id}` : `request:${requestActorKey(c.req.raw.headers)}`;
    await assertRateLimit("events-create:actor", actorKey, { limit: 20, windowSeconds: 3600 });
    await assertRateLimit("events-create:email", input.organizerEmail, { limit: 5, windowSeconds: 3600 });
    const created = await runIdempotent({
      routeKey: "slotboard.events.create",
      actorKey,
      idempotencyKey: idempotencyKeyFromHeaders(c.req.raw.headers),
      requestBody: input,
      run: () => createEvent(input, session?.user.id ?? null),
    });
    return c.json(created, 201);
  } catch (error) {
    return jsonError(c, error);
  }
});

app.get("/api/slotboard/book", async (c) => readPublicBoardHandler(c));
app.get("/api/slotboard/book/:publicToken", async (c) => readPublicBoardHandler(c, "publicToken"));
app.post("/api/slotboard/book/claim", async (c) => claimSlotHandler(c));
app.post("/api/slotboard/book/:publicToken/claim", async (c) => claimSlotHandler(c, "publicToken"));
app.post("/api/slotboard/book/recover", async (c) => recoverManageLinkHandler(c));
app.post("/api/slotboard/book/:publicToken/recover", async (c) => recoverManageLinkHandler(c, "publicToken"));

app.post("/api/slotboard/product-events", async (c) => recordProductEventHandler(c));

app.get("/api/slotboard/billing/readiness", (c) =>
  c.json({
    ok: true,
    billing: readBillingReadiness(),
  }),
);
app.get("/api/slotboard/billing/account", async (c) => readOrganizerBillingHandler(c));
app.post("/api/slotboard/billing/event-pass/checkout", async (c) => createEventPassCheckoutHandler(c));
app.post("/api/slotboard/billing/company-standby/checkout", async (c) => createCompanyStandbyCheckoutHandler(c));
app.get("/api/slotboard/account/custom-domain", async (c) => readAccountCustomDomainHandler(c));
app.post("/api/slotboard/account/custom-domain", async (c) => requestAccountCustomDomainHandler(c));
app.post("/api/slotboard/account/custom-domain/verify", async (c) => verifyAccountCustomDomainHandler(c));
app.post("/api/slotboard/my-boards/request", async (c) => requestMyBoardsLinkHandler(c));
app.get("/api/slotboard/my-boards", async (c) => readMyBoardsHandler(c));
app.post("/api/slotboard/my-boards/:eventId/admin-link", async (c) => createMyBoardsAdminLinkHandler(c));
app.post("/api/slotboard/billing/customer-portal", async (c) => createCustomerPortalSessionHandler(c));

app.get("/api/slotboard/manage", async (c) => readManageBookingHandler(c));
app.get("/api/slotboard/manage/calendar.ics", async (c) => readManagedCalendarHandler(c));
app.get("/api/slotboard/manage/:manageToken/calendar.ics", async (c) =>
  readManagedCalendarHandler(c, "manageToken"),
);
app.get("/api/slotboard/manage/:manageToken", async (c) => readManageBookingHandler(c, "manageToken"));
app.post("/api/slotboard/manage/resend-email", async (c) => resendManagedBookingEmailHandler(c));
app.post("/api/slotboard/manage/:manageToken/resend-email", async (c) =>
  resendManagedBookingEmailHandler(c, "manageToken"),
);
app.post("/api/slotboard/manage/cancel", async (c) => cancelManagedBookingHandler(c));
app.post("/api/slotboard/manage/:manageToken/cancel", async (c) => cancelManagedBookingHandler(c, "manageToken"));

app.get("/api/slotboard/admin", async (c) => readAdminDashboardHandler(c));
app.get("/api/slotboard/admin/activity", async (c) => readAdminActivityHandler(c));
app.get("/api/slotboard/admin/export.csv", async (c) => exportAdminCsvHandler(c));
app.get("/api/slotboard/admin/:adminToken", async (c) => readAdminDashboardHandler(c, "adminToken"));
app.get("/api/slotboard/admin/:adminToken/activity", async (c) => readAdminActivityHandler(c, "adminToken"));
app.post("/api/slotboard/admin/public-link/rotate", async (c) => rotateAdminPublicLinkHandler(c));
app.post("/api/slotboard/admin/:adminToken/public-link/rotate", async (c) =>
  rotateAdminPublicLinkHandler(c, "adminToken"),
);
app.patch("/api/slotboard/admin/event", async (c) => updateAdminEventHandler(c));
app.patch("/api/slotboard/admin/:adminToken/event", async (c) => updateAdminEventHandler(c, "adminToken"));
app.post("/api/slotboard/admin/archive", async (c) => archiveAdminEventHandler(c));
app.post("/api/slotboard/admin/:adminToken/archive", async (c) => archiveAdminEventHandler(c, "adminToken"));
app.post("/api/slotboard/admin/delete", async (c) => deleteAdminEventHandler(c));
app.post("/api/slotboard/admin/:adminToken/delete", async (c) => deleteAdminEventHandler(c, "adminToken"));
app.post("/api/slotboard/admin/slots/:slotId/close", async (c) => setAdminSlotStatusHandler(c, "closed"));
app.post("/api/slotboard/admin/:adminToken/slots/:slotId/close", async (c) =>
  setAdminSlotStatusHandler(c, "closed", "adminToken"),
);
app.post("/api/slotboard/admin/slots/:slotId/reopen", async (c) => setAdminSlotStatusHandler(c, "open"));
app.post("/api/slotboard/admin/:adminToken/slots/:slotId/reopen", async (c) =>
  setAdminSlotStatusHandler(c, "open", "adminToken"),
);
app.post("/api/slotboard/admin/bookings/:bookingId/cancel", async (c) => cancelBookingByAdminHandler(c));
app.post("/api/slotboard/admin/:adminToken/bookings/:bookingId/cancel", async (c) =>
  cancelBookingByAdminHandler(c, "adminToken"),
);
app.post("/api/slotboard/admin/bookings/:bookingId/resend-email", async (c) =>
  resendBookingEmailByAdminHandler(c),
);
app.post("/api/slotboard/admin/:adminToken/bookings/:bookingId/resend-email", async (c) =>
  resendBookingEmailByAdminHandler(c, "adminToken"),
);
app.get("/api/slotboard/admin/:adminToken/export.csv", async (c) => exportAdminCsvHandler(c, "adminToken"));

app.get("/api/slotboard/account/events", async (c) => readOrganizerEventsHandler(c));
app.get("/api/slotboard/account/events/:eventId", async (c) => readOrganizerDashboardHandler(c));
app.get("/api/slotboard/account/events/:eventId/activity", async (c) => readOrganizerActivityHandler(c));
app.post("/api/slotboard/account/events/:eventId/public-link/rotate", async (c) =>
  rotateOrganizerPublicLinkHandler(c),
);
app.patch("/api/slotboard/account/events/:eventId", async (c) => updateOrganizerEventHandler(c));
app.post("/api/slotboard/account/events/:eventId/archive", async (c) => archiveOrganizerEventHandler(c));
app.post("/api/slotboard/account/events/:eventId/delete", async (c) => deleteOrganizerEventHandler(c));
app.post("/api/slotboard/account/events/:eventId/slots/:slotId/close", async (c) =>
  setOrganizerSlotStatusHandler(c, "closed"),
);
app.post("/api/slotboard/account/events/:eventId/slots/:slotId/reopen", async (c) =>
  setOrganizerSlotStatusHandler(c, "open"),
);
app.post("/api/slotboard/account/events/:eventId/bookings/:bookingId/cancel", async (c) =>
  cancelBookingByOrganizerHandler(c),
);
app.post("/api/slotboard/account/events/:eventId/bookings/:bookingId/resend-email", async (c) =>
  resendBookingEmailByOrganizerHandler(c),
);
app.get("/api/slotboard/account/events/:eventId/export.csv", async (c) => exportOrganizerCsvHandler(c));
app.get("/api/slotboard/account/exports/bookings.csv", async (c) => exportOrganizerCrossBoardCsvHandler(c));
app.post("/api/slotboard/account/events/:eventId/billing/event-pass/checkout", async (c) =>
  createOrganizerEventPassCheckoutHandler(c),
);

app.post("/api/slotboard/recover", async (c) => {
  try {
    const body = await readJson(c.req);
    const input = toRecoveryInput(body);
    const actorKey = requestActorKey(c.req.raw.headers);
    await assertRateLimit("recover:ip", actorKey, { limit: 5, windowSeconds: 3600 });
    await assertRateLimit("recover:email", input.organizerEmail, { limit: 3, windowSeconds: 3600 });
    return c.json(await recoverAdminLinks(input.organizerEmail), 202);
  } catch (error) {
    return jsonError(c, error);
  }
});
app.post("/api/slotboard/webhooks/email-provider", async (c) => {
  try {
    const rawBody = await c.req.text();
    const result = await handleEmailProviderWebhook({
      rawBody,
      headers: c.req.raw.headers,
    });
    return c.json(result, 200);
  } catch (error) {
    return jsonError(c, error);
  }
});
app.post("/api/slotboard/webhooks/stripe", async (c) => {
  try {
    const rawBody = await c.req.text();
    const result = await handleStripeWebhook({
      rawBody,
      signature: c.req.header("stripe-signature"),
    });
    return c.json(result, 200);
  } catch (error) {
    return jsonError(c, error);
  }
});

async function createEventPassCheckoutHandler(c: Context) {
  try {
    const rawToken = tokenFromRequest(c, { purpose: "admin" });
    await assertRateLimit("billing-event-pass-checkout:ip", requestActorKey(c.req.raw.headers), { limit: 10, windowSeconds: 3600 });
    await assertRateLimit("billing-event-pass-checkout:token", `admin:${tokenHash(rawToken)}`, { limit: 5, windowSeconds: 3600 });
    return c.json(await createEventPassCheckout(rawToken), 201);
  } catch (error) {
    return jsonError(c, error);
  }
}

async function createCompanyStandbyCheckoutHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    await assertRateLimit("billing-company-checkout:user", `user:${session.user.id}`, { limit: 5, windowSeconds: 3600 });
    const body = await readOptionalJson(c.req);
    const billingInterval = companyBillingIntervalFromBody(body);
    return c.json(await createCompanyStandbyCheckout({
      ownerUserId: session.user.id,
      ownerEmail: session.user.email,
      billingInterval,
    }), 201);
  } catch (error) {
    return jsonError(c, error);
  }
}

function companyBillingIntervalFromBody(body: unknown): "month" | "year" | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }
  const value = (body as { billingInterval?: unknown }).billingInterval;
  if (value === undefined || value === "month" || value === "year") {
    return value;
  }
  throw new ApiError(400, "invalid_billing_interval", "billingInterval must be month or year");
}

async function requestMyBoardsLinkHandler(c: Context) {
  try {
    const body = await readJson(c.req);
    const input = toMyBoardsLinkRequestInput(body);
    await assertRateLimit("my-boards-request:ip", requestActorKey(c.req.raw.headers), { limit: 8, windowSeconds: 3600 });
    await assertRateLimit("my-boards-request:email", input.organizerEmail, { limit: 3, windowSeconds: 3600 });
    return c.json(await requestMyBoardsLink(input.organizerEmail), 202);
  } catch (error) {
    return jsonError(c, error);
  }
}

async function readMyBoardsHandler(c: Context) {
  try {
    const rawToken = tokenFromRequest(c, { purpose: "boards" });
    await assertRateLimit("my-boards-read:token", `boards:${tokenHash(rawToken)}`, { limit: 120, windowSeconds: 3600 });
    return c.json(await readMyBoards(rawToken));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function createMyBoardsAdminLinkHandler(c: Context) {
  try {
    const rawToken = tokenFromRequest(c, { purpose: "boards" });
    const eventId = uuidParam(c, "eventId");
    await assertRateLimit("my-boards-admin-link:token", `boards:${tokenHash(rawToken)}`, { limit: 30, windowSeconds: 3600 });
    return c.json(await createMyBoardsAdminLink(rawToken, eventId), 201);
  } catch (error) {
    return jsonError(c, error);
  }
}

async function readOrganizerBillingHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    return c.json(await readOrganizerBilling({
      ownerUserId: session.user.id,
      ownerEmail: session.user.email,
    }));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function createCustomerPortalSessionHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    await assertRateLimit("billing-customer-portal:user", `user:${session.user.id}`, { limit: 10, windowSeconds: 3600 });
    return c.json(await createCustomerPortalSession({
      ownerUserId: session.user.id,
      ownerEmail: session.user.email,
    }), 201);
  } catch (error) {
    return jsonError(c, error);
  }
}

async function readAccountCustomDomainHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    return c.json(await readCustomDomainSettings({
      ownerUserId: session.user.id,
      ownerEmail: session.user.email,
    }));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function requestAccountCustomDomainHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    const body = await readJson(c.req);
    const input = toCustomDomainInput(body);
    await assertRateLimit("account-custom-domain-request:user", `user:${session.user.id}`, { limit: 5, windowSeconds: 3600 });
    return c.json(await requestCustomDomain({
      ownerUserId: session.user.id,
      ownerEmail: session.user.email,
      hostname: input.hostname,
    }), 201);
  } catch (error) {
    return jsonError(c, error);
  }
}

async function verifyAccountCustomDomainHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    await assertRateLimit("account-custom-domain-verify:user", `user:${session.user.id}`, { limit: 20, windowSeconds: 3600 });
    return c.json(await verifyCustomDomain({
      ownerUserId: session.user.id,
      ownerEmail: session.user.email,
    }));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function activateOpsCustomDomainHandler(c: Context) {
  try {
    assertOpsSecret(c.req.raw.headers);
    await assertRateLimit("ops-custom-domain-activate", requestActorKey(c.req.raw.headers), { limit: 20, windowSeconds: 3600 });

    const body = await readJson(c.req);
    const input = toCustomDomainInput(body);
    return c.json({
      ok: true,
      domain: await activateCustomDomain({
        hostname: input.hostname,
      }),
    });
  } catch (error) {
    return jsonError(c, error);
  }
}

async function createOrganizerEventPassCheckoutHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    const eventId = uuidParam(c, "eventId");
    await assertRateLimit("billing-account-event-pass-checkout:user", `user:${session.user.id}`, { limit: 10, windowSeconds: 3600 });
    await assertRateLimit("billing-account-event-pass-checkout:event", `event:${eventId}`, { limit: 5, windowSeconds: 3600 });
    return c.json(await createOrganizerEventPassCheckout({
      ownerUserId: session.user.id,
      eventId,
    }), 201);
  } catch (error) {
    return jsonError(c, error);
  }
}

async function readPublicBoardHandler(c: Context, paramName?: string) {
  try {
    const rawToken = tokenFromRequest(c, { purpose: "public", paramName });
    await assertRateLimit("public:read", requestActorKey(c.req.raw.headers), { limit: 120, windowSeconds: 60 });
    return c.json(await readPublicBoard(rawToken));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function claimSlotHandler(c: Context, paramName?: string) {
  try {
    const rawToken = tokenFromRequest(c, { purpose: "public", paramName });
    await assertRateLimit("public:claim", requestActorKey(c.req.raw.headers), { limit: 20, windowSeconds: 3600 });
    const body = await readJson(c.req);
    const input = toClaimSlotInput(body);
    const response = await runIdempotent({
      routeKey: "slotboard.book.claim",
      actorKey: `public:${tokenHash(rawToken)}`,
      idempotencyKey: idempotencyKeyFromHeaders(c.req.raw.headers),
      requestBody: input,
      run: () => claimSlot(rawToken, input),
    });
    return c.json(response, 201);
  } catch (error) {
    return jsonError(c, error);
  }
}

async function recoverManageLinkHandler(c: Context, paramName?: string) {
  try {
    const rawToken = tokenFromRequest(c, { purpose: "public", paramName });
    const actorKey = requestActorKey(c.req.raw.headers);
    await assertRateLimit("manage-recovery:ip", actorKey, { limit: 10, windowSeconds: 3600 });
    const body = await readJson(c.req);
    const input = toManageLinkRecoveryInput(body);
    await assertRateLimit("manage-recovery:email", input.participantEmail, { limit: 5, windowSeconds: 3600 });
    return c.json(await recoverManageLink(rawToken, input), 202);
  } catch (error) {
    return jsonError(c, error);
  }
}

async function recordProductEventHandler(c: Context) {
  try {
    const actorKey = requestActorKey(c.req.raw.headers);
    await assertRateLimit("product-events", actorKey, { limit: 120, windowSeconds: 60 });
    const body = await readJson(c.req);
    return c.json(await recordProductEvent(toProductEventInput(body), actorKey), 202);
  } catch (error) {
    return jsonError(c, error);
  }
}

async function readManageBookingHandler(c: Context, paramName?: string) {
  try {
    const rawToken = tokenFromRequest(c, { purpose: "manage", paramName });
    return c.json(await readManageBooking(rawToken));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function readManagedCalendarHandler(c: Context, paramName?: string) {
  try {
    const rawToken = tokenFromRequest(c, { purpose: "manage", paramName });
    await assertRateLimit("manage-calendar:token", `manage:${tokenHash(rawToken)}`, { limit: 120, windowSeconds: 3600 });
    const calendar = await readManagedCalendar(rawToken);
    return c.text(calendar.content, 200, {
      "Content-Disposition": `attachment; filename="${calendar.filename}"`,
      "Content-Type": calendar.contentType,
    });
  } catch (error) {
    return jsonError(c, error);
  }
}

async function resendManagedBookingEmailHandler(c: Context, paramName?: string) {
  try {
    const rawToken = tokenFromRequest(c, { purpose: "manage", paramName });
    await assertRateLimit("manage-resend-email:ip", requestActorKey(c.req.raw.headers), { limit: 20, windowSeconds: 3600 });
    await assertRateLimit("manage-resend-email:token", `manage:${tokenHash(rawToken)}`, { limit: 5, windowSeconds: 3600 });
    return c.json(await resendManagedBookingEmail(rawToken), 202);
  } catch (error) {
    return jsonError(c, error);
  }
}

async function cancelManagedBookingHandler(c: Context, paramName?: string) {
  try {
    const rawToken = tokenFromRequest(c, { purpose: "manage", paramName });
    const body = await readOptionalJson(c.req);
    return c.json(await cancelManagedBooking(rawToken, toCancelBookingInput(body)));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function readAdminDashboardHandler(c: Context, paramName?: string) {
  try {
    const rawToken = tokenFromRequest(c, { purpose: "admin", paramName });
    return c.json(await readAdminDashboard(rawToken));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function readAdminActivityHandler(c: Context, paramName?: string) {
  try {
    const rawToken = tokenFromRequest(c, { purpose: "admin", paramName });
    return c.json(await readAdminActivity(rawToken));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function rotateAdminPublicLinkHandler(c: Context, paramName?: string) {
  try {
    const rawToken = tokenFromRequest(c, { purpose: "admin", paramName });
    return c.json(await rotateAdminPublicLink(rawToken));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function updateAdminEventHandler(c: Context, paramName?: string) {
  try {
    const rawToken = tokenFromRequest(c, { purpose: "admin", paramName });
    const body = await readJson(c.req);
    return c.json(await updateAdminEvent(rawToken, toUpdateEventInput(body)));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function archiveAdminEventHandler(c: Context, paramName?: string) {
  try {
    const rawToken = tokenFromRequest(c, { purpose: "admin", paramName });
    return c.json(await archiveAdminEvent(rawToken));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function deleteAdminEventHandler(c: Context, paramName?: string) {
  try {
    const rawToken = tokenFromRequest(c, { purpose: "admin", paramName });
    return c.json(await deleteAdminEvent(rawToken));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function setAdminSlotStatusHandler(c: Context, status: "open" | "closed", paramName?: string) {
  try {
    const rawToken = tokenFromRequest(c, { purpose: "admin", paramName });
    const slotId = uuidParam(c, "slotId");
    return c.json(await setAdminSlotStatus(rawToken, slotId, status));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function cancelBookingByAdminHandler(c: Context, paramName?: string) {
  try {
    const rawToken = tokenFromRequest(c, { purpose: "admin", paramName });
    const bookingId = uuidParam(c, "bookingId");
    const body = await readOptionalJson(c.req);
    return c.json(await cancelBookingByAdmin(rawToken, bookingId, toCancelBookingInput(body)));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function resendBookingEmailByAdminHandler(c: Context, paramName?: string) {
  try {
    const rawToken = tokenFromRequest(c, { purpose: "admin", paramName });
    const bookingId = uuidParam(c, "bookingId");
    await assertRateLimit("admin-resend-booking-email:ip", requestActorKey(c.req.raw.headers), { limit: 20, windowSeconds: 3600 });
    await assertRateLimit("admin-resend-booking-email:token", `admin:${tokenHash(rawToken)}`, { limit: 10, windowSeconds: 3600 });
    return c.json(await resendBookingEmailByAdmin(rawToken, bookingId), 202);
  } catch (error) {
    return jsonError(c, error);
  }
}

async function exportAdminCsvHandler(c: Context, paramName?: string) {
  try {
    const rawToken = tokenFromRequest(c, { purpose: "admin", paramName });
    await assertRateLimit("admin-export-csv:token", `admin:${tokenHash(rawToken)}`, { limit: 30, windowSeconds: 3600 });
    const csv = await exportAdminCsv(rawToken);
    return c.text(csv, 200, {
      "Content-Disposition": 'attachment; filename="slotboard-bookings.csv"',
      "Content-Type": "text/csv; charset=utf-8",
    });
  } catch (error) {
    return jsonError(c, error);
  }
}

async function readOrganizerEventsHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    return c.json(await readOrganizerEvents(session.user.id));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function readOrganizerDashboardHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    const eventId = uuidParam(c, "eventId");
    return c.json(await readOrganizerDashboard(session.user.id, eventId));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function readOrganizerActivityHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    const eventId = uuidParam(c, "eventId");
    return c.json(await readOrganizerActivity(session.user.id, eventId));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function rotateOrganizerPublicLinkHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    const eventId = uuidParam(c, "eventId");
    return c.json(await rotateOrganizerPublicLink(session.user.id, eventId));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function updateOrganizerEventHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    const eventId = uuidParam(c, "eventId");
    const body = await readJson(c.req);
    return c.json(await updateOrganizerEvent(session.user.id, eventId, toUpdateEventInput(body)));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function archiveOrganizerEventHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    const eventId = uuidParam(c, "eventId");
    return c.json(await archiveOrganizerEvent(session.user.id, eventId));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function deleteOrganizerEventHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    const eventId = uuidParam(c, "eventId");
    return c.json(await deleteOrganizerEvent(session.user.id, eventId));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function setOrganizerSlotStatusHandler(c: Context, status: "open" | "closed") {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    const eventId = uuidParam(c, "eventId");
    const slotId = uuidParam(c, "slotId");
    return c.json(await setOrganizerSlotStatus(session.user.id, eventId, slotId, status));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function cancelBookingByOrganizerHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    const eventId = uuidParam(c, "eventId");
    const bookingId = uuidParam(c, "bookingId");
    const body = await readOptionalJson(c.req);
    return c.json(await cancelBookingByOrganizer(session.user.id, eventId, bookingId, toCancelBookingInput(body)));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function resendBookingEmailByOrganizerHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    const eventId = uuidParam(c, "eventId");
    const bookingId = uuidParam(c, "bookingId");
    await assertRateLimit("account-resend-booking-email:ip", requestActorKey(c.req.raw.headers), { limit: 20, windowSeconds: 3600 });
    await assertRateLimit("account-resend-booking-email:user", `user:${session.user.id}`, { limit: 20, windowSeconds: 3600 });
    return c.json(await resendBookingEmailByOrganizer(session.user.id, eventId, bookingId), 202);
  } catch (error) {
    return jsonError(c, error);
  }
}

async function exportOrganizerCsvHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    const eventId = uuidParam(c, "eventId");
    await assertRateLimit("account-export-csv:user", `user:${session.user.id}`, { limit: 60, windowSeconds: 3600 });
    const csv = await exportOrganizerCsv(session.user.id, eventId);
    return c.text(csv, 200, {
      "Content-Disposition": 'attachment; filename="slotboard-bookings.csv"',
      "Content-Type": "text/csv; charset=utf-8",
    });
  } catch (error) {
    return jsonError(c, error);
  }
}

async function exportOrganizerCrossBoardCsvHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    await assertRateLimit("account-cross-board-export-csv:user", `user:${session.user.id}`, { limit: 30, windowSeconds: 3600 });
    const csv = await exportOrganizerCrossBoardCsv({
      ownerUserId: session.user.id,
      ownerEmail: session.user.email,
    });
    return c.text(csv, 200, {
      "Content-Disposition": 'attachment; filename="mytimes-cross-board-bookings.csv"',
      "Content-Type": "text/csv; charset=utf-8",
    });
  } catch (error) {
    return jsonError(c, error);
  }
}

async function optionalOrganizerSession(headers: Headers) {
  if (!headers.get("cookie")) {
    return null;
  }
  return getOrganizerSession(headers);
}

function safeGenerateAvailabilitySlots(input: Parameters<typeof generateAvailabilitySlots>[0]) {
  try {
    return generateAvailabilitySlots(input);
  } catch (error) {
    throw new ApiError(
      400,
      "invalid_availability",
      error instanceof Error ? error.message : "Invalid availability input",
    );
  }
}

async function readJson(req: { json: () => Promise<unknown> }): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
  }
}

async function readOptionalJson(req: { json: () => Promise<unknown>; header: (name: string) => string | undefined }): Promise<unknown> {
  const contentType = req.header("content-type");
  if (!contentType) {
    return undefined;
  }
  return readJson(req);
}

function uuidParam(c: Context, name: string): string {
  const value = c.req.param(name);
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError(400, "invalid_request", `${name} must be a UUID`);
  }
  return value;
}

function jsonError(c: Parameters<Handler>[0], error: unknown) {
  const response = toErrorResponse(error);
  if (response.status >= 500) {
    logError(
      "slotboard_request_error",
      {
        method: c.req.method,
        path: sanitizeRequestPath(c.req.path),
        status: response.status,
      },
      error,
    );
  }
  if (response.status === 400) {
    return c.json(response.body, 400);
  }
  if (response.status === 401) {
    return c.json(response.body, 401);
  }
  if (response.status === 402) {
    return c.json(response.body, 402);
  }
  if (response.status === 404) {
    return c.json(response.body, 404);
  }
  if (response.status === 409) {
    return c.json(response.body, 409);
  }
  if (response.status === 429) {
    return c.json(response.body, 429);
  }
  if (response.status === 501) {
    return c.json(response.body, 501);
  }
  return c.json(response.body, 500);
}

async function corsOrigin(origin: string): Promise<string | null> {
  if (env.webOrigins.includes(origin)) {
    return origin;
  }

  try {
    return (await isActiveCustomDomainOrigin(origin)) ? origin : null;
  } catch (error) {
    logError("slotboard_cors_custom_domain_check_failed", { origin }, error);
    return null;
  }
}

function assertOpsSecret(headers: Headers): void {
  if (!env.opsSecret) {
    throw new ApiError(501, "ops_secret_not_configured", "SLOTBOARD_OPS_SECRET is required for this operation");
  }

  const provided = opsSecretFromRequest(headers);
  if (!provided || !safeEqual(provided, env.opsSecret)) {
    throw new ApiError(401, "unauthorized", "A valid ops secret is required");
  }
}

function opsSecretFromRequest(headers: Headers): string | undefined {
  const authorization = headers.get("authorization")?.trim();
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }
  return headers.get("x-slotboard-ops-secret")?.trim() || undefined;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function requestIdFromHeaders(headers: Headers): string {
  const value = headers.get("x-request-id")?.trim();
  return value && value.length <= 128 ? value : crypto.randomUUID();
}

export type SlotsApiApp = typeof app;
