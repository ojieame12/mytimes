import pg from "pg";

const { Pool } = pg;
const { createEmailVerificationToken } = await import("../apps/slots-api/node_modules/better-auth/dist/api/index.mjs");

const providedBaseURL = process.env.SLOTBOARD_API_URL;
let baseURL = providedBaseURL || "";
const frontendOrigin = process.env.SLOTBOARD_WEB_ORIGIN || "http://127.0.0.1:5174";
const databaseURL =
  process.env.SLOTBOARD_DATABASE_URL ||
  "postgres://slotboard:slotboard@localhost:5434/slotboard?sslmode=disable";
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const actorKey = `auth-reset-${suffix}`;
const pool = new Pool({ connectionString: databaseURL, application_name: "slotboard-auth-reset-test" });

process.env.SLOTBOARD_DATABASE_URL ||= databaseURL;
process.env.SLOTBOARD_PUBLIC_APP_URL ||= frontendOrigin;
process.env.SLOTBOARD_WEB_ORIGINS ||= frontendOrigin;
process.env.SLOTBOARD_AUTH_SECRET ||= "local-auth-reset-secret-change-me-32chars";
process.env.SLOTBOARD_TOKEN_PEPPER ||= "dev-token-pepper-replace-before-production";
process.env.SLOTBOARD_EMAIL_PROVIDER ||= "console";

const { closePool: closeApiPool } = await import("../apps/slots-api/src/db.ts");
const { closeOrganizerAuthPool } = await import("../apps/slots-api/src/organizerAuth.ts");

let closeStartedApi;

try {
  if (!providedBaseURL) {
    closeStartedApi = await startSourceApi();
  }
  await request("/healthz");
  await request("/readyz");

  const email = `reset-owner+${suffix}@example.com`;
  const missingEmail = `missing-reset+${suffix}@example.com`;
  const oldPassword = `OldReset!${suffix}`;
  const newPassword = `NewReset!${suffix}`;
  const ownerJar = new Map();
  const newJar = new Map();

  const signedUp = await authRequest("/api/auth/sign-up/email", {
    method: "POST",
    jar: ownerJar,
    json: {
      name: "Reset Flow Owner",
      email,
      password: oldPassword,
      callbackURL: `${frontendOrigin}/verify-email`,
    },
  });
  assert(signedUp.user?.email === email, "expected sign-up to create the reset-flow owner");
  assert(signedUp.token === null, "expected verified-email sign-up not to return an auth token");
  assert(signedUp.user?.emailVerified === false, "expected sign-up user to start unverified");
  assert(signedUp.session === undefined, "expected verified-email sign-up not to create a session");
  assert(ownerJar.size === 0, "expected verified-email sign-up not to set a session cookie");
  assert((await activeSessionCount(email)) === 0, "expected unverified sign-up to have no active sessions");

  const verificationCountAfterSignUp = await emailVerificationEmailCount(email);
  assert(verificationCountAfterSignUp >= 1, "expected sign-up to send an email verification message");
  const verificationEmail = await latestEmailVerificationEmail(email);
  assert(
    verificationEmail?.status === "sent",
    `expected email_verification email log to be sent, got ${verificationEmail?.status}`,
  );
  assert(
    verificationEmail?.provider === "console",
    `expected console provider in local test, got ${verificationEmail?.provider}`,
  );
  assert(verificationEmail?.event_id === null, "expected verification email not to attach to a board");

  await authRequest("/api/auth/sign-in/email", {
    method: "POST",
    expectedStatus: 403,
    expectedCode: "EMAIL_NOT_VERIFIED",
    json: {
      email,
      password: oldPassword,
      callbackURL: `${frontendOrigin}/verify-email`,
    },
  });
  assert(
    (await emailVerificationEmailCount(email)) > verificationCountAfterSignUp,
    "expected unverified sign-in to send a fresh verification email",
  );

  const verificationToken = await createEmailVerificationToken(
    process.env.SLOTBOARD_AUTH_SECRET,
    email,
    undefined,
    3600,
  );
  const verified = await requestRaw(
    `/api/auth/verify-email?token=${encodeURIComponent(verificationToken)}&callbackURL=${encodeURIComponent(`${frontendOrigin}/verify-email`)}`,
    {
      origin: frontendOrigin,
      redirect: "manual",
    },
  );
  storeSetCookies(ownerJar, verified.headers);
  assert(
    verified.status >= 300 && verified.status < 400,
    `expected email verification to redirect to the frontend, got ${verified.status}: ${verified.text}`,
  );
  assert(
    verified.headers.get("location")?.startsWith(`${frontendOrigin}/verify-email`),
    `expected email verification callback redirect, got ${verified.headers.get("location")}`,
  );
  assert(await userEmailVerified(email), "expected email verification to mark the organizer email verified");
  assert(ownerJar.size > 0, "expected email verification to create a session cookie");
  assert((await activeSessionCount(email)) >= 1, "expected verified organizer to have an active session");
  const session = await authRequest("/api/auth/get-session", { jar: ownerJar });
  assert(session?.user?.email === email, "expected verified session to belong to the reset-flow owner");
  assert(session?.user?.emailVerified === true, "expected verified session to expose emailVerified=true");

  const resetRequest = await authRequest("/api/auth/request-password-reset", {
    method: "POST",
    json: {
      email,
      redirectTo: `${frontendOrigin}/reset-password`,
    },
  });
  assert(resetRequest.status === true, "expected password-reset request to return a generic success");

  const resetEmail = await latestPasswordResetEmail(email);
  assert(resetEmail?.status === "sent", `expected password_reset email log to be sent, got ${resetEmail?.status}`);
  assert(resetEmail?.provider === "console", `expected console provider in local test, got ${resetEmail?.provider}`);
  assert(resetEmail?.event_id === null, "expected password reset email not to attach to a board");

  const token = await latestResetToken(email);
  assert(token, "expected a reset token for the signed-up organizer");

  const missingBefore = await passwordResetEmailCount(missingEmail);
  const genericMissing = await authRequest("/api/auth/request-password-reset", {
    method: "POST",
    json: {
      email: missingEmail,
      redirectTo: `${frontendOrigin}/reset-password`,
    },
  });
  assert(genericMissing.status === true, "expected missing-account reset request to return generic success");
  assert(
    (await passwordResetEmailCount(missingEmail)) === missingBefore,
    "expected missing-account reset request not to send a password reset email",
  );

  await authRequest("/api/auth/reset-password", {
    method: "POST",
    json: {
      token,
      newPassword,
    },
  });
  assert((await activeSessionCount(email)) === 0, "expected password reset to revoke existing sessions");
  assert((await activeResetTokenCount(token)) === 0, "expected password reset token to be consumed");

  await authRequest("/api/auth/reset-password", {
    method: "POST",
    expectedStatus: 400,
    expectedCode: "INVALID_TOKEN",
    json: {
      token,
      newPassword: `${newPassword}Again`,
    },
  });
  await authRequest("/api/auth/sign-in/email", {
    method: "POST",
    expectedStatus: 401,
    expectedCode: "INVALID_EMAIL_OR_PASSWORD",
    json: {
      email,
      password: oldPassword,
    },
  });
  const signedIn = await authRequest("/api/auth/sign-in/email", {
    method: "POST",
    jar: newJar,
    json: {
      email,
      password: newPassword,
    },
  });
  assert(signedIn.user?.email === email, "expected new password to sign in");
  assert(newJar.size > 0, "expected new password sign-in to set a session cookie");

  console.log(JSON.stringify({
    ok: true,
    baseURL,
    checked: [
      "password-reset-request-generic-success",
      "signup-requires-email-verification",
      "email-verification-email-log",
      "unverified-signin-blocked",
      "verification-email-resent-on-signin",
      "email-verification-callback-redirect",
      "email-verification-creates-session",
      "password-reset-email-log",
      "password-reset-token-issued",
      "missing-account-generic-no-email",
      "password-reset-token-consumed",
      "password-reset-revokes-sessions",
      "password-reset-token-reuse-rejected",
      "old-password-rejected",
      "new-password-accepted",
    ],
  }, null, 2));
} finally {
  if (closeStartedApi) {
    await closeStartedApi();
  }
  await pool.end();
  await closeOrganizerAuthPool();
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

async function authRequest(path, options = {}) {
  return request(path, {
    ...options,
    origin: frontendOrigin,
    includeCredentials: true,
  });
}

async function request(path, options = {}) {
  const response = await requestRaw(path, options);
  const expectedStatus = options.expectedStatus || 200;
  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}, expected ${expectedStatus}: ${response.text}`);
  }
  if (options.jar) {
    storeSetCookies(options.jar, response.headers);
  }
  if (options.expectedCode) {
    assert(response.json?.code === options.expectedCode, `expected code ${options.expectedCode}, got ${response.text}`);
  }
  return response.json;
}

async function requestRaw(path, options = {}) {
  const response = await fetchWithSocketRetry(`${baseURL}${path}`, {
    method: options.method || "GET",
    headers: headers(options),
    body: options.json === undefined ? undefined : JSON.stringify(options.json),
    redirect: options.redirect || "follow",
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
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
  const result = {
    "x-forwarded-for": "198.51.100.88",
    "x-slotboard-smoke-actor": actorKey,
  };
  if (options.json !== undefined) {
    result["content-type"] = "application/json";
  }
  if (options.origin) {
    result.origin = options.origin;
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

async function latestResetToken(email) {
  const result = await pool.query(
    `
      select v.identifier, v.expires_at
      from slotboard.auth_verifications v
      join slotboard.auth_users u on u.id = v.value
      where u.email = $1
        and v.identifier like 'reset-password:%'
      order by v.created_at desc
      limit 1
    `,
    [email],
  );
  const row = result.rows[0];
  if (!row) {
    return undefined;
  }
  assert(new Date(row.expires_at).getTime() > Date.now(), "expected reset token not to be expired");
  return row.identifier.slice("reset-password:".length);
}

async function activeResetTokenCount(token) {
  const result = await pool.query(
    `
      select count(*)::int as count
      from slotboard.auth_verifications
      where identifier = $1
    `,
    [`reset-password:${token}`],
  );
  return result.rows[0]?.count ?? 0;
}

async function activeSessionCount(email) {
  const result = await pool.query(
    `
      select count(*)::int as count
      from slotboard.auth_sessions s
      join slotboard.auth_users u on u.id = s.user_id
      where u.email = $1
    `,
    [email],
  );
  return result.rows[0]?.count ?? 0;
}

async function latestPasswordResetEmail(email) {
  const result = await pool.query(
    `
      select event_id, email_type, provider, status
      from slotboard.email_delivery_logs
      where recipient_email = $1
        and email_type = 'password_reset'
      order by created_at desc
      limit 1
    `,
    [email],
  );
  return result.rows[0];
}

async function latestEmailVerificationEmail(email) {
  const result = await pool.query(
    `
      select event_id, email_type, provider, status
      from slotboard.email_delivery_logs
      where recipient_email = $1
        and email_type = 'email_verification'
      order by created_at desc
      limit 1
    `,
    [email],
  );
  return result.rows[0];
}

async function passwordResetEmailCount(email) {
  const result = await pool.query(
    `
      select count(*)::int as count
      from slotboard.email_delivery_logs
      where recipient_email = $1
        and email_type = 'password_reset'
    `,
    [email],
  );
  return result.rows[0]?.count ?? 0;
}

async function emailVerificationEmailCount(email) {
  const result = await pool.query(
    `
      select count(*)::int as count
      from slotboard.email_delivery_logs
      where recipient_email = $1
        and email_type = 'email_verification'
    `,
    [email],
  );
  return result.rows[0]?.count ?? 0;
}

async function userEmailVerified(email) {
  const result = await pool.query(
    `
      select email_verified
      from slotboard.auth_users
      where email = $1
      limit 1
    `,
    [email],
  );
  return result.rows[0]?.email_verified === true;
}

function parseJson(text, path) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${path} returned non-JSON response: ${text}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
