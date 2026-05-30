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
import { createContactLead } from "./contact.js";
import {
  activateCustomDomain,
  isActiveCustomDomainOrigin,
  readCustomDomainSettings,
  requestCustomDomain,
  verifyCustomDomain,
} from "./customDomains.js";
import { sendEmailDesignTestBatch, sendOperationalTestEmail } from "./email.js";
import { handleEmailProviderWebhook } from "./emailWebhooks.js";
import { customDomainReadiness, emailReadiness, loadEnv, notificationReadiness, observabilityReadiness } from "./env.js";
import { createEvent } from "./events.js";
import { createEventTemplateFromEvent, readAccountTemplates } from "./eventTemplates.js";
import { ApiError, toErrorResponse } from "./errors.js";
import { idempotencyKeyFromHeaders, runIdempotent } from "./idempotency.js";
import { logError, logInfo, sanitizeRequestPath } from "./logger.js";
import { captureException, flushObservability } from "./observability.js";
import { createMyBoardsAdminLink, readMyBoards, requestMyBoardsLink } from "./myBoards.js";
import {
  createAccountNotificationIntegration,
  disableAccountNotificationIntegration,
  readAccountNotificationIntegrations,
  testAccountNotificationIntegration,
} from "./notificationIntegrations.js";
import { inviteOrganizationMember, readAccountWorkspace } from "./organizations.js";
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
  readManagedRescheduleOptions,
  readManageBooking,
  readPublicBoard,
  recoverAdminLinks,
  recoverManageLink,
  rescheduleManagedBooking,
  resendBookingEmailByAdmin,
  resendBookingEmailByOrganizer,
  resendManagedBookingEmail,
  rotateAdminPrivateLink,
  rotateAdminPublicLink,
  rotateOrganizerPrivateLink,
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
  toContactLeadInput,
  toCustomDomainInput,
  toCreateEventInput,
  toEmailDesignTestInput,
  toEmailTestInput,
  toManageLinkRecoveryInput,
  toMyBoardsLinkRequestInput,
  toNotificationIntegrationInput,
  toProductEventInput,
  toRecoveryInput,
  toRescheduleBookingInput,
  toWorkspaceInviteInput,
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

app.use("/api/slotboard/account/*", async (c, next) => {
  try {
    assertTrustedCookieOriginForUnsafeRequest(c);
    await next();
  } catch (error) {
    return jsonError(c, error);
  }
});

app.use("/api/slotboard/billing/company-standby/checkout", async (c, next) => {
  try {
    assertTrustedCookieOriginForUnsafeRequest(c);
    await next();
  } catch (error) {
    return jsonError(c, error);
  }
});

app.use("/api/slotboard/billing/customer-portal", async (c, next) => {
  try {
    assertTrustedCookieOriginForUnsafeRequest(c);
    await next();
  } catch (error) {
    return jsonError(c, error);
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
      notifications: notificationReadiness(env),
      observability: observabilityReadiness(env),
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

app.get("/api/slotboard/ops/notification-readiness", (c) =>
  c.json({
    ok: true,
    notifications: notificationReadiness(env),
  }),
);

app.get("/api/slotboard/ops/observability-readiness", (c) =>
  c.json({
    ok: true,
    observability: observabilityReadiness(env),
  }),
);

app.post("/api/slotboard/ops/observability-test", async (c) => {
  try {
    assertOpsSecret(c.req.raw.headers);

    const readiness = observabilityReadiness(env);
    if (!readiness.productionReady) {
      throw new ApiError(
        409,
        "observability_not_configured",
        readiness.issues[0] ?? "Production error tracking is not configured",
      );
    }

    await assertRateLimit("ops-observability-test", requestActorKey(c.req.raw.headers), { limit: 5, windowSeconds: 3600 });

    captureException(new Error("mytimes observability test event"), {
      method: "POST",
      path: "/api/slotboard/ops/observability-test",
      status: 200,
      source: "ops_observability_test",
    });
    await flushObservability();
    return c.json({
      ok: true,
      observability: readiness,
      event: {
        status: "sent",
      },
    });
  } catch (error) {
    return jsonError(c, error);
  }
});

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

app.post("/api/slotboard/contact", async (c) => createContactLeadHandler(c));

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
app.get("/api/slotboard/account/workspace", async (c) => readAccountWorkspaceHandler(c));
app.post("/api/slotboard/account/workspace/invites", async (c) => inviteWorkspaceMemberHandler(c));
app.get("/api/slotboard/account/notification-integrations", async (c) => readAccountNotificationIntegrationsHandler(c));
app.post("/api/slotboard/account/notification-integrations", async (c) => createAccountNotificationIntegrationHandler(c));
app.post("/api/slotboard/account/notification-integrations/:integrationId/test", async (c) => testAccountNotificationIntegrationHandler(c));
app.post("/api/slotboard/account/notification-integrations/:integrationId/disable", async (c) => disableAccountNotificationIntegrationHandler(c));
app.get("/api/slotboard/account/templates", async (c) => readAccountTemplatesHandler(c));
app.post("/api/slotboard/my-boards/request", async (c) => requestMyBoardsLinkHandler(c));
app.get("/api/slotboard/my-boards", async (c) => readMyBoardsHandler(c));
app.post("/api/slotboard/my-boards/:eventId/admin-link", async (c) => createMyBoardsAdminLinkHandler(c));
app.post("/api/slotboard/billing/customer-portal", async (c) => createCustomerPortalSessionHandler(c));

app.get("/api/slotboard/manage", async (c) => readManageBookingHandler(c));
app.get("/api/slotboard/manage/calendar.ics", async (c) => readManagedCalendarHandler(c));
app.get("/api/slotboard/manage/:manageToken/calendar.ics", async (c) =>
  readManagedCalendarHandler(c, "manageToken"),
);
app.get("/api/slotboard/manage/reschedule", async (c) => readManagedRescheduleOptionsHandler(c));
app.get("/api/slotboard/manage/:manageToken/reschedule", async (c) =>
  readManagedRescheduleOptionsHandler(c, "manageToken"),
);
app.get("/api/slotboard/manage/:manageToken", async (c) => readManageBookingHandler(c, "manageToken"));
app.post("/api/slotboard/manage/resend-email", async (c) => resendManagedBookingEmailHandler(c));
app.post("/api/slotboard/manage/:manageToken/resend-email", async (c) =>
  resendManagedBookingEmailHandler(c, "manageToken"),
);
app.post("/api/slotboard/manage/reschedule", async (c) => rescheduleManagedBookingHandler(c));
app.post("/api/slotboard/manage/:manageToken/reschedule", async (c) =>
  rescheduleManagedBookingHandler(c, "manageToken"),
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
app.post("/api/slotboard/admin/rotate", async (c) => rotateAdminPrivateLinkHandler(c));
app.post("/api/slotboard/admin/:adminToken/rotate", async (c) =>
  rotateAdminPrivateLinkHandler(c, "adminToken"),
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
app.post("/api/slotboard/account/events/:eventId/admin-link/rotate", async (c) =>
  rotateOrganizerPrivateLinkHandler(c),
);
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
app.post("/api/slotboard/account/events/:eventId/template", async (c) =>
  createEventTemplateFromEventHandler(c),
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

async function createContactLeadHandler(c: Context) {
  try {
    const body = await readJson(c.req);
    const input = toContactLeadInput(body);
    const actorKey = requestActorKey(c.req.raw.headers);
    await assertRateLimit("contact:ip", actorKey, { limit: 8, windowSeconds: 3600 });
    if (input.website) {
      return c.json({
        ok: true,
        lead: {
          status: "received",
        },
      }, 202);
    }
    await assertRateLimit("contact:email", input.email, { limit: 4, windowSeconds: 3600 });
    const result = await createContactLead(input, {
      actorKey,
      userAgent: c.req.raw.headers.get("user-agent") ?? undefined,
    });
    return c.json({
      ok: true,
      lead: result.lead,
    }, 202);
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
    const adminToken = input.suppressSourceEmails
      ? c.req.header("x-mytimes-admin-token")?.trim()
      : undefined;
    const response = await runIdempotent({
      routeKey: "slotboard.book.claim",
      actorKey: `public:${tokenHash(rawToken)}`,
      idempotencyKey: idempotencyKeyFromHeaders(c.req.raw.headers),
      requestBody: input,
      run: () => claimSlot(rawToken, input, { adminToken }),
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

async function readManagedRescheduleOptionsHandler(c: Context, paramName?: string) {
  try {
    const rawToken = tokenFromRequest(c, { purpose: "manage", paramName });
    await assertRateLimit("manage-reschedule-options:token", `manage:${tokenHash(rawToken)}`, { limit: 120, windowSeconds: 3600 });
    return c.json(await readManagedRescheduleOptions(rawToken));
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

async function rescheduleManagedBookingHandler(c: Context, paramName?: string) {
  try {
    const rawToken = tokenFromRequest(c, { purpose: "manage", paramName });
    await assertRateLimit("manage-reschedule:ip", requestActorKey(c.req.raw.headers), { limit: 30, windowSeconds: 3600 });
    await assertRateLimit("manage-reschedule:token", `manage:${tokenHash(rawToken)}`, { limit: 10, windowSeconds: 3600 });
    const body = await readJson(c.req);
    const input = toRescheduleBookingInput(body);
    const response = await runIdempotent({
      routeKey: "slotboard.manage.reschedule",
      actorKey: `manage:${tokenHash(rawToken)}`,
      idempotencyKey: idempotencyKeyFromHeaders(c.req.raw.headers),
      requestBody: input,
      run: () => rescheduleManagedBooking(rawToken, input),
    });
    return c.json(response);
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

async function rotateAdminPrivateLinkHandler(c: Context, paramName?: string) {
  try {
    const rawToken = tokenFromRequest(c, { purpose: "admin", paramName });
    await assertRateLimit("admin-rotate-private:ip", requestActorKey(c.req.raw.headers), { limit: 10, windowSeconds: 3600 });
    await assertRateLimit("admin-rotate-private:token", `admin:${tokenHash(rawToken)}`, { limit: 5, windowSeconds: 3600 });
    return c.json(await rotateAdminPrivateLink(rawToken), 202);
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

async function readAccountWorkspaceHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    return c.json(await readAccountWorkspace(getPool(), {
      userId: session.user.id,
      email: session.user.email,
    }));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function inviteWorkspaceMemberHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    await assertRateLimit("account-workspace-invite:user", `user:${session.user.id}`, { limit: 20, windowSeconds: 3600 });
    const input = toWorkspaceInviteInput(await readJson(c.req));
    return c.json(await inviteOrganizationMember(getPool(), {
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      email: input.email,
      role: input.role,
    }), 201);
  } catch (error) {
    return jsonError(c, error);
  }
}

async function readAccountNotificationIntegrationsHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    return c.json(await readAccountNotificationIntegrations({
      userId: session.user.id,
      email: session.user.email,
    }));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function createAccountNotificationIntegrationHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    await assertRateLimit("account-notification-integration-create:user", `user:${session.user.id}`, { limit: 20, windowSeconds: 3600 });
    const input = toNotificationIntegrationInput(await readJson(c.req));
    return c.json(await createAccountNotificationIntegration({
      userId: session.user.id,
      email: session.user.email,
      integration: input,
    }), 201);
  } catch (error) {
    return jsonError(c, error);
  }
}

async function testAccountNotificationIntegrationHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    const integrationId = uuidParam(c, "integrationId");
    await assertRateLimit("account-notification-integration-test:user", `user:${session.user.id}`, { limit: 20, windowSeconds: 3600 });
    return c.json(await testAccountNotificationIntegration({
      userId: session.user.id,
      email: session.user.email,
      integrationId,
    }));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function disableAccountNotificationIntegrationHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    const integrationId = uuidParam(c, "integrationId");
    return c.json(await disableAccountNotificationIntegration({
      userId: session.user.id,
      email: session.user.email,
      integrationId,
    }));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function readAccountTemplatesHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    return c.json(await readAccountTemplates({
      userId: session.user.id,
      email: session.user.email,
    }));
  } catch (error) {
    return jsonError(c, error);
  }
}

async function createEventTemplateFromEventHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    const eventId = uuidParam(c, "eventId");
    await assertRateLimit("account-template-create:user", `user:${session.user.id}`, { limit: 30, windowSeconds: 3600 });
    const body = await readOptionalJson(c.req);
    const name = templateNameFromBody(body);
    return c.json(await createEventTemplateFromEvent({
      userId: session.user.id,
      email: session.user.email,
      eventId,
      name,
    }), 201);
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

async function rotateOrganizerPrivateLinkHandler(c: Context) {
  try {
    const session = await requireOrganizerSession(c.req.raw.headers);
    const eventId = uuidParam(c, "eventId");
    await assertRateLimit("account-admin-link-rotate:user", `user:${session.user.id}`, { limit: 10, windowSeconds: 3600 });
    await assertRateLimit("account-admin-link-rotate:event", `event:${eventId}`, { limit: 5, windowSeconds: 3600 });
    return c.json(await rotateOrganizerPrivateLink(session.user.id, eventId), 202);
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

function templateNameFromBody(body: unknown): string | undefined {
  if (body === undefined || body === null) {
    return undefined;
  }
  if (typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "invalid_template", "Request body must be an object");
  }
  const value = (body as { name?: unknown }).name;
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_template", "Template name must be a string");
  }
  return value;
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
    captureException(error, {
      method: c.req.method,
      path: c.req.path,
      status: response.status,
    });
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
  if (response.status === 403) {
    return c.json(response.body, 403);
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

function assertTrustedCookieOriginForUnsafeRequest(c: Context): void {
  if (isSafeMethod(c.req.method) || !c.req.raw.headers.get("cookie")) {
    return;
  }
  const origin = originFromHeaders(c.req.raw.headers);
  if (!origin) {
    throw new ApiError(403, "csrf_origin_missing", "A trusted Origin or Referer header is required");
  }
  if (!trustedAccountOrigins().has(origin)) {
    throw new ApiError(403, "csrf_origin_untrusted", "This account request came from an untrusted origin");
  }
}

function isSafeMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function originFromHeaders(headers: Headers): string | undefined {
  const source = headers.get("origin") || headers.get("referer");
  if (!source || source === "null") {
    return undefined;
  }
  try {
    return new URL(source).origin.toLowerCase();
  } catch {
    return undefined;
  }
}

function trustedAccountOrigins(): Set<string> {
  return new Set(
    [env.publicAppURL, env.authBaseURL, ...env.webOrigins]
      .flatMap((value) => [value, wwwOriginVariant(value)])
      .map((value) => normalizeOrigin(value))
      .filter((value): value is string => Boolean(value)),
  );
}

function wwwOriginVariant(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) {
      return undefined;
    }
    url.hostname = url.hostname.startsWith("www.") ? url.hostname.slice(4) : `www.${url.hostname}`;
    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizeOrigin(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return undefined;
  }
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
