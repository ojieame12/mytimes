import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { getPool } from "./db.js";
import { loadEnv } from "./env.js";
import { ApiError } from "./errors.js";

export async function assertRateLimit(
  routeKey: string,
  actorKey: string,
  options: {
    limit: number;
    windowSeconds: number;
  },
): Promise<void> {
  const cutoff = new Date(Date.now() - options.windowSeconds * 1000);
  const actorKeyHash = hashRateLimitKey(actorKey);
  const result = await getPool().query<{ count: string }>(
    `
      select count(*)::text as count
      from slotboard.rate_limit_events
      where route_key = $1
        and actor_key = $2
        and created_at >= $3
    `,
    [routeKey, actorKeyHash, cutoff],
  );

  if (Number(result.rows[0]?.count ?? 0) >= options.limit) {
    throw new ApiError(429, "rate_limited", "Too many requests. Try again later.");
  }

  await getPool().query(
    `
      insert into slotboard.rate_limit_events (route_key, actor_key)
      values ($1, $2)
    `,
    [routeKey, actorKeyHash],
  );
}

export function requestActorKey(headers: { get: (name: string) => string | null | undefined }): string {
  const smokeActor = process.env.NODE_ENV !== "production" ? cleanHeaderValue(headers.get("x-slotboard-smoke-actor")) : undefined;
  if (smokeActor) {
    return `dev:${smokeActor.slice(0, 128)}`;
  }

  const cloudflareIp = cleanHeaderValue(headers.get("cf-connecting-ip"));
  if (cloudflareIp && isIP(cloudflareIp)) {
    return `ip:${cloudflareIp}`;
  }

  const realIp = cleanHeaderValue(headers.get("x-real-ip"));
  if (realIp && isIP(realIp)) {
    return `ip:${realIp}`;
  }

  const forwardedFor = headers.get("x-forwarded-for");
  const forwardedIp = forwardedFor
    ?.split(",")
    .map((value) => cleanHeaderValue(value))
    .filter((value): value is string => typeof value === "string" && isIP(value) !== 0)
    .at(-1);
  return `ip:${forwardedIp ?? "unknown"}`;
}

function cleanHeaderValue(value: string | null | undefined): string | undefined {
  const cleaned = value?.trim();
  if (!cleaned || cleaned.length > 256 || /[\r\n]/.test(cleaned)) {
    return undefined;
  }
  return cleaned;
}

let rateLimitHashKey: string | undefined;

function hashRateLimitKey(value: string): string {
  rateLimitHashKey ??= loadEnv().tokenPepper;
  return createHmac("sha256", rateLimitHashKey).update(value, "utf8").digest("hex");
}
