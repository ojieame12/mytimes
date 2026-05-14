import type pg from "pg";
import { getPool } from "./db.js";

export type ActivityType =
  | "event_created"
  | "event_updated"
  | "event_archived"
  | "event_deleted"
  | "slot_closed"
  | "slot_reopened"
  | "booking_created"
  | "booking_cancelled"
  | "public_link_rotated"
  | "admin_link_rotated"
  | "manage_link_rotated";

export type ActivityActorType = "system" | "organizer" | "participant";

export type ActivityDTO = {
  id: string;
  eventId: string;
  type: ActivityType;
  actorType: ActivityActorType;
  actorLabel?: string | undefined;
  slotId?: string | undefined;
  bookingId?: string | undefined;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type RecordActivityInput = {
  eventId: string;
  type: ActivityType;
  actorType: ActivityActorType;
  actorLabel?: string | undefined;
  slotId?: string | undefined;
  bookingId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
};

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

export async function recordActivity(
  client: Queryable,
  input: RecordActivityInput,
): Promise<void> {
  await client.query(
    `
      insert into slotboard.activity_events (
        event_id,
        type,
        actor_type,
        actor_label,
        slot_id,
        booking_id,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [
      input.eventId,
      input.type,
      input.actorType,
      input.actorLabel ?? null,
      input.slotId ?? null,
      input.bookingId ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

export async function readActivityForEvent(
  eventId: string,
  limit = 25,
  client: Queryable = getPool(),
): Promise<ActivityDTO[]> {
  const result = await client.query<ActivityRow>(
    `
      select
        id,
        event_id,
        type,
        actor_type,
        actor_label,
        slot_id,
        booking_id,
        metadata,
        created_at
      from slotboard.activity_events
      where event_id = $1
      order by created_at desc, id desc
      limit $2
    `,
    [eventId, Math.min(Math.max(limit, 1), 100)],
  );
  return result.rows.map(mapActivity);
}

function mapActivity(row: ActivityRow): ActivityDTO {
  return {
    id: row.id,
    eventId: row.event_id,
    type: row.type,
    actorType: row.actor_type,
    actorLabel: row.actor_label ?? undefined,
    slotId: row.slot_id ?? undefined,
    bookingId: row.booking_id ?? undefined,
    metadata: row.metadata,
    createdAt: row.created_at.toISOString(),
  };
}

type ActivityRow = {
  id: string;
  event_id: string;
  type: ActivityType;
  actor_type: ActivityActorType;
  actor_label: string | null;
  slot_id: string | null;
  booking_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};
