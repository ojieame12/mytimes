import {
  createTokenPair,
  generateAvailabilitySlots,
  type GeneratedSlot,
} from "@fresh-feel/slotboard-core";
import { randomBytes } from "node:crypto";
import type pg from "pg";
import { recordActivity } from "./activity.js";
import { ApiError } from "./errors.js";
import { loadEnv } from "./env.js";
import { withTransaction } from "./db.js";
import { readActiveCustomDomainBaseURL } from "./customDomains.js";
import {
  sendEventCreatedEmail,
  type EventCreatedEmailResult,
} from "./email.js";
import {
  FREE_ACTIVE_BOARD_LIMIT,
  EVENT_PASS_SLOT_LIMIT,
  readCreationEntitlement,
  type EventEntitlement,
} from "./entitlements.js";
import { buildShareMessage } from "./share.js";
import type { CreateEventInput } from "./validation.js";

export type CreatedEventResponse = {
  event: {
    id: string;
    title: string;
    description: string;
    organizerName: string;
    organizerEmail: string;
    avatarStyle: string;
    avatarSeed: string;
    timezone: string;
    meetingDurationMinutes: number;
    allowMultipleBookings: boolean;
    status: "active";
    planKey: "free" | "event_pass" | "company_standby";
    paymentStatus: "not_required" | "pending" | "paid" | "failed" | "refunded";
    paidAt?: string | undefined;
    expiresAt?: string | undefined;
    bookingLimit: number;
    slotLimit: number;
    slotCount: number;
    createdAt: string;
  };
  links: {
    public: string;
    admin: string;
  };
  shareMessage: string;
  email: EventCreatedEmailResult;
};

export async function createEvent(input: CreateEventInput, ownerUserId: string | null = null): Promise<CreatedEventResponse> {
  const env = loadEnv();
  const slots = safeGenerateSlots(input);
  if (slots.length < 1) {
    throw new ApiError(400, "empty_availability", "Availability must generate at least one slot");
  }
  const entitlement = await readCreationEntitlement(ownerUserId);
  assertGeneratedSlotsWithinCreationLimit(slots.length, entitlement);

  const publicToken = createTokenPair("public", env.tokenPepper);
  const adminToken = createTokenPair("admin", env.tokenPepper);
  const avatarSeed = randomBytes(12).toString("hex");

  const event = await withTransaction(async (client) => {
    await assertWithinFreeActiveBoardLimit(client, input, ownerUserId, entitlement);
    const result = await client.query<CreatedEventRow>(
      `
        insert into slotboard.booking_events (
          title,
          description,
          organizer_name,
          organizer_email,
          avatar_style,
          avatar_seed,
          timezone,
          timezone_locked_at,
          meeting_duration_minutes,
          allow_multiple_bookings,
          availability_config,
          public_token_hash,
          admin_token_hash,
          owner_user_id,
          plan_key,
          payment_status,
          paid_at,
          expires_at,
          booking_limit,
          slot_limit
        )
        values ($1, $2, $3, $4, $5, $6, $7, now(), $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        returning
          id,
          title,
          description,
          organizer_name,
          organizer_email,
          avatar_style,
          avatar_seed,
          timezone,
          meeting_duration_minutes,
          allow_multiple_bookings,
          status,
          plan_key,
          payment_status,
          paid_at,
          expires_at,
          booking_limit,
          slot_limit,
          created_at
      `,
      [
        input.title,
        input.description,
        input.organizerName,
        input.organizerEmail,
        input.avatarStyle,
        avatarSeed,
        input.timezone,
        input.availability.durationMinutes,
        input.allowMultipleBookings,
        JSON.stringify(input.availability),
        publicToken.tokenHash,
        adminToken.tokenHash,
        ownerUserId,
        entitlement.planKey,
        entitlement.paymentStatus,
        entitlement.paidAt,
        entitlement.expiresAt,
        entitlement.bookingLimit,
        entitlement.slotLimit,
      ],
    );

    const row = firstRow(result);
    await insertSlots(client, row.id, slots);
    await recordActivity(client, {
      eventId: row.id,
      type: "event_created",
      actorType: ownerUserId ? "organizer" : "system",
      actorLabel: input.organizerName,
      metadata: {
        slotCount: slots.length,
        timezone: input.timezone,
        startDate: input.availability.startDate,
        endDate: input.availability.endDate,
        planKey: entitlement.planKey,
        bookingLimit: entitlement.bookingLimit,
        slotLimit: entitlement.slotLimit,
      },
    });
    return row;
  });

  const participantBaseURL = await readActiveCustomDomainBaseURL({
    ownerUserId,
    ownerEmail: event.organizer_email,
  }) ?? env.publicAppURL;
  const publicURL = buildAppURL(`/b/${publicToken.rawToken}`, participantBaseURL);
  const adminURL = buildAppURL(`/a/${adminToken.rawToken}`, env.publicAppURL);
  const email = await sendEventCreatedEmail({
    event: {
      id: event.id,
      title: event.title,
      organizerName: event.organizer_name,
      organizerEmail: event.organizer_email,
      durationMinutes: event.meeting_duration_minutes,
      expiresAt: event.expires_at?.toISOString(),
    },
    publicURL,
    adminURL,
  });

  return {
    event: {
      id: event.id,
      title: event.title,
      description: event.description,
      organizerName: event.organizer_name,
      organizerEmail: event.organizer_email,
      avatarStyle: event.avatar_style,
      avatarSeed: event.avatar_seed ?? avatarSeed,
      timezone: event.timezone,
      meetingDurationMinutes: event.meeting_duration_minutes,
      allowMultipleBookings: event.allow_multiple_bookings,
      status: "active",
      planKey: event.plan_key,
      paymentStatus: event.payment_status,
      paidAt: event.paid_at?.toISOString(),
      expiresAt: event.expires_at?.toISOString(),
      bookingLimit: event.booking_limit,
      slotLimit: event.slot_limit,
      slotCount: slots.length,
      createdAt: event.created_at.toISOString(),
    },
    links: {
      public: publicURL,
      admin: adminURL,
    },
    shareMessage: buildShareMessage({
      title: event.title,
      organizerName: event.organizer_name,
    }, publicURL),
    email,
  };
}

async function assertWithinFreeActiveBoardLimit(
  client: pg.PoolClient,
  input: CreateEventInput,
  ownerUserId: string | null,
  entitlement: EventEntitlement,
): Promise<void> {
  if (entitlement.planKey !== "free") {
    return;
  }

  const result = await client.query<{ count: string }>(
    `
      select count(*)::text as count
      from slotboard.booking_events
      where status = 'active'
        and deleted_at is null
        and plan_key = 'free'
        and (
          expires_at is null
          or expires_at > now()
        )
        and (
          ($1::text is not null and owner_user_id = $1) or
          ($1::text is null and lower(organizer_email) = lower($2))
        )
    `,
    [ownerUserId, input.organizerEmail],
  );
  const activeBoards = Number(result.rows[0]?.count ?? 0);
  if (activeBoards >= FREE_ACTIVE_BOARD_LIMIT) {
    throw new ApiError(
      402,
      "active_board_limit_reached",
      `Free includes ${FREE_ACTIVE_BOARD_LIMIT} active boards. Archive an older board or start Company to create more.`,
    );
  }
}

function safeGenerateSlots(input: CreateEventInput): GeneratedSlot[] {
  try {
    return generateAvailabilitySlots(input.availability);
  } catch (error) {
    throw new ApiError(
      400,
      "invalid_availability",
      error instanceof Error ? error.message : "Invalid availability input",
    );
  }
}

function assertGeneratedSlotsWithinCreationLimit(slotCount: number, entitlement: EventEntitlement): void {
  const creationLimit = Math.max(entitlement.slotLimit, EVENT_PASS_SLOT_LIMIT);
  if (slotCount <= creationLimit) {
    return;
  }
  if (entitlement.planKey === "company_standby") {
    throw new ApiError(
      402,
      "slot_limit_reached",
      `This setup creates ${slotCount} slots. Company supports up to ${entitlement.slotLimit} generated slots; reduce the availability range for this board.`,
    );
  }
  throw new ApiError(
    402,
    "slot_limit_reached",
    `This setup creates ${slotCount} slots. The board unlock supports up to ${EVENT_PASS_SLOT_LIMIT} generated slots; reduce the availability range or use Company for larger recurring rounds.`,
  );
}

async function insertSlots(client: pg.PoolClient, eventId: string, slots: GeneratedSlot[]): Promise<void> {
  const params: Array<string | number> = [];
  const values = slots.map((slot, index) => {
    const offset = index * 7;
    params.push(
      eventId,
      slot.startsAt,
      slot.endsAt,
      1,
      slot.sourceDate,
      slot.sourceStartTime,
      slot.sourceEndTime,
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`;
  });

  await client.query(
    `
      insert into slotboard.time_slots (
        event_id,
        starts_at,
        ends_at,
        capacity,
        source_date,
        source_start_time,
        source_end_time
      )
      values ${values.join(", ")}
    `,
    params,
  );
}

function firstRow<T extends pg.QueryResultRow>(result: pg.QueryResult<T>): T {
  const row = result.rows[0];
  if (!row) {
    throw new Error("Expected inserted row");
  }
  return row;
}

function buildAppURL(path: string, baseURL: string): string {
  return new URL(path, withTrailingSlash(baseURL)).toString();
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

type CreatedEventRow = {
  id: string;
  title: string;
  description: string;
  organizer_name: string;
  organizer_email: string;
  avatar_style: string;
  avatar_seed: string | null;
  timezone: string;
  meeting_duration_minutes: number;
  allow_multiple_bookings: boolean;
  status: "active";
  plan_key: "free" | "event_pass" | "company_standby";
  payment_status: "not_required" | "pending" | "paid" | "failed" | "refunded";
  paid_at: Date | null;
  expires_at: Date | null;
  booking_limit: number;
  slot_limit: number;
  created_at: Date;
};
