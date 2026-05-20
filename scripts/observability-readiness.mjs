const baseURL = process.env.SLOTBOARD_API_URL || "http://127.0.0.1:3014";
const requireProduction = process.env.SLOTBOARD_REQUIRE_PRODUCTION_OBSERVABILITY === "true";

const response = await fetch(`${baseURL}/api/slotboard/ops/observability-readiness`);
const text = await response.text();

if (!response.ok) {
  const hint =
    response.status === 404 && !process.env.SLOTBOARD_API_URL
      ? " Set SLOTBOARD_API_URL=https://mytimes.co to check production, or start the local API on port 3014."
      : "";
  throw new Error(`observability readiness returned ${response.status}: ${text}${hint}`);
}

const body = text ? JSON.parse(text) : undefined;
const observability = body?.observability;
if (!observability || typeof observability !== "object") {
  throw new Error(`observability readiness returned an invalid response: ${text}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      baseURL,
      observability,
    },
    null,
    2,
  ),
);

if (requireProduction && !observability.productionReady) {
  process.exitCode = 1;
}
