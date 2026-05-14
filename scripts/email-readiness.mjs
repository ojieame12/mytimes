const baseURL = process.env.SLOTBOARD_API_URL || "http://127.0.0.1:3014";
const requireProduction = process.env.SLOTBOARD_REQUIRE_PRODUCTION_EMAIL === "true";

const response = await fetch(`${baseURL}/api/slotboard/ops/email-readiness`);
const text = await response.text();

if (!response.ok) {
  throw new Error(`email readiness returned ${response.status}: ${text}`);
}

const body = text ? JSON.parse(text) : undefined;
const email = body?.email;
if (!email || typeof email !== "object") {
  throw new Error(`email readiness returned an invalid response: ${text}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      baseURL,
      email,
    },
    null,
    2,
  ),
);

if (requireProduction && !email.productionReady) {
  process.exitCode = 1;
}
