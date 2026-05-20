import { resolve4, resolve6, resolveCname } from "node:dns/promises";
import { spawnSync } from "node:child_process";

const apiDomain = process.env.SLOTBOARD_API_DOMAIN || "api.mytimes.co";
const apiServiceName = process.env.SLOTBOARD_API_SERVICE_NAME || "api";
const readyPath = process.env.SLOTBOARD_API_READY_PATH || "/readyz";

const checked = [];
const warnings = [];
const failures = [];
const diagnostics = {};

await checkDns(apiDomain);
await checkRailwayMetadata();
await checkPublicApiDomain();

const ok = failures.length === 0;
const result = {
  ok,
  apiDomain,
  apiServiceName,
  diagnostics,
  warnings,
  failures,
  checked,
};

console[ok ? "log" : "error"](JSON.stringify(result, null, 2));
process.exit(ok ? 0 : 1);

async function checkDns(hostname) {
  const [a, aaaa, cname] = await Promise.all([
    resolve4(hostname).catch(() => []),
    resolve6(hostname).catch(() => []),
    resolveCname(hostname).catch(() => []),
  ]);
  diagnostics.dns = { a, aaaa, cname };
  checked.push("api DNS records resolved");
  if (a.length === 0 && aaaa.length === 0 && cname.length === 0) {
    failures.push(`${hostname} has no public A, AAAA, or CNAME records.`);
  }
  const cloudflareProxy = a.some(isCloudflareIPv4) || aaaa.some(isCloudflareIPv6);
  diagnostics.dns.cloudflareProxy = cloudflareProxy;
  if (cloudflareProxy) {
    warnings.push(`${hostname} resolves to Cloudflare proxy IPs. Keep the Cloudflare DNS record DNS-only/unproxied until Railway verifies and serves this custom domain.`);
  } else if (a.length > 0 || aaaa.length > 0) {
    warnings.push(`${hostname} resolves to public A/AAAA records. If this is a proxied CNAME, keep it DNS-only until Railway verifies the custom domain.`);
  }
}

async function checkRailwayMetadata() {
  const railway = spawnSync("railway", ["status", "--json"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30000,
  });
  if (railway.status !== 0) {
    warnings.push(`Could not read Railway status: ${trim(railway.stderr) || trim(railway.stdout) || "unknown error"}`);
    return;
  }

  let status;
  try {
    status = JSON.parse(railway.stdout);
  } catch {
    warnings.push("Could not parse Railway status JSON.");
    return;
  }

  const instance = findServiceInstance(status, apiServiceName);
  if (!instance) {
    warnings.push(`Railway service "${apiServiceName}" was not found in linked project status.`);
    return;
  }

  const serviceDomains = instance.domains?.serviceDomains ?? [];
  const customDomains = instance.domains?.customDomains ?? [];
  const generatedDomain = serviceDomains[0]?.domain;
  const apiCustomDomain = customDomains.find((domain) => domain.domain === apiDomain);
  diagnostics.railway = {
    serviceName: instance.serviceName,
    serviceId: instance.serviceId,
    generatedDomain,
    customDomain: apiCustomDomain
      ? {
          domain: apiCustomDomain.domain,
          targetPort: apiCustomDomain.targetPort ?? null,
        }
      : null,
  };
  checked.push("Railway API service metadata read");

  if (!apiCustomDomain) {
    failures.push(`${apiDomain} is not attached to the Railway "${apiServiceName}" service.`);
  } else if (apiCustomDomain.targetPort !== 3014) {
    warnings.push(`${apiDomain} is attached to Railway with target port ${apiCustomDomain.targetPort}; API normally listens on 3014.`);
  }

  if (generatedDomain) {
    const generated = await fetchJson(`https://${generatedDomain}${readyPath}`);
    diagnostics.generatedRailwayDomain = summarizeResponse(generated);
    checked.push("Railway generated API domain checked");
    if (generated.status !== 200 || generated.json?.ok !== true) {
      failures.push(`Railway generated API domain ${generatedDomain} did not return ready ok=true.`);
    }
  }
}

async function checkPublicApiDomain() {
  const branded = await fetchJson(`https://${apiDomain}${readyPath}`);
  diagnostics.brandedApiDomain = summarizeResponse(branded);
  checked.push("branded API domain checked");
  if (branded.status === 200 && branded.json?.ok === true) {
    return;
  }
  const fallback = branded.headers["x-railway-fallback"] === "true";
  if (fallback) {
    failures.push(`${apiDomain} reaches Railway edge but returns Railway fallback 404. Remove/re-add the custom domain on the Railway "${apiServiceName}" service, keep the DNS record unproxied/DNS-only while Railway verifies it, then run this check again.`);
    return;
  }
  failures.push(`${apiDomain} did not return ready ok=true. HTTP status: ${branded.status || "network_error"}.`);
}

function findServiceInstance(status, serviceName) {
  for (const environmentEdge of status.environments?.edges ?? []) {
    for (const instanceEdge of environmentEdge.node?.serviceInstances?.edges ?? []) {
      const instance = instanceEdge.node;
      if (instance?.serviceName === serviceName) {
        return instance;
      }
    }
  }
  return undefined;
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return {
      url,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      json,
      text: text.slice(0, 500),
    };
  } catch (error) {
    return {
      url,
      status: 0,
      headers: {},
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarizeResponse(response) {
  return {
    url: response.url,
    status: response.status,
    ok: response.json?.ok ?? false,
    railwayFallback: response.headers["x-railway-fallback"] ?? undefined,
    railwayEdge: response.headers["x-railway-edge"] ?? undefined,
    error: response.error,
  };
}

function trim(value) {
  return value?.trim();
}

function isCloudflareIPv4(address) {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }
  const [a, b] = parts;
  return (
    (a === 104 && b >= 16 && b <= 31) ||
    (a === 172 && b >= 64 && b <= 71) ||
    (a === 188 && b === 114) ||
    (a === 190 && b === 93) ||
    (a === 197 && b === 234) ||
    (a === 198 && b === 41) ||
    (a === 162 && (b === 158 || b === 159)) ||
    (a === 141 && b === 101) ||
    (a === 108 && b === 162) ||
    (a === 103 && (b === 21 || b === 22 || b === 31)) ||
    (a === 131 && b === 0) ||
    (a === 173 && b === 245)
  );
}

function isCloudflareIPv6(address) {
  return address.toLowerCase().startsWith("2606:4700:");
}
