const baseURL = process.env.SLOTBOARD_API_URL || "http://127.0.0.1:3014";
const opsSecret = process.env.SLOTBOARD_OPS_SECRET;

if (!opsSecret) {
  throw new Error("Set SLOTBOARD_OPS_SECRET to the same value configured on the API service");
}

const response = await fetch(`${baseURL}/api/slotboard/ops/observability-test`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${opsSecret}`,
  },
});
const text = await response.text();
let body = text;

try {
  body = text ? JSON.parse(text) : undefined;
} catch {
  // Keep the raw API text in the output.
}

console.log(
  JSON.stringify(
    {
      ok: response.ok,
      status: response.status,
      baseURL,
      response: body,
    },
    null,
    2,
  ),
);

if (!response.ok) {
  process.exitCode = 1;
}
