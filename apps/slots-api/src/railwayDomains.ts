import type { Env } from "./env.js";
import { loadEnv } from "./env.js";
import { ApiError } from "./errors.js";

const RAILWAY_GRAPHQL_URL = "https://backboard.railway.app/graphql/v2";

type RailwayCustomDomain = {
  id: string;
  domain: string;
  targetPort?: number | null;
  syncStatus?: string | null;
  status?: {
    verified?: boolean;
    certificateStatus?: string;
  } | null;
};

type RailwayGraphQLError = {
  message?: string;
  extensions?: {
    code?: string;
  };
};

type RailwayGraphQLResponse<T> = {
  data?: T;
  errors?: RailwayGraphQLError[];
};

export type RailwayCustomDomainAttachment = {
  id: string;
  domain: string;
  targetPort?: number | undefined;
  syncStatus?: string | undefined;
  verified?: boolean | undefined;
  certificateStatus?: string | undefined;
};

export function hasRailwayCustomDomainAutomation(env: Env = loadEnv()): boolean {
  return Boolean(
    env.railwayApiToken &&
      env.railwayProjectId &&
      env.railwayEnvironmentId &&
      env.railwayCustomDomainServiceId,
  );
}

export async function attachRailwayCustomDomain(input: {
  hostname: string;
  env?: Env | undefined;
}): Promise<RailwayCustomDomainAttachment> {
  const env = input.env ?? loadEnv();
  const missing = [
    env.railwayApiToken ? undefined : "SLOTBOARD_RAILWAY_API_TOKEN or RAILWAY_TOKEN",
    env.railwayProjectId ? undefined : "SLOTBOARD_RAILWAY_PROJECT_ID or RAILWAY_PROJECT_ID",
    env.railwayEnvironmentId ? undefined : "SLOTBOARD_RAILWAY_ENVIRONMENT_ID or RAILWAY_ENVIRONMENT_ID",
    env.railwayCustomDomainServiceId ? undefined : "SLOTBOARD_RAILWAY_CUSTOM_DOMAIN_SERVICE_ID",
  ].filter((item): item is string => Boolean(item));

  if (missing.length > 0) {
    throw new ApiError(
      503,
      "railway_custom_domain_not_configured",
      `Railway custom-domain automation is missing: ${missing.join(", ")}.`,
    );
  }

  const result = await railwayGraphQL<{ customDomainCreate: RailwayCustomDomain }>(
    env,
    `
      mutation CreateMytimesCustomDomain($input: CustomDomainCreateInput!) {
        customDomainCreate(input: $input) {
          id
          domain
          targetPort
          syncStatus
          status {
            verified
            certificateStatus
          }
        }
      }
    `,
    {
      input: {
        projectId: env.railwayProjectId,
        environmentId: env.railwayEnvironmentId,
        serviceId: env.railwayCustomDomainServiceId,
        domain: input.hostname,
        targetPort: env.railwayCustomDomainTargetPort,
      },
    },
  );

  const domain = result.customDomainCreate;
  return {
    id: domain.id,
    domain: domain.domain,
    targetPort: domain.targetPort ?? undefined,
    syncStatus: domain.syncStatus ?? undefined,
    verified: domain.status?.verified ?? undefined,
    certificateStatus: domain.status?.certificateStatus ?? undefined,
  };
}

async function railwayGraphQL<T>(
  env: Env,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(RAILWAY_GRAPHQL_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.railwayApiToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const text = await response.text();
  let body: RailwayGraphQLResponse<T> | undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // Keep the sanitized HTTP error below.
  }

  if (!response.ok) {
    throw new ApiError(
      502,
      "railway_custom_domain_request_failed",
      `Railway custom-domain request failed with HTTP ${response.status}.`,
    );
  }

  if (body?.errors?.length) {
    throw new ApiError(
      502,
      "railway_custom_domain_request_failed",
      sanitizeRailwayError(body.errors),
    );
  }

  if (!body?.data) {
    throw new ApiError(
      502,
      "railway_custom_domain_request_failed",
      "Railway custom-domain request did not return data.",
    );
  }

  return body.data;
}

function sanitizeRailwayError(errors: RailwayGraphQLError[]): string {
  const messages = errors
    .map((error) => error.message?.trim())
    .filter((message): message is string => Boolean(message));
  if (messages.length === 0) {
    return "Railway custom-domain request failed.";
  }
  return messages.join("; ").slice(0, 500);
}
