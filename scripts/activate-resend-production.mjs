import { spawnSync } from "node:child_process";

const service = process.env.RAILWAY_SERVICE || "api";
const environment = process.env.RAILWAY_ENVIRONMENT || "production";
const baseURL = requiredEnv("SLOTBOARD_API_URL").replace(/\/$/, "");
const resendApiKey = requiredEnv("SLOTBOARD_RESEND_API_KEY");
const senderEmail = requiredEnv("SLOTBOARD_SENDER_EMAIL");
const resendWebhookSecret = process.env.SLOTBOARD_RESEND_WEBHOOK_SECRET;
const genericWebhookSecret = process.env.SLOTBOARD_EMAIL_WEBHOOK_SECRET;
const testEmail = process.env.SLOTBOARD_TEST_EMAIL;
const opsSecret = process.env.SLOTBOARD_OPS_SECRET;
const dryRun = process.env.SLOTBOARD_EMAIL_ACTIVATION_DRY_RUN === "true";

console.log(`Activating Resend delivery on Railway service "${service}" (${environment}).`);
if (dryRun) {
  console.log("Dry run enabled. Railway variables will not be changed.");
}

setSecret("SLOTBOARD_RESEND_API_KEY", resendApiKey);
setVariable("SLOTBOARD_SENDER_EMAIL", senderEmail, { skipDeploys: true });
if (resendWebhookSecret) {
  setSecret("SLOTBOARD_RESEND_WEBHOOK_SECRET", resendWebhookSecret);
}
if (genericWebhookSecret) {
  setSecret("SLOTBOARD_EMAIL_WEBHOOK_SECRET", genericWebhookSecret);
}
setVariable("SLOTBOARD_EMAIL_PROVIDER", "resend", { skipDeploys: false });

if (dryRun) {
  console.log("Dry run complete. Set SLOTBOARD_EMAIL_ACTIVATION_DRY_RUN=false or unset it to activate.");
  process.exit(0);
}

const readiness = await waitForProductionReadiness();
console.log(JSON.stringify({ ok: true, baseURL, email: readiness }, null, 2));

if (testEmail) {
  if (!opsSecret) {
    console.warn("SLOTBOARD_TEST_EMAIL is set, but SLOTBOARD_OPS_SECRET is missing; skipping provider test email.");
  } else {
    await sendTestEmail(testEmail, opsSecret);
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name} before running this script.`);
  }
  return value;
}

function railwayBaseArgs() {
  return ["variable", "set", "--service", service, "--environment", environment];
}

function setSecret(name, value) {
  console.log(`Setting ${name}=<redacted>`);
  runRailway([...railwayBaseArgs(), "--skip-deploys", "--stdin", name], {
    input: value,
  });
}

function setVariable(name, value, options) {
  console.log(`Setting ${name}=${name.includes("SECRET") || name.includes("KEY") ? "<redacted>" : value}`);
  const args = railwayBaseArgs();
  if (options.skipDeploys) args.push("--skip-deploys");
  runRailway([...args, `${name}=${value}`]);
}

function runRailway(args, options = {}) {
  if (dryRun) {
    console.log(`DRY RUN: railway ${args.join(" ")}`);
    return;
  }
  const result = spawnSync("railway", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    input: options.input,
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error(`railway ${args.join(" ")} failed${stderr ? `: ${stderr}` : stdout ? `: ${stdout}` : ""}`);
  }
}

async function waitForProductionReadiness() {
  const deadline = Date.now() + Number(process.env.SLOTBOARD_EMAIL_READY_TIMEOUT_MS || 180_000);
  let lastEmail;
  while (Date.now() < deadline) {
    const email = await readEmailReadiness();
    lastEmail = email;
    if (email.provider === "resend" && email.productionReady) {
      return email;
    }
    await sleep(5_000);
  }
  throw new Error(
    `Timed out waiting for production email readiness. Last status: ${JSON.stringify(lastEmail)}`,
  );
}

async function readEmailReadiness() {
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
  return email;
}

async function sendTestEmail(recipientEmail, secret) {
  const response = await fetch(`${baseURL}/api/slotboard/ops/email-test`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ recipientEmail }),
  });
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // Keep raw provider text for diagnostics.
  }
  console.log(JSON.stringify({ ok: response.ok, status: response.status, baseURL, response: body }, null, 2));
  if (!response.ok) {
    process.exitCode = 1;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
