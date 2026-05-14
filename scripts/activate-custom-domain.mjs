import { spawnSync } from "node:child_process";

const hostname = normalizeHostname(requiredEnv("SLOTBOARD_CUSTOM_DOMAIN"));
const baseURL = stripTrailingSlash(requiredEnv("SLOTBOARD_API_URL"));
const opsSecret = process.env.SLOTBOARD_OPS_SECRET;
const service = process.env.SLOTBOARD_RAILWAY_SERVICE || process.env.RAILWAY_SERVICE || "slots";
const port = process.env.SLOTBOARD_RAILWAY_DOMAIN_PORT || "4174";
const skipRailway = process.env.SLOTBOARD_CUSTOM_DOMAIN_SKIP_RAILWAY === "true";
const dryRun = process.env.SLOTBOARD_CUSTOM_DOMAIN_ACTIVATION_DRY_RUN === "true";

console.log(`Activating custom booking domain "${hostname}".`);
console.log(`API: ${baseURL}`);
console.log(`Railway service: ${service}`);

if (dryRun) {
  console.log("Dry run enabled. Railway and API state will not be changed.");
}

if (!skipRailway) {
  attachRailwayDomain();
} else {
  console.log("Skipping Railway domain attachment because SLOTBOARD_CUSTOM_DOMAIN_SKIP_RAILWAY=true.");
}

if (dryRun) {
  console.log("Dry run complete. Unset SLOTBOARD_CUSTOM_DOMAIN_ACTIVATION_DRY_RUN to activate.");
  process.exit(0);
}

if (!opsSecret) {
  throw new Error("Set SLOTBOARD_OPS_SECRET to the same value configured on the API service.");
}

const activated = await activateDomain();
console.log(JSON.stringify({ ok: true, baseURL, domain: activated.domain }, null, 2));

function attachRailwayDomain() {
  const args = [
    "domain",
    "--service",
    service,
    "--port",
    port,
    "--json",
    hostname,
  ];
  console.log(`Running: railway ${args.join(" ")}`);
  const output = runRailway(args);
  if (output) {
    console.log(output);
  }
}

function runRailway(args) {
  if (dryRun) {
    console.log(`DRY RUN: railway ${args.join(" ")}`);
    return "";
  }
  const result = spawnSync("railway", args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error(`railway ${args.join(" ")} failed${stderr ? `: ${stderr}` : stdout ? `: ${stdout}` : ""}`);
  }
  return result.stdout?.trim() ?? "";
}

async function activateDomain() {
  const response = await fetch(`${baseURL}/api/slotboard/ops/custom-domain/activate`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${opsSecret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ hostname }),
  });
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // Keep raw text for operational diagnostics.
  }
  if (!response.ok) {
    throw new Error(`custom-domain activation returned ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name} before running this script.`);
  }
  return value;
}

function normalizeHostname(value) {
  const trimmed = value.trim().toLowerCase();
  const host = trimmed.includes("://")
    ? safeURLHostname(trimmed)
    : trimmed.split("/")[0]?.split("?")[0]?.split("#")[0] ?? "";
  const normalized = host.replace(/\.$/, "");
  if (!normalized) {
    throw new Error("SLOTBOARD_CUSTOM_DOMAIN must be a hostname like book.company.com.");
  }
  return normalized;
}

function safeURLHostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}
