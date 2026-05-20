import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const serviceName = process.env.SLOTBOARD_RETENTION_SERVICE_NAME || "retention";
const expectedConfigFile = process.env.SLOTBOARD_RETENTION_CONFIG_FILE || "/railway.retention.toml";
const expectedCronSchedule = process.env.SLOTBOARD_RETENTION_CRON_SCHEDULE || "0 2 * * *";
const expectedStartCommand =
  process.env.SLOTBOARD_RETENTION_START_COMMAND || "npm run retention:prod --workspace @fresh-feel/slots-api";
const requireService = process.env.SLOTBOARD_REQUIRE_RETENTION_SERVICE === "true";

const checked = [];
const warnings = [];
const failures = [];
const diagnostics = {};

checkLocalConfig();
checkRailwayService();

const ok = failures.length === 0;
const result = {
  ok,
  productionReady: ok,
  retentionServiceName: serviceName,
  requireService,
  diagnostics,
  warnings,
  failures,
  checked,
};

console[ok ? "log" : requireService ? "error" : "warn"](JSON.stringify(result, null, 2));
process.exit(ok || !requireService ? 0 : 1);

function checkLocalConfig() {
  let config = "";
  try {
    config = readFileSync("railway.retention.toml", "utf8");
  } catch (error) {
    failures.push(`Could not read railway.retention.toml: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  checked.push("local retention Railway config exists");
  diagnostics.localConfig = {
    hasCronSchedule: config.includes(`cronSchedule = "${expectedCronSchedule}"`),
    hasStartCommand: config.includes(`startCommand = "${expectedStartCommand}"`),
    hasNoHealthcheckPath: !config.includes("healthcheckPath"),
    neverRestarts: config.includes('restartPolicyType = "NEVER"'),
  };

  if (!diagnostics.localConfig.hasCronSchedule) {
    failures.push(`railway.retention.toml does not define cronSchedule = "${expectedCronSchedule}".`);
  }
  if (!diagnostics.localConfig.hasStartCommand) {
    failures.push(`railway.retention.toml does not define the expected retention startCommand.`);
  }
  if (!diagnostics.localConfig.hasNoHealthcheckPath) {
    warnings.push("railway.retention.toml should omit healthcheckPath because the retention command exits.");
  }
  if (!diagnostics.localConfig.neverRestarts) {
    warnings.push('railway.retention.toml should keep restartPolicyType = "NEVER" for cron runs.');
  }
}

function checkRailwayService() {
  const status = runRailway(["status", "--json"]);
  if (!status.ok) {
    failures.push(`Could not read Railway status: ${status.error}`);
    return;
  }

  const projectStatus = parseJson(status.stdout, "Railway status JSON");
  if (!projectStatus) {
    failures.push("Could not parse Railway status JSON.");
    return;
  }

  const services = listServices(projectStatus);
  diagnostics.railwayServices = services.map((service) => service.serviceName);
  checked.push("Railway project services read");

  const retentionService = services.find((service) => service.serviceName === serviceName);
  if (!retentionService) {
    failures.push(`Railway service "${serviceName}" was not found. Create it as a cron service using ${expectedConfigFile}.`);
    return;
  }

  diagnostics.retentionService = {
    serviceName: retentionService.serviceName,
    serviceId: retentionService.serviceId,
  };
  checked.push("Railway retention service exists");

  const deployments = runRailway([
    "deployment",
    "list",
    "--service",
    serviceName,
    "--environment",
    "production",
    "--json",
    "--limit",
    "5",
  ]);
  if (!deployments.ok) {
    failures.push(`Could not read retention deployments: ${deployments.error}`);
    return;
  }

  const deploymentList = parseJson(deployments.stdout, "Railway deployment list JSON");
  if (!Array.isArray(deploymentList)) {
    failures.push("Could not parse retention deployment list JSON.");
    return;
  }

  const latest = deploymentList[0];
  diagnostics.latestDeployment = latest
    ? {
        id: latest.id,
        status: latest.status,
        createdAt: latest.createdAt,
        configFile: latest.meta?.configFile ?? null,
        cronSchedule: latest.meta?.serviceManifest?.deploy?.cronSchedule ?? null,
        startCommand: latest.meta?.serviceManifest?.deploy?.startCommand ?? null,
        restartPolicyType: latest.meta?.serviceManifest?.deploy?.restartPolicyType ?? null,
      }
    : null;
  checked.push("Railway retention deployments read");

  if (!latest) {
    failures.push(`Railway service "${serviceName}" has no deployments.`);
    return;
  }
  if (!["SUCCESS", "REMOVED"].includes(latest.status)) {
    failures.push(`Latest retention deployment status is ${latest.status}.`);
  }
  if (latest.meta?.configFile !== expectedConfigFile) {
    failures.push(`Latest retention deployment uses configFile ${latest.meta?.configFile ?? "null"}, expected ${expectedConfigFile}.`);
  }
  if (latest.meta?.serviceManifest?.deploy?.cronSchedule !== expectedCronSchedule) {
    failures.push(`Latest retention deployment cronSchedule is ${latest.meta?.serviceManifest?.deploy?.cronSchedule ?? "null"}, expected ${expectedCronSchedule}.`);
  }
  if (latest.meta?.serviceManifest?.deploy?.startCommand !== expectedStartCommand) {
    failures.push("Latest retention deployment does not use the expected retention startCommand.");
  }
}

function runRailway(args) {
  const result = spawnSync("railway", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30000,
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout,
    error: trim(result.stderr) || trim(result.stdout) || `railway ${args.join(" ")} exited ${result.status}`,
  };
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch {
    warnings.push(`${label} was not valid JSON.`);
    return undefined;
  }
}

function listServices(status) {
  const services = [];
  for (const environmentEdge of status.environments?.edges ?? []) {
    for (const instanceEdge of environmentEdge.node?.serviceInstances?.edges ?? []) {
      const instance = instanceEdge.node;
      if (instance?.serviceName) {
        services.push(instance);
      }
    }
  }
  return services;
}

function trim(value) {
  return value?.trim();
}
