process.env.SLOTBOARD_OPS_SECRET = "test-ops-secret";
process.env.SLOTBOARD_TOKEN_PEPPER = "test-token-pepper-for-observability-tests-123456";
process.env.SLOTBOARD_AUTH_SECRET = "test-auth-secret-for-observability-tests-123456";

const { app } = await import("../apps/slots-api/src/app.ts");

const checked = [];

const readiness = await app.request("/api/slotboard/ops/observability-readiness");
assert(readiness.status === 200, `expected observability readiness 200, got ${readiness.status}`);
const readinessBody = await readiness.json();
assert(readinessBody.observability?.provider === "sentry", "expected Sentry readiness provider");
assert(readinessBody.observability?.productionReady === false, "expected observability to be disabled without SENTRY_DSN");
checked.push("observability readiness reports disabled Sentry without DSN");

const unauthorized = await app.request("/api/slotboard/ops/observability-test", { method: "POST" });
assert(unauthorized.status === 401, `expected observability test to require ops secret, got ${unauthorized.status}`);
checked.push("observability test requires ops secret");

const notConfigured = await app.request("/api/slotboard/ops/observability-test", {
  method: "POST",
  headers: {
    authorization: "Bearer test-ops-secret",
  },
});
assert(notConfigured.status === 409, `expected observability test 409 without SENTRY_DSN, got ${notConfigured.status}`);
const notConfiguredBody = await notConfigured.json();
assert(notConfiguredBody.error === "observability_not_configured", `expected observability_not_configured, got ${notConfiguredBody.error}`);
checked.push("observability test rejects when Sentry is not configured");

console.log(JSON.stringify({ ok: true, checked }, null, 2));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
