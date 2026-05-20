const baseURL = process.env.SLOTBOARD_API_URL || "http://127.0.0.1:3014";
const frontendOrigin = process.env.SLOTBOARD_WEB_ORIGIN || "http://127.0.0.1:5174";
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const smokeIp = process.env.SMOKE_ACTOR_IP || `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
const ownerJar = new Map();
const otherJar = new Map();
const authSecret =
  process.env.SLOTBOARD_AUTH_SECRET ||
  process.env.BETTER_AUTH_SECRET ||
  (isLocalURL(baseURL) ? "dev-better-auth-secret-replace-before-production" : undefined);
const { createEmailVerificationToken } = await import("../apps/slots-api/node_modules/better-auth/dist/api/index.mjs");

await request("/healthz");
await request("/readyz");

const ownerEmail = `owner+${suffix}@example.com`;
await authRequest("/api/auth/sign-up/email", {
  method: "POST",
  jar: ownerJar,
  json: {
    name: "Auth Smoke Owner",
    email: ownerEmail,
    password: `AuthSmoke!${suffix}`,
    callbackURL: `${frontendOrigin}/verify-email`,
  },
});
assert(ownerJar.size === 0, "expected sign-up to wait for email verification before creating a session");

const ownerVerificationToken = await createSmokeVerificationToken(ownerEmail);
const ownerVerified = await authRequest(`/api/auth/verify-email?token=${encodeURIComponent(ownerVerificationToken)}`, {
  jar: ownerJar,
});
assert(ownerVerified.status === true, "expected owner email verification to succeed");
assert(ownerJar.size > 0, "expected email verification to set a session cookie");

const session = await authRequest("/api/auth/get-session", {
  jar: ownerJar,
});
assert(session?.user?.email === ownerEmail, "expected get-session to return the signed-in owner");
assert(session?.user?.emailVerified === true, "expected signed-in owner to be email verified");

const accountBilling = await request("/api/slotboard/billing/account", {
  jar: ownerJar,
});
assert(accountBilling.customer?.provider === "stripe", "expected account billing provider to be stripe");
assert(accountBilling.customer.exists === false, "expected new smoke owner to have no Stripe customer");
assert(accountBilling.canOpenPortal === false, "expected smoke owner without a customer to have no portal access");

const customDomain = await request("/api/slotboard/account/custom-domain", {
  jar: ownerJar,
});
assert(customDomain.eligible === false, "expected new smoke owner to be ineligible for custom domains");
assert(
  customDomain.reason === "company_standby_required",
  `expected custom domain lock reason to be company_standby_required, got ${customDomain.reason}`,
);
const lockedCustomDomain = await request("/api/slotboard/account/custom-domain", {
  method: "POST",
  jar: ownerJar,
  expectedStatus: 402,
  json: {
    hostname: "book.example.com",
  },
});
assert(
  lockedCustomDomain.error === "company_standby_required",
  `expected custom domain request to require Company, got ${lockedCustomDomain.error}`,
);

const slotDate = isoDateAfterDays(16);
const slotWeekday = new Date(`${slotDate}T00:00:00.000Z`).getUTCDay();
const created = await request("/api/slotboard/events", {
  method: "POST",
  jar: ownerJar,
  expectedStatus: 201,
  json: {
    title: `Auth Smoke Board ${suffix}`,
    description: "Automated account-auth smoke test.",
    organizerName: "Auth Smoke Owner",
    organizerEmail: ownerEmail,
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

const publicToken = tokenFromLink(created.links.public);
const ownedEvents = await request("/api/slotboard/account/events", {
  jar: ownerJar,
});
assert(
  ownedEvents.events.some((item) => item.event.id === created.event.id),
  "expected account event list to include the board created while signed in",
);

const recoveredAdminLinks = await request("/api/slotboard/recover", {
  method: "POST",
  expectedStatus: 202,
  json: {
    organizerEmail: ownerEmail,
  },
});
assert(recoveredAdminLinks.ok === true, "expected admin link recovery to accept the board owner email");

const ownerDashboard = await request(`/api/slotboard/account/events/${created.event.id}`, {
  jar: ownerJar,
});
assert(ownerDashboard.slots.length === 1, `expected one owned dashboard slot, got ${ownerDashboard.slots.length}`);
const slotId = ownerDashboard.slots[0].id;

await request(`/api/slotboard/account/events/${created.event.id}/slots/${slotId}/close`, {
  method: "POST",
  jar: ownerJar,
  origin: "https://evil.example",
  expectedStatus: 403,
});

await request(`/api/slotboard/account/events/${created.event.id}`, {
  method: "PATCH",
  jar: ownerJar,
  json: {
    title: `Auth Smoke Board Updated ${suffix}`,
  },
});

await request(`/api/slotboard/account/events/${created.event.id}/slots/${slotId}/close`, {
  method: "POST",
  jar: ownerJar,
});
const closedPublicBoard = await request("/api/slotboard/book", {
  token: publicToken,
});
assert(closedPublicBoard.slots.length === 0, "expected account-owned close to hide the public slot");

await request(`/api/slotboard/account/events/${created.event.id}/slots/${slotId}/reopen`, {
  method: "POST",
  jar: ownerJar,
});

const claimed = await request("/api/slotboard/book/claim", {
  method: "POST",
  token: publicToken,
  expectedStatus: 201,
  json: {
    slotId,
    participantName: "Auth Smoke Participant",
    participantEmail: `auth-participant+${suffix}@example.com`,
    notes: "Account-auth cancellation path.",
  },
});

const accountResent = await request(
  `/api/slotboard/account/events/${created.event.id}/bookings/${claimed.booking.id}/resend-email`,
  {
    method: "POST",
    jar: ownerJar,
    expectedStatus: 202,
  },
);
assert(
  accountResent.delivery.status === "sent" && accountResent.delivery.emailType === "booking_confirmation",
  `expected account resend to log booking_confirmation sent, got ${accountResent.delivery.emailType}:${accountResent.delivery.status}`,
);
const accountResentManage = await request("/api/slotboard/manage", {
  token: tokenFromLink(accountResent.links.manage),
});
assert(
  accountResentManage.booking.id === claimed.booking.id,
  "expected account resend to issue a fresh manage link for the same booking",
);

const exported = await requestText(`/api/slotboard/account/events/${created.event.id}/export.csv`, {
  jar: ownerJar,
});
assert(exported.includes("event_id,event_title"), "expected free account CSV export to return a CSV header");

const crossBoardExport = await requestText("/api/slotboard/account/exports/bookings.csv", {
  jar: ownerJar,
  expectedStatus: 402,
});
assert(
  crossBoardExport.includes("cross_board_csv_requires_company"),
  "expected cross-board CSV export to require Company",
);

await request(`/api/slotboard/account/events/${created.event.id}/bookings/${claimed.booking.id}/cancel`, {
  method: "POST",
  jar: ownerJar,
  json: {
    reason: "Account-auth smoke cancellation.",
  },
});

await authRequest("/api/auth/sign-up/email", {
  method: "POST",
  jar: otherJar,
  json: {
    name: "Auth Smoke Other",
    email: `other+${suffix}@example.com`,
    password: `AuthSmokeOther!${suffix}`,
    callbackURL: `${frontendOrigin}/verify-email`,
  },
});
const otherEmail = `other+${suffix}@example.com`;
const otherVerificationToken = await createSmokeVerificationToken(otherEmail);
await authRequest(`/api/auth/verify-email?token=${encodeURIComponent(otherVerificationToken)}`, {
  jar: otherJar,
});
await request(`/api/slotboard/account/events/${created.event.id}`, {
  jar: otherJar,
  expectedStatus: 404,
});
await request("/api/slotboard/admin", {
  jar: ownerJar,
  expectedStatus: 401,
});

const archived = await request(`/api/slotboard/account/events/${created.event.id}/archive`, {
  method: "POST",
  jar: ownerJar,
});
assert(archived.event.status === "archived", `expected archived event, got ${archived.event.status}`);

const archivedPublic = await request("/api/slotboard/book", {
  token: publicToken,
});
assert(archivedPublic.event.status === "archived", "expected public board to reflect account archive");
assert(archivedPublic.slots.length === 0, "expected archived account board to hide slots");

console.log(
  JSON.stringify(
    {
      ok: true,
      baseURL,
      checked: [
        "better-auth-sign-up",
        "better-auth-email-verification",
        "better-auth-session",
        "account-billing-summary",
        "account-custom-domain-lock",
        "authenticated-create-ownership",
        "account-event-list",
        "admin-link-recovery",
        "account-dashboard",
        "account-csrf-origin-rejection",
        "account-update",
        "account-close-slot",
        "account-reopen-slot",
        "account-resend-booking-email",
        "account-csv-export-paywall",
        "account-cancel-booking",
        "cross-account-denial",
        "cookie-does-not-replace-admin-token",
        "account-archive",
      ],
    },
    null,
    2,
  ),
);

async function authRequest(path, options = {}) {
  return request(path, {
    ...options,
    origin: frontendOrigin,
    includeCredentials: true,
  });
}

async function request(path, options = {}) {
  const response = await fetch(`${baseURL}${path}`, {
    method: options.method || "GET",
    headers: headers(options),
    body: options.json === undefined ? undefined : JSON.stringify(options.json),
  });
  if (options.jar) {
    storeSetCookies(options.jar, response.headers);
  }
  const expectedStatus = options.expectedStatus || 200;
  const text = await response.text();

  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}, expected ${expectedStatus}: ${text}`);
  }

  return text ? JSON.parse(text) : undefined;
}

async function requestText(path, options = {}) {
  const response = await fetch(`${baseURL}${path}`, {
    method: options.method || "GET",
    headers: headers(options),
  });
  if (options.jar) {
    storeSetCookies(options.jar, response.headers);
  }
  const text = await response.text();
  const expectedStatus = options.expectedStatus || 200;
  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}, expected ${expectedStatus}: ${text}`);
  }
  return text;
}

function headers(options) {
  const result = {
    "x-forwarded-for": smokeIp,
    "x-slotboard-smoke-actor": process.env.SMOKE_ACTOR_KEY || `auth-smoke-${suffix}`,
  };
  if (options.json !== undefined) {
    result["content-type"] = "application/json";
  }
  const method = options.method || "GET";
  if (options.origin) {
    result.origin = options.origin;
  } else if (options.jar?.size && method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    result.origin = frontendOrigin;
  }
  if (options.token) {
    result.authorization = `Bearer ${options.token}`;
  }
  if (options.jar?.size) {
    result.cookie = [...options.jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }
  return result;
}

function storeSetCookies(jar, headers) {
  for (const cookie of setCookieHeaders(headers)) {
    const [pair] = cookie.split(";");
    const separator = pair.indexOf("=");
    if (separator < 1) {
      continue;
    }
    jar.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

function setCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const value = headers.get("set-cookie");
  return value ? value.split(/,(?=[^;,]+=)/g) : [];
}

async function createSmokeVerificationToken(email) {
  if (!authSecret) {
    throw new Error("smoke:auth needs SLOTBOARD_AUTH_SECRET or BETTER_AUTH_SECRET when run against a non-local API.");
  }
  return createEmailVerificationToken(authSecret, email, undefined, 3600);
}

function isLocalURL(value) {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
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
