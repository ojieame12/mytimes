const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

process.env.SLOTBOARD_RAILWAY_API_TOKEN = "railway_test_token";
process.env.SLOTBOARD_RAILWAY_PROJECT_ID = "project_test";
process.env.SLOTBOARD_RAILWAY_ENVIRONMENT_ID = "environment_test";
process.env.SLOTBOARD_RAILWAY_CUSTOM_DOMAIN_SERVICE_ID = "service_slots_test";
process.env.SLOTBOARD_RAILWAY_DOMAIN_PORT = "4174";
process.env.SLOTBOARD_CUSTOM_DOMAIN_CNAME_TARGET = "slots-production-12d4.up.railway.app";

const { customDomainReadiness, loadEnv } = await import("../apps/slots-api/src/env.ts");
const {
  attachRailwayCustomDomain,
  hasRailwayCustomDomainAutomation,
} = await import("../apps/slots-api/src/railwayDomains.ts");

try {
  const env = loadEnv();
  assert(hasRailwayCustomDomainAutomation(env), "expected Railway custom-domain automation to be configured");
  const readiness = customDomainReadiness(env);
  assert(readiness.activationMode === "railway_api", `expected railway_api activation, got ${readiness.activationMode}`);
  assert(readiness.selfServeActivation === true, "expected selfServeActivation=true");

  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url, init });
    const body = JSON.parse(init.body);
    assert(body.variables.input.projectId === "project_test", "expected project id in Railway mutation");
    assert(body.variables.input.environmentId === "environment_test", "expected environment id in Railway mutation");
    assert(body.variables.input.serviceId === "service_slots_test", "expected frontend service id in Railway mutation");
    assert(body.variables.input.domain === "book.example.com", "expected custom hostname in Railway mutation");
    assert(body.variables.input.targetPort === 4174, "expected frontend target port in Railway mutation");
    return jsonResponse({
      data: {
        customDomainCreate: {
          id: "railway-domain-test",
          domain: "book.example.com",
          targetPort: 4174,
          syncStatus: "CREATING",
          status: {
            verified: false,
            certificateStatus: "PENDING",
          },
        },
      },
    });
  };

  const attached = await attachRailwayCustomDomain({ hostname: "book.example.com", env });
  assert(attached.id === "railway-domain-test", "expected Railway attachment id");
  assert(attached.targetPort === 4174, "expected Railway target port");
  assert(seen.length === 1, "expected one Railway GraphQL call");

  globalThis.fetch = async () =>
    jsonResponse({
      errors: [
        {
          message: "Domain is already connected to another service",
        },
      ],
    });

  await assertRejects(
    () => attachRailwayCustomDomain({ hostname: "taken.example.com", env }),
    "railway_custom_domain_request_failed",
  );

  console.log(JSON.stringify({
    ok: true,
    checked: [
      "railway-custom-domain-readiness",
      "railway-custom-domain-create-mutation",
      "railway-custom-domain-error-sanitized",
    ],
  }));
} finally {
  globalThis.fetch = originalFetch;
  process.env = originalEnv;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function assertRejects(fn, code) {
  try {
    await fn();
  } catch (error) {
    assert(error?.code === code, `expected ${code}, got ${error?.code ?? error}`);
    return;
  }
  throw new Error(`expected ${code} rejection`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
