import { resolve4, resolve6, resolveCname } from "node:dns/promises";
import { request as httpsRequest } from "node:https";

const frontendURL = normalizeURL(process.env.SLOTBOARD_FRONTEND_URL || "https://mytimes.co");
const wwwURL = normalizeURL(process.env.SLOTBOARD_WWW_URL || "https://www.mytimes.co");
const configuredApiURL = process.env.SLOTBOARD_API_URL ? normalizeURL(process.env.SLOTBOARD_API_URL) : undefined;
let apiURL = configuredApiURL;
const checkWWW = process.env.SLOTBOARD_SKIP_WWW_CHECK !== "true";
const rootDomain = process.env.SLOTBOARD_ROOT_DOMAIN || "mytimes.co";
const wwwDomain = process.env.SLOTBOARD_WWW_DOMAIN || "www.mytimes.co";
const apiDomain = process.env.SLOTBOARD_API_DOMAIN || "api.mytimes.co";
const apiCnameTarget = process.env.SLOTBOARD_API_CNAME_TARGET || "i099f43h.up.railway.app";
const requireApiCustomDomain = process.env.SLOTBOARD_REQUIRE_API_CUSTOM_DOMAIN === "true";

const failures = [];
const checked = [];
const warnings = [];

await assertARecord(rootDomain, "root domain has public A records");
if (checkWWW) {
  await assertPublicAddressOrCname(wwwDomain, "www domain has public DNS records");
}

const index = await fetchText(`${frontendURL}/`);
assertStatus(index, 200, "frontend home loads");
assertFrontendSecurityHeaders(index, "frontend home");
const bundleURL = findBundleURL(index.text, frontendURL);
assert(bundleURL, "frontend index must reference a production JS bundle");

let bundleText = "";
if (bundleURL) {
  const bundle = await fetchText(bundleURL);
  assertStatus(bundle, 200, "frontend JS bundle loads");
  assertHeaderIncludes(bundle, "cache-control", "immutable", "frontend JS bundle uses immutable cache");
  bundleText = bundle.text;
  assertIncludes(bundle.text, "View demo board", "live bundle has demo pricing CTA");
  assertIncludes(bundle.text, "Preview only", "live bundle has read-only demo submit label");
  assertIncludes(bundle.text, "This is a demo board", "live bundle has demo submit guard copy");
  assertIncludes(bundle.text, "$480", "live bundle has annual company price");
  assertIncludes(bundle.text, "$49 monthly available", "live bundle has monthly company copy");
  assertIncludes(bundle.text, "mytimes.co", "live bundle uses mytimes.co examples");
  assertExcludes(bundle.text, "Email previews", "live bundle does not contain email preview copy");
  assertExcludes(bundle.text, "mytimes.app", "live bundle does not contain old mytimes.app origin");
  assertExcludes(bundle.text, "MT-2026", "live bundle does not contain fake receipt ids");
  assertExcludes(bundle.text, "View live board", "live bundle does not label demos as live");
  assertExcludes(bundle.text, "See a live board", "live bundle does not label demos as live");
}

apiURL ??= inferApiURLFromBundle(bundleText) ?? frontendURL;
if (configuredApiURL) {
  checked.push("using configured API target");
} else {
  checked.push("inferred API target from live frontend bundle");
}

await checkApiCustomDomain();
checkActiveApiTarget(bundleText);

for (const path of ["/pricing", "/b/preview", "/new", "/signin"]) {
  const response = await fetchText(`${frontendURL}${path}`);
  assertStatus(response, 200, `frontend route ${path} loads`);
  assertFrontendSecurityHeaders(response, `frontend route ${path}`);
}

for (const path of ["/email-previews/index.html", "/email-previews/01-booking-confirmation.html"]) {
  const response = await fetchText(`${frontendURL}${path}`);
  assertStatus(response, 200, `frontend fallback handles ${path}`);
  assertExcludes(response.text, "Email previews", `${path} must not expose preview index`);
  assertExcludes(response.text, "01-booking-confirmation", `${path} must not expose preview links`);
  assertExcludes(response.text, "Booking confirmed", `${path} must not expose rendered email HTML`);
}

if (checkWWW) {
  let www = await fetchText(`${wwwURL}/`);
  if (www.status !== 200 && www.error) {
    const publicDnsWWW = await fetchTextViaPublicDns(`${wwwURL}/`);
    if (publicDnsWWW.status === 200) {
      checked.push("www local resolver fallback uses public DNS");
      www = publicDnsWWW;
    }
  }
  assertStatus(www, 200, "www frontend loads");
}

const billing = await fetchJson(`${apiURL}/api/slotboard/billing/readiness`);
assertStatus(billing, 200, "billing readiness endpoint loads");
assertApiSecurityHeaders(billing, "billing readiness endpoint");
assertHeader(billing, "cache-control", "no-store", "billing readiness disables cache");
assert(billing.json?.billing?.productionReady === true, "billing readiness must be productionReady=true");
assert(billing.json?.billing?.products?.eventPass?.amount === 1900, "board unlock amount must be 1900");
assert(billing.json?.billing?.products?.companyStandby?.amount === 4900, "company monthly amount must be 4900");
assert(billing.json?.billing?.products?.companyStandbyAnnual?.amount === 48000, "company annual amount must be 48000");
checked.push("verified Stripe product amounts");

const email = await fetchJson(`${apiURL}/api/slotboard/ops/email-readiness`);
assertStatus(email, 200, "email readiness endpoint loads");
assertApiSecurityHeaders(email, "email readiness endpoint");
assertHeader(email, "cache-control", "no-store", "email readiness disables cache");
assert(email.json?.email?.productionReady === true, "email readiness must be productionReady=true");
assert(email.json?.email?.provider === "resend", "email provider must be resend");
assert(email.json?.email?.senderEmail === "mytimes <bookings@mytimes.co>", "sender must use bookings@mytimes.co");
checked.push("verified Resend provider and sender");

await assertCorsPreflight();

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, frontendURL, wwwURL, apiURL, failures, warnings, checked }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, frontendURL, wwwURL, apiURL, warnings, checked }, null, 2));

async function assertARecord(hostname, label) {
  checked.push(label);
  try {
    const addresses = await resolve4(hostname);
    assert(addresses.length > 0, `${label}: no A records returned for ${hostname}`);
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function assertCnameRecord(hostname, expectedTarget, label) {
  checked.push(label);
  try {
    const records = await resolveCname(hostname);
    const normalizedRecords = records.map(normalizeDnsValue);
    const normalizedTarget = normalizeDnsValue(expectedTarget);
    assert(
      normalizedRecords.includes(normalizedTarget),
      `${label}: expected ${hostname} CNAME ${expectedTarget}, got ${records.join(", ") || "none"}`,
    );
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function assertPublicAddressOrCname(hostname, label) {
  checked.push(label);
  const records = await readDnsRecords(hostname);
  assert(
    records.a.length > 0 || records.aaaa.length > 0 || records.cname.length > 0,
    `${label}: no A, AAAA, or CNAME records returned for ${hostname}`,
  );
}

async function checkApiCustomDomain() {
  const apiURLHostname = new URL(apiURL).hostname;
  if (apiURLHostname === apiDomain || requireApiCustomDomain) {
    await assertCnameRecord(apiDomain, apiCnameTarget, "api domain points at Railway");
    return;
  }

  const records = await readDnsRecords(apiDomain);
  checked.push("api custom domain is optional for current frontend API URL");
  if (records.a.length === 0 && records.aaaa.length === 0 && records.cname.length === 0) {
    warnings.push(`${apiDomain} is not live; current frontend API target is ${apiURLHostname}`);
  }
}

function checkActiveApiTarget(bundleText) {
  if (!bundleText) return;
  checked.push("frontend bundle uses active API target");
  const apiURLHostname = new URL(apiURL).hostname;
  const frontendHostname = new URL(frontendURL).hostname;
  assert(
    bundleText.includes(apiURLHostname) || apiURLHostname === frontendHostname,
    `frontend bundle does not include active API target ${apiURLHostname}`,
  );
  if (apiURLHostname === frontendHostname) {
    checked.push("frontend bundle does not hardcode Railway API in same-origin mode");
    assert(
      !bundleText.includes("api-production-067c0.up.railway.app"),
      "frontend bundle hardcodes the Railway API domain in same-origin mode",
    );
  }
}

function inferApiURLFromBundle(bundleText) {
  if (!bundleText) return undefined;
  const explicitApiURL = bundleText.match(/https:\/\/(?:api-production-[a-z0-9-]+\.up\.railway\.app|api\.mytimes\.co)/i)?.[0];
  return explicitApiURL ? normalizeURL(explicitApiURL) : undefined;
}

async function readDnsRecords(hostname) {
  const [a, aaaa, cname] = await Promise.all([
    resolve4(hostname).catch(() => []),
    resolve6(hostname).catch(() => []),
    resolveCname(hostname).catch(() => []),
  ]);
  return { a, aaaa, cname };
}

async function assertCorsPreflight() {
  const origin = new URL(frontendURL).origin;
  const response = await fetchText(`${apiURL}/api/slotboard/events`, {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization,content-type,idempotency-key",
    },
  });
  checked.push("api CORS preflight accepts frontend origin");
  assert(
    response.status === 204 || response.status === 200,
    `api CORS preflight accepts frontend origin: expected 200/204, got ${response.status}`,
  );
  assertHeader(response, "access-control-allow-origin", origin, "api CORS echoes frontend origin");
  assertHeader(response, "access-control-allow-credentials", "true", "api CORS allows credentials");
  assertHeaderIncludes(response, "access-control-allow-headers", "idempotency-key", "api CORS allows idempotency key");
}

async function fetchText(url, init = {}) {
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000), ...init });
    return {
      url,
      status: response.status,
      headers: Object.fromEntries([...response.headers.entries()].map(([key, value]) => [key.toLowerCase(), value])),
      text: await response.text(),
    };
  } catch (error) {
    return { url, status: 0, headers: {}, text: "", error: error instanceof Error ? error.message : String(error) };
  }
}

async function fetchJson(url) {
  const response = await fetchText(url);
  try {
    return { ...response, json: response.text ? JSON.parse(response.text) : undefined };
  } catch {
    failures.push(`${url} did not return JSON`);
    return response;
  }
}

async function fetchTextViaPublicDns(url) {
  let target;
  try {
    target = new URL(url);
  } catch (error) {
    return { url, status: 0, text: "", error: error instanceof Error ? error.message : String(error) };
  }

  if (target.protocol !== "https:") {
    return fetchText(url);
  }

  let addresses;
  try {
    addresses = await resolve4(target.hostname);
  } catch (error) {
    return { url, status: 0, text: "", error: error instanceof Error ? error.message : String(error) };
  }

  const address = addresses[0];
  if (!address) {
    return { url, status: 0, text: "", error: "public DNS returned no A records" };
  }

  return new Promise((resolve) => {
    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: target.hostname,
        servername: target.hostname,
        method: "GET",
        path: `${target.pathname}${target.search}`,
        timeout: 15_000,
        headers: { host: target.host },
        lookup: (_hostname, options, callback) => {
          if (options?.all) {
            callback(null, [{ address, family: 4 }]);
            return;
          }
          callback(null, address, 4);
        },
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          text += chunk;
        });
        response.on("end", () => {
          resolve({
            url,
            status: response.statusCode ?? 0,
            headers: Object.fromEntries(
              Object.entries(response.headers).map(([key, value]) => [
                key.toLowerCase(),
                Array.isArray(value) ? value.join(", ") : value ?? "",
              ]),
            ),
            text,
          });
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("request timed out"));
    });
    request.on("error", (error) => {
      resolve({ url, status: 0, headers: {}, text: "", error: error instanceof Error ? error.message : String(error) });
    });
    request.end();
  });
}

function assertFrontendSecurityHeaders(response, label) {
  assertHeader(response, "cache-control", "no-store", `${label} disables HTML cache`);
  assertHeaderIncludes(response, "content-security-policy", "default-src 'self'", `${label} has CSP default-src`);
  assertHeaderIncludes(response, "content-security-policy", "frame-ancestors 'none'", `${label} denies framing via CSP`);
  assertHeaderIncludes(response, "content-security-policy", "object-src 'none'", `${label} disables object embeds`);
  assertHeader(response, "referrer-policy", "no-referrer", `${label} has no-referrer policy`);
  assertHeader(response, "x-content-type-options", "nosniff", `${label} has nosniff`);
  assertHeader(response, "x-frame-options", "DENY", `${label} denies framing`);
  assertHeaderIncludes(response, "strict-transport-security", "max-age=31536000", `${label} has HSTS`);
  assertHeaderIncludes(response, "permissions-policy", "geolocation=()", `${label} disables geolocation permission`);
}

function assertApiSecurityHeaders(response, label) {
  assertHeader(response, "referrer-policy", "no-referrer", `${label} has no-referrer policy`);
  assertHeader(response, "x-content-type-options", "nosniff", `${label} has nosniff`);
  assertHeader(response, "x-frame-options", "DENY", `${label} denies framing`);
  assertHeaderIncludes(response, "strict-transport-security", "max-age=31536000", `${label} has HSTS`);
  assertHeaderIncludes(response, "permissions-policy", "geolocation=()", `${label} disables geolocation permission`);
}

function assertHeader(response, name, expected, label) {
  checked.push(label);
  const actual = response.headers?.[name.toLowerCase()];
  assert(actual === expected, `${label}: expected ${name}: ${expected}, got ${actual || "missing"}`);
}

function assertHeaderIncludes(response, name, expectedPart, label) {
  checked.push(label);
  const actual = response.headers?.[name.toLowerCase()];
  assert(
    actual?.toLowerCase().includes(expectedPart.toLowerCase()),
    `${label}: expected ${name} to include ${expectedPart}, got ${actual || "missing"}`,
  );
}

function findBundleURL(html, baseURL) {
  const match = html.match(/<script[^>]+src="([^"]*\/assets\/index-[^"]+\.js)"/);
  return match ? new URL(match[1], baseURL).toString() : undefined;
}

function assertStatus(response, expected, label) {
  checked.push(label);
  const detail = response.error ? ` (${response.error})` : "";
  assert(response.status === expected, `${label}: expected ${expected}, got ${response.status}${detail}`);
}

function assertIncludes(content, needle, label) {
  checked.push(label);
  assert(content.includes(needle), `${label}: missing "${needle}"`);
}

function assertExcludes(content, needle, label) {
  checked.push(label);
  assert(!content.includes(needle), `${label}: found "${needle}"`);
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function normalizeURL(value) {
  return value.replace(/\/$/, "");
}

function normalizeDnsValue(value) {
  return value.trim().replace(/\.$/, "").toLowerCase();
}
