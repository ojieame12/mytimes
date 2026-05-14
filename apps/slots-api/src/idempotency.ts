import { createHash } from "node:crypto";
import { getPool } from "./db.js";
import { ApiError } from "./errors.js";
import { loadEnv } from "./env.js";

const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,160}$/;

type IdempotencyRow = {
  id: string;
  request_hash: string;
  status: "processing" | "succeeded";
};

export function idempotencyKeyFromHeaders(headers: Headers): string | undefined {
  const value = headers.get("Idempotency-Key")?.trim();
  if (!value) {
    return undefined;
  }
  if (!KEY_PATTERN.test(value)) {
    throw new ApiError(
      400,
      "invalid_idempotency_key",
      "Idempotency-Key must be 8-160 characters using letters, numbers, dot, underscore, colon, or dash",
    );
  }
  return value;
}

export async function runIdempotent<T>(input: {
  routeKey: string;
  actorKey: string;
  idempotencyKey: string | undefined;
  requestBody: unknown;
  run: () => Promise<T>;
}): Promise<T> {
  if (!input.idempotencyKey) {
    return input.run();
  }

  const env = loadEnv();
  const actorKeyHash = hashValue(input.actorKey, env.tokenPepper);
  const idempotencyKeyHash = hashValue(input.idempotencyKey, env.tokenPepper);
  const requestHash = hashValue(canonicalJson(input.requestBody), env.tokenPepper);

  const inserted = await getPool().query<{ id: string }>(
    `
      insert into slotboard.idempotency_keys (
        route_key,
        actor_key_hash,
        idempotency_key_hash,
        request_hash,
        status
      )
      values ($1, $2, $3, $4, 'processing')
      on conflict (route_key, actor_key_hash, idempotency_key_hash) do nothing
      returning id
    `,
    [input.routeKey, actorKeyHash, idempotencyKeyHash, requestHash],
  );

  const id = inserted.rows[0]?.id;
  if (!id) {
    await rejectExistingIdempotency(input.routeKey, actorKeyHash, idempotencyKeyHash, requestHash);
  }

  try {
    const result = await input.run();
    await getPool().query(
      `
        update slotboard.idempotency_keys
        set status = 'succeeded'
        where id = $1
      `,
      [id],
    );
    return result;
  } catch (error) {
    await getPool().query("delete from slotboard.idempotency_keys where id = $1", [id]);
    throw error;
  }
}

async function rejectExistingIdempotency(
  routeKey: string,
  actorKeyHash: string,
  idempotencyKeyHash: string,
  requestHash: string,
): Promise<never> {
  const existing = await getPool().query<IdempotencyRow>(
    `
      select id, request_hash, status
      from slotboard.idempotency_keys
      where route_key = $1
        and actor_key_hash = $2
        and idempotency_key_hash = $3
      limit 1
    `,
    [routeKey, actorKeyHash, idempotencyKeyHash],
  );
  const row = existing.rows[0];
  if (!row) {
    throw new ApiError(409, "idempotency_conflict", "Idempotency state could not be resolved");
  }
  if (row.request_hash !== requestHash) {
    throw new ApiError(409, "idempotency_key_reused", "Idempotency-Key was already used with a different request body");
  }
  if (row.status === "processing") {
    throw new ApiError(409, "idempotency_request_in_progress", "An identical request is already in progress");
  }
  throw new ApiError(
    409,
    "idempotency_request_replayed",
    "This request already succeeded; use the original response",
  );
}

function hashValue(value: string, pepper: string): string {
  return createHash("sha256").update(`${pepper}${value}`, "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}
