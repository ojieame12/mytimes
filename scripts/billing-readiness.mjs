const baseURL = process.env.SLOTBOARD_API_URL || "http://127.0.0.1:3014";
const requireProduction = process.env.SLOTBOARD_REQUIRE_PRODUCTION_BILLING === "true";

const response = await fetch(`${baseURL}/api/slotboard/billing/readiness`);
const text = await response.text();

if (!response.ok) {
  throw new Error(`billing readiness returned ${response.status}: ${text}`);
}

const body = text ? JSON.parse(text) : undefined;
const billing = body?.billing;
if (!billing || typeof billing !== "object") {
  throw new Error(`billing readiness returned an invalid response: ${text}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      baseURL,
      billing,
    },
    null,
    2,
  ),
);

if (requireProduction && !billing.productionReady) {
  process.exitCode = 1;
}
