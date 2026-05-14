const baseURL = stripTrailingSlash(process.env.SLOTBOARD_API_URL || "https://mytimes.co");
const frontendOrigin = stripTrailingSlash(process.env.SLOTBOARD_WEB_ORIGIN || baseURL);
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const smokeOrganizerEmail = process.env.SLOTBOARD_SMOKE_ORGANIZER_EMAIL;
const smokeOrganizerPassword = process.env.SLOTBOARD_SMOKE_ORGANIZER_PASSWORD;
const authSecret =
  process.env.SLOTBOARD_AUTH_SECRET ||
  process.env.BETTER_AUTH_SECRET ||
  (isLocalURL(baseURL) ? "dev-better-auth-secret-replace-before-production" : undefined);
const jar = new Map();
let adminToken;

try {
  await request("/healthz");
  await request("/readyz");

  const created = await createBoard();
  adminToken = tokenFromLink(created.links.admin);
  const publicToken = tokenFromLink(created.links.public);

  const eventPass = await request("/api/slotboard/billing/event-pass/checkout", {
    method: "POST",
    token: adminToken,
    expectedStatus: 201,
  });
  assertCheckout(eventPass, {
    mode: "payment",
    productKey: "event_pass",
  });

  const pendingBoard = await request("/api/slotboard/book", { token: publicToken });
  assert(
    pendingBoard.slots.length === 0,
    `expected pending Event Pass board to hide public slots, got ${pendingBoard.slots.length}`,
  );

  const companyAuthMode = await ensureOrganizerSession();

  const companyAnnual = await request("/api/slotboard/billing/company-standby/checkout", {
    method: "POST",
    useJar: true,
    expectedStatus: 201,
    json: { billingInterval: "year" },
  });
  assertCheckout(companyAnnual, {
    mode: "subscription",
    productKey: "company_standby",
  });

  const companyMonthly = await request("/api/slotboard/billing/company-standby/checkout", {
    method: "POST",
    useJar: true,
    expectedStatus: 201,
    json: { billingInterval: "month" },
  });
  assertCheckout(companyMonthly, {
    mode: "subscription",
    productKey: "company_standby",
  });

  console.log(JSON.stringify({
    ok: true,
    baseURL,
    checked: [
      "event-pass-checkout-session-created",
      "pending-event-pass-board-hides-public-slots",
      companyAuthMode,
      "company-annual-checkout-session-created",
      "company-monthly-checkout-session-created",
      "checkout-urls-hosted-by-stripe",
    ],
    sessions: {
      eventPass: summarizeCheckout(eventPass),
      companyAnnual: summarizeCheckout(companyAnnual),
      companyMonthly: summarizeCheckout(companyMonthly),
    },
  }, null, 2));
} finally {
  if (adminToken) {
    try {
      await request("/api/slotboard/admin/delete", {
        method: "POST",
        token: adminToken,
      });
    } catch (error) {
      console.error(`cleanup_failed=${error.message}`);
    }
  }
}

async function ensureOrganizerSession() {
  if (smokeOrganizerEmail && smokeOrganizerPassword) {
    const signedIn = await request("/api/auth/sign-in/email", {
      method: "POST",
      useJar: true,
      json: {
        email: smokeOrganizerEmail,
        password: smokeOrganizerPassword,
        callbackURL: `${frontendOrigin}/verify-email`,
      },
    });
    assert(signedIn.user?.email === smokeOrganizerEmail, "expected smoke organizer sign-in to return the configured account");
    assert(jar.size > 0, "expected smoke organizer sign-in to set a session cookie");
    return "company-organizer-signed-in";
  }

  if (!authSecret) {
    throw new Error(
      "Company Checkout smoke needs SLOTBOARD_SMOKE_ORGANIZER_EMAIL/SLOTBOARD_SMOKE_ORGANIZER_PASSWORD for a verified account, or SLOTBOARD_AUTH_SECRET to create and verify a temporary account.",
    );
  }

  const email = `company-checkout-${suffix}@example.com`;
  const password = `CompanyCheckout!${suffix}`;
  const signup = await request("/api/auth/sign-up/email", {
    method: "POST",
    useJar: true,
    json: {
      name: "Company Checkout Smoke",
      email,
      password,
      callbackURL: `${frontendOrigin}/verify-email`,
    },
  });
  assert(signup.user?.email === email, "expected company smoke sign-up to create an organizer user");
  assert(jar.size === 0, "expected company smoke sign-up to wait for email verification");

  const { createEmailVerificationToken } = await import("../apps/slots-api/node_modules/better-auth/dist/api/index.mjs");
  const token = await createEmailVerificationToken(authSecret, email, undefined, 3600);
  const verified = await request(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
    useJar: true,
  });
  assert(verified.status === true, "expected company smoke email verification to succeed");
  assert(jar.size > 0, "expected company smoke email verification to set a session cookie");
  return "company-organizer-created-and-verified";
}

async function createBoard() {
  const slotDate = isoDateAfterDays(20);
  const slotWeekday = new Date(`${slotDate}T00:00:00.000Z`).getUTCDay();
  return request("/api/slotboard/events", {
    method: "POST",
    expectedStatus: 201,
    json: {
      title: `Checkout Smoke Board ${suffix}`,
      description: "Live checkout session creation smoke.",
      organizerName: "Checkout Smoke",
      organizerEmail: `checkout-smoke-${suffix}@example.com`,
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

async function request(path, options = {}) {
  const response = await fetch(`${baseURL}${path}`, {
    method: options.method || "GET",
    headers: headers(options),
    body: options.json === undefined ? undefined : JSON.stringify(options.json),
  });
  if (options.useJar) {
    storeSetCookies(response.headers);
  }
  const expectedStatus = options.expectedStatus || 200;
  const text = await response.text();
  const body = parseJson(text);
  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}, expected ${expectedStatus}: ${text}`);
  }
  return body;
}

function headers(options) {
  const result = {
    origin: frontendOrigin,
    "x-slotboard-smoke-actor": `billing-live-smoke-${suffix}`,
  };
  if (options.json !== undefined) {
    result["content-type"] = "application/json";
  }
  if (options.token) {
    result.authorization = `Bearer ${options.token}`;
  }
  if (options.useJar && jar.size) {
    result.cookie = [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }
  return result;
}

function storeSetCookies(headers) {
  for (const cookie of headers.getSetCookie?.() ?? []) {
    const [pair] = cookie.split(";");
    const [name, value] = pair.split("=");
    if (name && value) {
      jar.set(name, value);
    }
  }
}

function assertCheckout(value, expected) {
  assert(value.mode === expected.mode, `expected Checkout mode ${expected.mode}, got ${value.mode}`);
  assert(value.productKey === expected.productKey, `expected Checkout product ${expected.productKey}, got ${value.productKey}`);
  assert(typeof value.checkoutSessionId === "string" && value.checkoutSessionId.startsWith("cs_"), "expected Stripe Checkout session id");
  assert(typeof value.url === "string", "expected Stripe Checkout URL");
  assert(new URL(value.url).hostname === "checkout.stripe.com", "expected Checkout URL to be hosted by Stripe");
}

function summarizeCheckout(value) {
  return {
    mode: value.mode,
    productKey: value.productKey,
    checkoutSessionId: value.checkoutSessionId,
    urlHost: new URL(value.url).hostname,
  };
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

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return text;
  }
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function isLocalURL(value) {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
