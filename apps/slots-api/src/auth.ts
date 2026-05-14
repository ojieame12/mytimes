import { hashBearerToken, type TokenPurpose } from "@fresh-feel/slotboard-core";
import type { Context } from "hono";
import { loadEnv } from "./env.js";
import { ApiError } from "./errors.js";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;

export function tokenHash(rawToken: string): string {
  return hashBearerToken(rawToken, loadEnv().tokenPepper);
}

export function tokenFromRequest(
  c: Context,
  options: {
    purpose: TokenPurpose;
    paramName?: string | undefined;
  },
): string {
  const header = c.req.header("Authorization");
  const token = header ? bearerToken(header) : options.paramName ? c.req.param(options.paramName) : undefined;

  if (!token || !TOKEN_PATTERN.test(token)) {
    throw new ApiError(401, "invalid_token", `${options.purpose} token is missing or invalid`);
  }

  return token;
}

function bearerToken(header: string): string | undefined {
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim();
}
