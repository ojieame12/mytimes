import { createHash } from "node:crypto";
import type { ProductEventInput } from "./validation.js";
import { getPool } from "./db.js";
import { ApiError } from "./errors.js";

export async function recordProductEvent(
  input: ProductEventInput,
  actorKey: string,
): Promise<{ ok: true }> {
  try {
    await getPool().query(
      `
        insert into slotboard.product_events (
          event_id,
          booking_id,
          name,
          actor_type,
          actor_key_hash,
          metadata
        )
        values ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        input.eventId ?? null,
        input.bookingId ?? null,
        input.name,
        input.actorType,
        hashActorKey(actorKey),
        JSON.stringify(input.metadata),
      ],
    );
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new ApiError(400, "invalid_product_event", "eventId or bookingId does not exist");
    }
    throw error;
  }
  return { ok: true };
}

function hashActorKey(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23503";
}
