import { betterAuth } from "better-auth";
import pg from "pg";
import { ApiError } from "./errors.js";
import { loadEnv } from "./env.js";

const { Pool } = pg;

type OrganizerAuth = ReturnType<typeof createOrganizerAuth>;

export type OrganizerSession = {
  user: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    image?: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  session: {
    id: string;
    userId: string;
    token: string;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
};

let organizerAuth: OrganizerAuth | undefined;
let organizerAuthPool: pg.Pool | undefined;

export function getOrganizerAuth(): OrganizerAuth {
  if (organizerAuth) {
    return organizerAuth;
  }

  const env = loadEnv();
  if (!env.databaseURL) {
    throw new Error("SLOTBOARD_DATABASE_URL is required for organizer authentication");
  }

  const auth = createOrganizerAuth(env);
  organizerAuth = auth;
  return auth;
}

function createOrganizerAuth(env: ReturnType<typeof loadEnv>) {
  if (!env.databaseURL) {
    throw new Error("SLOTBOARD_DATABASE_URL is required for organizer authentication");
  }

  organizerAuthPool = new Pool({
    connectionString: env.databaseURL,
    application_name: "slotboard-auth",
    options: "-c search_path=slotboard",
    max: env.dbPoolMax,
    connectionTimeoutMillis: env.dbConnectionTimeoutMs,
    idleTimeoutMillis: env.dbIdleTimeoutMs,
    query_timeout: env.dbQueryTimeoutMs,
    statement_timeout: env.dbStatementTimeoutMs,
  });

  return betterAuth({
    appName: "mytimes",
    baseURL: env.authBaseURL,
    basePath: "/api/auth",
    secret: env.authSecret,
    trustedOrigins: uniqueOrigins([env.authBaseURL, env.publicAppURL, ...env.webOrigins]),
    database: organizerAuthPool,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"],
      },
    },
    user: {
      modelName: "auth_users",
      fields: {
        emailVerified: "email_verified",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    session: {
      modelName: "auth_sessions",
      fields: {
        expiresAt: "expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
        userId: "user_id",
      },
    },
    account: {
      modelName: "auth_accounts",
      fields: {
        accountId: "account_id",
        providerId: "provider_id",
        userId: "user_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    verification: {
      modelName: "auth_verifications",
      fields: {
        expiresAt: "expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
  });
}

export async function closeOrganizerAuthPool(): Promise<void> {
  if (!organizerAuthPool) {
    return;
  }
  await organizerAuthPool.end();
  organizerAuthPool = undefined;
  organizerAuth = undefined;
}

export async function getOrganizerSession(headers: Headers): Promise<OrganizerSession | null> {
  const session = await getOrganizerAuth().api.getSession({ headers });
  return session as OrganizerSession | null;
}

export async function requireOrganizerSession(headers: Headers): Promise<OrganizerSession> {
  const session = await getOrganizerSession(headers);
  if (!session) {
    throw new ApiError(401, "auth_required", "Organizer account sign-in is required");
  }
  return session;
}

function uniqueOrigins(values: string[]): string[] {
  return [...new Set(values.map(originOrValue).filter(Boolean))];
}

function originOrValue(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}
