import { spawnSync } from "node:child_process";

const service = process.env.RAILWAY_SERVICE || "api";
const environment = process.env.RAILWAY_ENVIRONMENT || "production";
const baseURL = requiredEnv("SLOTBOARD_API_URL").replace(/\/$/, "");
const stripeSecretKey = requiredEnv("SLOTBOARD_STRIPE_SECRET_KEY");
const stripeWebhookSecret = requiredEnv("SLOTBOARD_STRIPE_WEBHOOK_SECRET");
const billingCurrency = process.env.SLOTBOARD_BILLING_CURRENCY || "usd";
const eventPassAmount = process.env.SLOTBOARD_EVENT_PASS_AMOUNT || "1900";
const companyStandbyAmount = process.env.SLOTBOARD_COMPANY_STANDBY_AMOUNT || "4900";
const companyStandbyAnnualAmount = process.env.SLOTBOARD_COMPANY_STANDBY_ANNUAL_AMOUNT || "48000";
const eventPassPriceId = process.env.SLOTBOARD_STRIPE_EVENT_PASS_PRICE_ID;
const companyStandbyPriceId = process.env.SLOTBOARD_STRIPE_COMPANY_STANDBY_PRICE_ID;
const companyStandbyAnnualPriceId = process.env.SLOTBOARD_STRIPE_COMPANY_STANDBY_ANNUAL_PRICE_ID;
const testAdminToken = process.env.SLOTBOARD_STRIPE_TEST_ADMIN_TOKEN;
const dryRun = process.env.SLOTBOARD_STRIPE_ACTIVATION_DRY_RUN === "true";

console.log(`Activating Stripe billing on Railway service "${service}" (${environment}).`);
if (dryRun) {
  console.log("Dry run enabled. Railway variables will not be changed.");
}

setSecret("SLOTBOARD_STRIPE_SECRET_KEY", stripeSecretKey);
setSecret("SLOTBOARD_STRIPE_WEBHOOK_SECRET", stripeWebhookSecret);
if (eventPassPriceId) setVariable("SLOTBOARD_STRIPE_EVENT_PASS_PRICE_ID", eventPassPriceId, { skipDeploys: true });
if (companyStandbyPriceId) setVariable("SLOTBOARD_STRIPE_COMPANY_STANDBY_PRICE_ID", companyStandbyPriceId, { skipDeploys: true });
if (companyStandbyAnnualPriceId) setVariable("SLOTBOARD_STRIPE_COMPANY_STANDBY_ANNUAL_PRICE_ID", companyStandbyAnnualPriceId, { skipDeploys: true });
setVariable("SLOTBOARD_EVENT_PASS_AMOUNT", eventPassAmount, { skipDeploys: true });
setVariable("SLOTBOARD_COMPANY_STANDBY_AMOUNT", companyStandbyAmount, { skipDeploys: true });
setVariable("SLOTBOARD_COMPANY_STANDBY_ANNUAL_AMOUNT", companyStandbyAnnualAmount, { skipDeploys: true });
setVariable("SLOTBOARD_BILLING_CURRENCY", billingCurrency, { skipDeploys: false });

if (dryRun) {
  console.log("Dry run complete. Set SLOTBOARD_STRIPE_ACTIVATION_DRY_RUN=false or unset it to activate.");
  process.exit(0);
}

const readiness = await waitForProductionReadiness();
console.log(JSON.stringify({ ok: true, baseURL, billing: readiness }, null, 2));

if (testAdminToken) {
  await createTestCheckout(testAdminToken);
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
  const deadline = Date.now() + Number(process.env.SLOTBOARD_BILLING_READY_TIMEOUT_MS || 180_000);
  let lastBilling;
  while (Date.now() < deadline) {
    const billing = await readBillingReadiness();
    lastBilling = billing;
    if (billing.productionReady) {
      return billing;
    }
    await sleep(5_000);
  }
  throw new Error(
    `Timed out waiting for production billing readiness. Last status: ${JSON.stringify(lastBilling)}`,
  );
}

async function readBillingReadiness() {
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
  return billing;
}

async function createTestCheckout(adminToken) {
  const response = await fetch(`${baseURL}/api/slotboard/billing/event-pass/checkout`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${adminToken}`,
    },
  });
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // Keep raw text for provider diagnostics.
  }
  console.log(JSON.stringify({ ok: response.ok, status: response.status, baseURL, checkout: body }, null, 2));
  if (!response.ok) {
    process.exitCode = 1;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
