import {
  createBookingCancellationIcs,
  createBookingRequestIcs,
  createTokenPair,
} from "@fresh-feel/slotboard-core";
import type pg from "pg";
import { recordActivity, readActivityForEvent, type ActivityDTO } from "./activity.js";
import { tokenHash } from "./auth.js";
import { readActiveCustomDomainBaseURL } from "./customDomains.js";
import { getPool, withTransaction } from "./db.js";
import {
  sendAdminRecoveryEmail,
  type BookingClaimedEmailResult,
  type EmailDeliveryResult,
  sendBookingCancellationEmails,
  sendBookingClaimedEmails,
  sendManagedBookingDetailsEmail,
  sendManageLinkRecoveryEmail,
} from "./email.js";
import { loadEnv } from "./env.js";
import { hasActiveCompanyStandby } from "./entitlements.js";
import { ApiError } from "./errors.js";
import { logInfo } from "./logger.js";
import { notifyWorkspaceIntegrations } from "./notificationIntegrations.js";
import { buildShareMessage } from "./share.js";
import type {
  CancelBookingInput,
  ClaimSlotInput,
  ManageLinkRecoveryInput,
  RescheduleBookingInput,
  UpdateEventInput,
} from "./validation.js";

export type EventDTO = {
  id: string;
  title: string;
  description: string;
  organizerName: string;
  organizerEmail: string;
  avatarStyle: "notionists" | "open-peeps" | "lorelei" | "big-smile";
  avatarSeed?: string | undefined;
  timezone: string;
  durationMinutes: number;
  intervalMinutes: number;
  allowMultipleBookings: boolean;
  status: "active" | "archived" | "deleted";
  planKey: "free" | "event_pass" | "company_standby";
  paymentStatus: "not_required" | "pending" | "paid" | "failed" | "refunded";
  paidAt?: string | undefined;
  expiresAt?: string | undefined;
  bookingLimit: number;
  slotLimit: number;
  createdAt: string;
  updatedAt: string;
};

export type SlotDTO = {
  id: string;
  eventId: string;
  startsAt: string;
  endsAt: string;
  sourceDate?: string | undefined;
  sourceStartTime?: string | undefined;
  sourceEndTime?: string | undefined;
  state: "open" | "booked" | "closed" | "blocked" | "just-claimed" | "cancelled";
  closeAfterBooking?: boolean | undefined;
  bookingId?: string | undefined;
  bookedInitials?: string | undefined;
  bookedName?: string | undefined;
  bookedEmail?: string | undefined;
  bookedNotes?: string | undefined;
  bookedAt?: string | undefined;
  emailBounced?: boolean | undefined;
};

export type BookingDTO = {
  id: string;
  eventId: string;
  slotId: string;
  participantName: string;
  participantEmail: string;
  participantTimezone?: string | undefined;
  participantLocale?: string | undefined;
  participantOffsetAtBooking?: string | undefined;
  notes: string;
  status: "active" | "cancelled";
  bookedAt: string;
  cancelledAt?: string | undefined;
  cancelledBy?: "participant" | "organizer" | undefined;
  icsSequence: number;
};

export type OrganizerEventSummaryDTO = {
  event: EventDTO;
  slotCount: number;
  activeBookingCount: number;
};

export type DashboardDTO = {
  event: EventDTO;
  slots: SlotDTO[];
  activity: ActivityDTO[];
};

export type RotatedPublicLinkResponse = {
  event: EventDTO;
  links: {
    public: string;
  };
  shareMessage: string;
};

export type CalendarDownload = {
  filename: string;
  contentType: string;
  content: string;
};

export type BookingEmailResendResponse = {
  event: EventDTO;
  slot: SlotDTO;
  booking: BookingDTO;
  links: {
    manage: string;
  };
  delivery: EmailDeliveryResult;
};

export async function readPublicBoard(rawToken: string): Promise<{ event: EventDTO; slots: SlotDTO[] }> {
  const event = await resolveEventByToken("public_token_hash", rawToken);
  const slots = isEventPubliclyBookable(event)
    ? await readOpenSlots(event.id, event.slotLimit)
    : [];
  return { event, slots };
}

export async function claimSlot(
  rawToken: string,
  input: ClaimSlotInput,
): Promise<{
  event: EventDTO;
  slot: SlotDTO;
  booking: BookingDTO;
  links: { manage: string };
  email: BookingClaimedEmailResult;
}> {
  const env = loadEnv();
  const manageToken = createTokenPair("manage", env.tokenPepper);

  const result = await withTransaction(async (client) => {
    const event = await resolveEventByToken("public_token_hash", rawToken, client, true);
    if (event.status !== "active") {
      throw new ApiError(409, "event_not_active", "This event is not accepting bookings");
    }
    if (isEventExpired(event)) {
      throw new ApiError(409, "event_expired", "This booking board is no longer accepting bookings");
    }
    if (!isEventPaymentReady(event)) {
      throw new ApiError(
        402,
        "event_payment_pending",
        "This booking board is waiting for payment before it can accept bookings",
      );
    }

    const slot = await lockSlotAndOverlaps(client, event.id, input.slotId);
    await assertSlotWithinPublishedLimit(client, event, input.slotId);

    if (slot.status !== "open") {
      throw new ApiError(409, "slot_unavailable", "This slot is not open");
    }

    const activeOverlapCount = await activeOverlappingBookingCount(client, event.id, slot);
    if (activeOverlapCount > 0) {
      throw new ApiError(409, "slot_unavailable", "This slot overlaps a booking that has already been claimed");
    }

    const dedupeEmail = event.allowMultipleBookings ? null : input.participantEmail;
    if (dedupeEmail) {
      const existing = await client.query(
        `
          select 1
          from slotboard.bookings
          where event_id = $1
            and dedupe_email = $2
            and cancelled_at is null
          limit 1
        `,
        [event.id, dedupeEmail],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        throw new ApiError(409, "duplicate_booking", "This email already has an active booking for this event");
      }
    }

    await assertEventBookingLimit(client, event);

    const booking = await insertBooking(client, event.id, input, manageToken.tokenHash, dedupeEmail);
    await recordActivity(client, {
      eventId: event.id,
      type: "booking_created",
      actorType: "participant",
      actorLabel: input.participantName,
      slotId: input.slotId,
      bookingId: booking.id,
      metadata: {
        participantEmailDomain: emailDomain(input.participantEmail),
        startsAt: slot.starts_at.toISOString(),
        endsAt: slot.ends_at.toISOString(),
      },
    });
    return { event, slot, booking };
  });

  const manageURL = await buildParticipantURL(`/m/${manageToken.rawToken}`, result.event);
  const calendarURL = await buildParticipantCalendarURL(manageToken.rawToken, result.event);
  const response = {
    event: result.event,
    slot: {
      id: result.slot.id,
      eventId: result.slot.event_id,
      startsAt: result.slot.starts_at.toISOString(),
      endsAt: result.slot.ends_at.toISOString(),
      ...sourceSlotFields(result.slot),
      state: "just-claimed" as const,
      closeAfterBooking: result.slot.close_after_booking,
    },
    booking: mapBooking(result.booking),
    links: {
      manage: manageURL,
    },
  };

  const email = await sendBookingClaimedEmails({
    event: response.event,
    slot: response.slot,
    booking: response.booking,
    manageURL: response.links.manage,
    calendarURL,
  });
  await notifyWorkspaceIntegrations({
    type: "booking_created",
    event: response.event,
    slot: response.slot,
    booking: response.booking,
  });

  return {
    ...response,
    email,
  };
}

export async function readManageBooking(rawToken: string): Promise<{
  event: EventDTO;
  slot: SlotDTO;
  booking: BookingDTO;
}> {
  const row = await readBookingByManageToken(rawToken);
  return mapManageRow(row);
}

export async function readManagedRescheduleOptions(rawToken: string): Promise<{
  event: EventDTO;
  slot: SlotDTO;
  booking: BookingDTO;
  slots: SlotDTO[];
}> {
  const current = await readManageBooking(rawToken);
  const slots = current.booking.status === "active" && isEventPubliclyBookable(current.event)
    ? await readOpenSlots(current.event.id, current.event.slotLimit, {
      excludeBookingId: current.booking.id,
      excludeSlotId: current.slot.id,
    })
    : [];
  return {
    ...current,
    slots,
  };
}

export async function resendManagedBookingEmail(rawToken: string): Promise<{
  event: EventDTO;
  slot: SlotDTO;
  booking: BookingDTO;
  delivery: EmailDeliveryResult;
}> {
  const response = await readManageBooking(rawToken);
  const manageURL = await buildParticipantURL(`/m/${rawToken}`, response.event);
  const calendarURL = await buildParticipantCalendarURL(rawToken, response.event);
  const delivery = await sendManagedBookingDetailsEmail({
    ...response,
    manageURL,
    calendarURL,
  });
  logInfo("slotboard_manage_booking_email_resent", {
    eventId: response.event.id,
    bookingId: response.booking.id,
    status: response.booking.status,
    deliveryStatus: delivery.status,
    recipientDomain: emailDomain(response.booking.participantEmail),
  });
  return {
    ...response,
    delivery,
  };
}

export async function cancelManagedBooking(
  rawToken: string,
  input: CancelBookingInput,
): Promise<{ event: EventDTO; slot: SlotDTO; booking: BookingDTO }> {
  const result = await withTransaction(async (client) => {
    const locked = await lockBookingByManageToken(client, rawToken);
    let changed = false;
    if (!locked.cancelled_at) {
      changed = true;
      await client.query(
        `
          update slotboard.bookings
          set cancelled_at = now(),
              cancelled_by = 'participant',
              cancelled_reason = $2,
              ics_sequence = ics_sequence + 1
          where id = $1
        `,
        [locked.booking_id, input.reason],
      );
      if (!locked.close_after_booking) {
        await client.query(
          `
            update slotboard.time_slots
            set status = 'open'
            where id = $1
          `,
          [locked.slot_id],
        );
      }
      await recordActivity(client, {
        eventId: locked.event_id,
        type: "booking_cancelled",
        actorType: "participant",
        actorLabel: locked.participant_name,
        slotId: locked.slot_id,
        bookingId: locked.booking_id,
        metadata: {
          reopenedSlot: !locked.close_after_booking,
          reasonProvided: input.reason.length > 0,
        },
      });
    }
    return {
      row: await readBookingByManageToken(rawToken, client),
      changed,
    };
  });

  const response = mapManageRow(result.row);
  if (result.changed) {
    const reopenedSlot = !response.slot.closeAfterBooking &&
      response.event.status === "active" &&
      !isEventExpired(response.event);
    await sendBookingCancellationEmails({
      event: response.event,
      slot: response.slot,
      booking: response.booking,
      cancelledBy: "participant",
      reopenedSlot,
      openSlotCount: reopenedSlot ? await countPublishedOpenSlots(response.event) : undefined,
      calendarURL: await buildParticipantCalendarURL(rawToken, response.event),
    });
    await notifyWorkspaceIntegrations({
      type: "booking_cancelled",
      event: response.event,
      slot: response.slot,
      booking: response.booking,
    });
  }
  return response;
}

export async function rescheduleManagedBooking(
  rawToken: string,
  input: RescheduleBookingInput,
): Promise<{
  event: EventDTO;
  slot: SlotDTO;
  booking: BookingDTO;
  email: BookingClaimedEmailResult;
}> {
  const result = await withTransaction(async (client) => {
    const locked = await lockBookingByManageToken(client, rawToken);
    const event = mapEventFromBookingRow(locked);

    if (locked.cancelled_at) {
      throw new ApiError(409, "booking_cancelled", "This booking has already been cancelled");
    }
    if (locked.slot_id === input.slotId) {
      throw new ApiError(409, "same_slot", "Choose a different slot to reschedule this booking");
    }
    if (event.status !== "active") {
      throw new ApiError(409, "event_not_active", "This event is not accepting booking changes");
    }
    if (isEventExpired(event)) {
      throw new ApiError(409, "event_expired", "This booking board is no longer accepting booking changes");
    }
    if (!isEventPaymentReady(event)) {
      throw new ApiError(
        402,
        "event_payment_pending",
        "This booking board is waiting for payment before it can accept booking changes",
      );
    }

    const targetSlot = await lockSlotAndOverlaps(client, event.id, input.slotId);
    await assertSlotWithinPublishedLimit(client, event, input.slotId);
    if (targetSlot.status !== "open") {
      throw new ApiError(409, "slot_unavailable", "This slot is not open");
    }

    const activeOverlapCount = await activeOverlappingBookingCount(client, event.id, targetSlot, locked.booking_id);
    if (activeOverlapCount > 0) {
      throw new ApiError(409, "slot_unavailable", "This slot overlaps a booking that has already been claimed");
    }

    if (!event.allowMultipleBookings) {
      const existing = await client.query(
        `
          select 1
          from slotboard.bookings
          where event_id = $1
            and dedupe_email = $2
            and id <> $3
            and cancelled_at is null
          limit 1
        `,
        [event.id, locked.participant_email, locked.booking_id],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        throw new ApiError(409, "duplicate_booking", "This email already has an active booking for this event");
      }
    }

    if (!locked.close_after_booking) {
      await client.query(
        `
          update slotboard.time_slots
          set status = 'open'
          where id = $1
        `,
        [locked.slot_id],
      );
    }

    await client.query(
      `
        update slotboard.bookings
        set slot_id = $2,
            participant_timezone = coalesce($3, participant_timezone),
            participant_locale = coalesce($4, participant_locale),
            participant_offset_at_booking = coalesce($5, participant_offset_at_booking),
            notes = coalesce($6, notes),
            booked_at = now(),
            cancelled_reason = null,
            ics_sequence = ics_sequence + 1,
            updated_at = now()
        where id = $1
      `,
      [
        locked.booking_id,
        input.slotId,
        input.participantTimezone ?? null,
        input.participantLocale ?? null,
        input.participantOffsetAtBooking ?? null,
        input.notes ?? null,
      ],
    );

    await recordActivity(client, {
      eventId: event.id,
      type: "booking_rescheduled",
      actorType: "participant",
      actorLabel: locked.participant_name,
      slotId: input.slotId,
      bookingId: locked.booking_id,
      metadata: {
        fromSlotId: locked.slot_id,
        toSlotId: input.slotId,
        fromStartsAt: locked.starts_at.toISOString(),
        toStartsAt: targetSlot.starts_at.toISOString(),
      },
    });

    return readBookingByManageToken(rawToken, client);
  });

  const response = mapManageRow(result);
  const manageURL = await buildParticipantURL(`/m/${rawToken}`, response.event);
  const calendarURL = await buildParticipantCalendarURL(rawToken, response.event);
  const email = await sendBookingClaimedEmails({
    event: response.event,
    slot: response.slot,
    booking: response.booking,
    manageURL,
    calendarURL,
  });
  await notifyWorkspaceIntegrations({
    type: "booking_rescheduled",
    event: response.event,
    slot: response.slot,
    booking: response.booking,
  });

  logInfo("slotboard_booking_rescheduled", {
    eventId: response.event.id,
    bookingId: response.booking.id,
    slotId: response.slot.id,
    recipientDomain: emailDomain(response.booking.participantEmail),
    participantConfirmationStatus: email.participantConfirmation.status,
    organizerNoticeStatus: email.organizerNotice.status,
  });

  return {
    ...response,
    email,
  };
}

export async function readAdminDashboard(rawToken: string): Promise<DashboardDTO> {
  const event = await resolveEventByToken("admin_token_hash", rawToken);
  const [slots, activity] = await Promise.all([
    readAdminSlots(event.id),
    readActivityForEvent(event.id),
  ]);
  return { event, slots, activity };
}

export async function readAdminActivity(rawToken: string): Promise<{ event: EventDTO; activity: ActivityDTO[] }> {
  const event = await resolveEventByToken("admin_token_hash", rawToken);
  return {
    event,
    activity: await readActivityForEvent(event.id),
  };
}

export async function readOrganizerEvents(ownerUserId: string): Promise<{ events: OrganizerEventSummaryDTO[] }> {
  const result = await getPool().query<OrganizerEventSummaryRow>(
    `
      select
        ${eventColumnsWithAlias("e")},
        count(distinct s.id)::int as slot_count,
        count(distinct b.id)::int as active_booking_count
      from slotboard.booking_events e
      left join slotboard.time_slots s on s.event_id = e.id
      left join slotboard.bookings b on b.event_id = e.id and b.cancelled_at is null
      where e.owner_user_id = $1
        and e.deleted_at is null
      group by e.id
      order by e.created_at desc
    `,
    [ownerUserId],
  );

  return {
    events: result.rows.map((row) => ({
      event: mapEvent(row),
      slotCount: row.slot_count,
      activeBookingCount: row.active_booking_count,
    })),
  };
}

export async function readOrganizerDashboard(
  ownerUserId: string,
  eventId: string,
): Promise<DashboardDTO> {
  const event = await resolveEventByOwner(ownerUserId, eventId);
  const [slots, activity] = await Promise.all([
    readAdminSlots(event.id),
    readActivityForEvent(event.id),
  ]);
  return { event, slots, activity };
}

export async function readOrganizerActivity(
  ownerUserId: string,
  eventId: string,
): Promise<{ event: EventDTO; activity: ActivityDTO[] }> {
  const event = await resolveEventByOwner(ownerUserId, eventId);
  return {
    event,
    activity: await readActivityForEvent(event.id),
  };
}

export async function updateAdminEvent(rawToken: string, input: UpdateEventInput): Promise<{ event: EventDTO }> {
  const event = await resolveEventByToken("admin_token_hash", rawToken);
  return updateEventById(event.id, input);
}

export async function updateOrganizerEvent(
  ownerUserId: string,
  eventId: string,
  input: UpdateEventInput,
): Promise<{ event: EventDTO }> {
  const event = await resolveEventByOwner(ownerUserId, eventId);
  return updateEventById(event.id, input);
}

async function updateEventById(eventId: string, input: UpdateEventInput): Promise<{ event: EventDTO }> {
  const values: Array<string | boolean> = [];
  const assignments: string[] = [];

  if (input.title !== undefined) {
    values.push(input.title);
    assignments.push(`title = $${values.length}`);
  }
  if (input.description !== undefined) {
    values.push(input.description);
    assignments.push(`description = $${values.length}`);
  }
  if (input.organizerName !== undefined) {
    values.push(input.organizerName);
    assignments.push(`organizer_name = $${values.length}`);
  }
  if (input.organizerEmail !== undefined) {
    values.push(input.organizerEmail);
    assignments.push(`organizer_email = $${values.length}`);
  }
  if (input.avatarStyle !== undefined) {
    values.push(input.avatarStyle);
    assignments.push(`avatar_style = $${values.length}`);
  }

  if (assignments.length === 0) {
    const result = await getPool().query<EventRow>(
      `
        select ${eventColumns}
        from slotboard.booking_events
        where id = $1
          and deleted_at is null
      `,
      [eventId],
    );
    return { event: mapEvent(rowOrThrow(result, "event_not_found", "Event not found")) };
  }

  values.push(eventId);
  const result = await getPool().query<EventRow>(
    `
      update slotboard.booking_events
      set ${assignments.join(", ")}
      where id = $${values.length}
        and deleted_at is null
      returning ${eventColumns}
    `,
    values,
  );

  const updated = mapEvent(rowOrThrow(result, "event_not_found", "Event not found"));
  await recordActivity(getPool(), {
    eventId: updated.id,
    type: "event_updated",
    actorType: "organizer",
    actorLabel: updated.organizerName,
    metadata: {
      fields: assignments.map((assignment) => assignment.split(" = ")[0]),
    },
  });
  return { event: updated };
}

export async function archiveAdminEvent(rawToken: string): Promise<{ event: EventDTO }> {
  return updateAdminEventLifecycle(rawToken, "archived");
}

export async function deleteAdminEvent(rawToken: string): Promise<{ event: EventDTO }> {
  return updateAdminEventLifecycle(rawToken, "deleted");
}

export async function archiveOrganizerEvent(ownerUserId: string, eventId: string): Promise<{ event: EventDTO }> {
  return updateOrganizerEventLifecycle(ownerUserId, eventId, "archived");
}

export async function deleteOrganizerEvent(ownerUserId: string, eventId: string): Promise<{ event: EventDTO }> {
  return updateOrganizerEventLifecycle(ownerUserId, eventId, "deleted");
}

export async function setAdminSlotStatus(
  rawToken: string,
  slotId: string,
  status: "open" | "closed",
): Promise<{ event: EventDTO; slot: SlotDTO }> {
  const event = await resolveEventByToken("admin_token_hash", rawToken);
  return setSlotStatusForEvent(event, slotId, status);
}

export async function setOrganizerSlotStatus(
  ownerUserId: string,
  eventId: string,
  slotId: string,
  status: "open" | "closed",
): Promise<{ event: EventDTO; slot: SlotDTO }> {
  const event = await resolveEventByOwner(ownerUserId, eventId);
  return setSlotStatusForEvent(event, slotId, status);
}

async function setSlotStatusForEvent(
  event: EventDTO,
  slotId: string,
  status: "open" | "closed",
): Promise<{ event: EventDTO; slot: SlotDTO }> {
  const row = await withTransaction(async (client) => {
    const result = await client.query<SlotStatusRow>(
      `
        update slotboard.time_slots
        set status = $3
        where event_id = $1
          and id = $2
        returning id, event_id, starts_at, ends_at, source_date, source_start_time, source_end_time, status, close_after_booking
      `,
      [event.id, slotId, status],
    );
    const updated = rowOrThrow(result, "slot_not_found", "Slot not found");
    await recordActivity(client, {
      eventId: event.id,
      type: status === "closed" ? "slot_closed" : "slot_reopened",
      actorType: "organizer",
      actorLabel: event.organizerName,
      slotId,
      metadata: {
        startsAt: updated.starts_at.toISOString(),
        endsAt: updated.ends_at.toISOString(),
      },
    });
    return updated;
  });
  const slot: SlotDTO = {
    id: row.id,
    eventId: row.event_id,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    ...sourceSlotFields(row),
    state: row.status,
    closeAfterBooking: row.close_after_booking,
  };
  await notifyWorkspaceIntegrations({
    type: status === "closed" ? "slot_closed" : "slot_reopened",
    event,
    slot,
  });
  return {
    event,
    slot,
  };
}

export async function cancelBookingByAdmin(
  rawToken: string,
  bookingId: string,
  input: CancelBookingInput,
): Promise<{ event: EventDTO; slot: SlotDTO; booking: BookingDTO }> {
  const event = await resolveEventByToken("admin_token_hash", rawToken);
  return cancelBookingForEvent(event, bookingId, input);
}

export async function cancelBookingByOrganizer(
  ownerUserId: string,
  eventId: string,
  bookingId: string,
  input: CancelBookingInput,
): Promise<{ event: EventDTO; slot: SlotDTO; booking: BookingDTO }> {
  const event = await resolveEventByOwner(ownerUserId, eventId);
  return cancelBookingForEvent(event, bookingId, input);
}

export async function resendBookingEmailByAdmin(
  rawToken: string,
  bookingId: string,
): Promise<BookingEmailResendResponse> {
  const event = await resolveEventByToken("admin_token_hash", rawToken);
  return rotateManageLinkAndSendBookingEmail(event, bookingId, "admin_resend");
}

export async function resendBookingEmailByOrganizer(
  ownerUserId: string,
  eventId: string,
  bookingId: string,
): Promise<BookingEmailResendResponse> {
  const event = await resolveEventByOwner(ownerUserId, eventId);
  return rotateManageLinkAndSendBookingEmail(event, bookingId, "account_resend");
}

async function rotateManageLinkAndSendBookingEmail(
  event: EventDTO,
  bookingId: string,
  reason: "admin_resend" | "account_resend",
): Promise<BookingEmailResendResponse> {
  const env = loadEnv();
  const manageToken = createTokenPair("manage", env.tokenPepper);
  const row = await withTransaction(async (client) => {
    const updated = await client.query<{ id: string }>(
      `
        update slotboard.bookings
        set manage_token_hash = $3
        where event_id = $1
          and id = $2
        returning id
      `,
      [event.id, bookingId, manageToken.tokenHash],
    );
    rowOrThrow(updated, "booking_not_found", "Booking not found");

    const booking = await readBookingById(client, event.id, bookingId);
    await recordActivity(client, {
      eventId: event.id,
      type: "manage_link_rotated",
      actorType: "organizer",
      actorLabel: event.organizerName,
      slotId: booking.slot_id,
      bookingId: booking.booking_id,
      metadata: {
        reason,
      },
    });
    return booking;
  });

  const response = mapManageRow(row);
  const manageURL = await buildParticipantURL(`/m/${manageToken.rawToken}`, response.event);
  const calendarURL = await buildParticipantCalendarURL(manageToken.rawToken, response.event);
  const delivery = await sendManagedBookingDetailsEmail({
    ...response,
    manageURL,
    calendarURL,
  });

  logInfo("slotboard_booking_email_resent_by_organizer", {
    eventId: response.event.id,
    bookingId: response.booking.id,
    reason,
    bookingStatus: response.booking.status,
    deliveryStatus: delivery.status,
    recipientDomain: emailDomain(response.booking.participantEmail),
  });

  return {
    ...response,
    links: {
      manage: manageURL,
    },
    delivery,
  };
}

async function cancelBookingForEvent(
  event: EventDTO,
  bookingId: string,
  input: CancelBookingInput,
): Promise<{ event: EventDTO; slot: SlotDTO; booking: BookingDTO }> {
  const result = await withTransaction(async (client) => {
    const locked = await lockBookingById(client, event.id, bookingId);
    let changed = false;
    if (!locked.cancelled_at) {
      changed = true;
      await client.query(
        `
          update slotboard.bookings
          set cancelled_at = now(),
              cancelled_by = 'organizer',
              cancelled_reason = $2,
              ics_sequence = ics_sequence + 1
          where id = $1
        `,
        [locked.id, input.reason],
      );
      if (input.reopenSlot && !locked.close_after_booking) {
        await client.query(
          `
            update slotboard.time_slots
            set status = 'open'
            where id = $1
          `,
          [locked.slot_id],
        );
      }
      await recordActivity(client, {
        eventId: event.id,
        type: "booking_cancelled",
        actorType: "organizer",
        actorLabel: event.organizerName,
        slotId: locked.slot_id,
        bookingId,
        metadata: {
          reopenedSlot: input.reopenSlot && !locked.close_after_booking,
          reasonProvided: input.reason.length > 0,
        },
      });
    }
    return {
      row: await readBookingById(client, event.id, bookingId),
      changed,
    };
  });

  const response = mapManageRow(result.row);
  if (result.changed) {
    const reopenedSlot = Boolean(input.reopenSlot) &&
      !response.slot.closeAfterBooking &&
      response.event.status === "active" &&
      !isEventExpired(response.event);
    await sendBookingCancellationEmails({
      event: response.event,
      slot: response.slot,
      booking: response.booking,
      cancelledBy: "organizer",
      reopenedSlot,
    });
    await notifyWorkspaceIntegrations({
      type: "booking_cancelled",
      event: response.event,
      slot: response.slot,
      booking: response.booking,
    });
  }
  return response;
}

export async function exportAdminCsv(rawToken: string): Promise<string> {
  const event = await resolveEventByToken("admin_token_hash", rawToken);
  return exportCsvForEvent(event);
}

export async function exportOrganizerCsv(ownerUserId: string, eventId: string): Promise<string> {
  const event = await resolveEventByOwner(ownerUserId, eventId);
  return exportCsvForEvent(event);
}

export async function exportOrganizerCrossBoardCsv(input: {
  ownerUserId: string;
  ownerEmail: string;
}): Promise<string> {
  const allowed = await hasActiveCompanyStandby(input);
  if (!allowed) {
    throw new ApiError(
      402,
      "cross_board_csv_requires_company",
      "Cross-board CSV export is included with Company.",
    );
  }

  const result = await getPool().query<CrossBoardCsvRow>(
    `
      select
        e.id as event_id,
        e.title as event_title,
        s.starts_at,
        s.ends_at,
        s.source_date,
        s.source_start_time,
        s.source_end_time,
        s.status as slot_status,
        b.id as booking_id,
        b.participant_name,
        b.participant_email,
        b.participant_timezone,
        b.participant_locale,
        b.participant_offset_at_booking,
        b.notes,
        b.booked_at,
        b.cancelled_at,
        b.cancelled_by
      from slotboard.booking_events e
      join slotboard.time_slots s on s.event_id = e.id
      left join slotboard.bookings b on b.slot_id = s.id
      where e.owner_user_id = $1
        and e.deleted_at is null
      order by e.created_at desc, s.starts_at asc, b.booked_at asc nulls last
    `,
    [input.ownerUserId],
  );

  return csvForRows(result.rows.map((row) => ({
    eventId: row.event_id,
    eventTitle: row.event_title,
    row,
  })));
}

async function exportCsvForEvent(event: EventDTO): Promise<string> {
  const result = await getPool().query<AdminCsvRow>(
    `
      select
        s.starts_at,
        s.ends_at,
        s.source_date,
        s.source_start_time,
        s.source_end_time,
        s.status as slot_status,
        b.id as booking_id,
        b.participant_name,
        b.participant_email,
        b.participant_timezone,
        b.participant_locale,
        b.participant_offset_at_booking,
        b.notes,
        b.booked_at,
        b.cancelled_at,
        b.cancelled_by
      from slotboard.time_slots s
      left join slotboard.bookings b on b.slot_id = s.id
      where s.event_id = $1
      order by s.starts_at asc, b.booked_at asc nulls last
    `,
    [event.id],
  );

  return csvForRows(result.rows.map((row) => ({
    eventId: event.id,
    eventTitle: event.title,
    row,
  })));
}

function csvForRows(rows: Array<{
  eventId: string;
  eventTitle: string;
  row: AdminCsvRow;
}>): string {
  const lines = [
    [
      "event_id",
      "event_title",
      "starts_at",
      "ends_at",
      "source_date",
      "source_start_time",
      "source_end_time",
      "slot_status",
      "booking_id",
      "participant_name",
      "participant_email",
      "participant_timezone",
      "participant_locale",
      "participant_offset_at_booking",
      "notes",
      "booked_at",
      "cancelled_at",
      "cancelled_by",
    ],
    ...rows.map(({ eventId, eventTitle, row }) => [
      eventId,
      eventTitle,
      row.starts_at.toISOString(),
      row.ends_at.toISOString(),
      dateOnly(row.source_date) ?? "",
      timeOnly(row.source_start_time) ?? "",
      timeOnly(row.source_end_time) ?? "",
      row.slot_status,
      row.booking_id ?? "",
      row.participant_name ?? "",
      row.participant_email ?? "",
      row.participant_timezone ?? "",
      row.participant_locale ?? "",
      row.participant_offset_at_booking ?? "",
      row.notes ?? "",
      row.booked_at?.toISOString() ?? "",
      row.cancelled_at?.toISOString() ?? "",
      row.cancelled_by ?? "",
    ]),
  ];

  return `${lines.map((line) => line.map(csvCell).join(",")).join("\n")}\n`;
}

export async function recoverAdminLinks(organizerEmail: string): Promise<{ ok: true }> {
  const env = loadEnv();
  const result = await getPool().query<EventRow>(
    `
      select ${eventColumns}
      from slotboard.booking_events
      where organizer_email = $1
        and status = 'active'
        and deleted_at is null
      order by created_at desc
    `,
    [organizerEmail],
  );

  for (const event of result.rows) {
    const adminToken = createTokenPair("admin", env.tokenPepper);
    const updated = await getPool().query<EventRow>(
      `
        update slotboard.booking_events
        set admin_token_hash = $2
        where id = $1
        returning ${eventColumns}
      `,
      [event.id, adminToken.tokenHash],
    );
    const mapped = mapEvent(rowOrThrow(updated, "event_not_found", "Event not found"));
    await recordActivity(getPool(), {
      eventId: mapped.id,
      type: "admin_link_rotated",
      actorType: "organizer",
      actorLabel: mapped.organizerName,
      metadata: {
        reason: "recovery",
      },
    });
    await sendAdminRecoveryEmail({
      event: mapped,
      adminURL: buildAppURL(`/a/${adminToken.rawToken}`, env.publicAppURL),
      reason: "recovery",
    });
  }
  logInfo("slotboard_admin_recovery_requested", {
    recipientDomain: emailDomain(organizerEmail),
    matches: result.rowCount ?? 0,
  });

  return { ok: true };
}

/* Self-service rotation of a single admin URL. Differs from
 * recoverAdminLinks (which rotates every board for an email,
 * triggered without auth from /recover) — this one is called
 * from inside the dashboard by a holder of the current token,
 * scoped to one board, and emails the fresh URL to the
 * organizer so the old one is immediately dead but they can
 * still get back in. */
export async function rotateAdminPrivateLink(rawToken: string): Promise<{ ok: true }> {
  const env = loadEnv();
  const event = await resolveEventByToken("admin_token_hash", rawToken);
  const adminToken = createTokenPair("admin", env.tokenPepper);

  const updated = await withTransaction(async (client) => {
    const result = await client.query<EventRow>(
      `
        update slotboard.booking_events
        set admin_token_hash = $2
        where id = $1
          and deleted_at is null
        returning ${eventColumns}
      `,
      [event.id, adminToken.tokenHash],
    );
    const row = mapEvent(rowOrThrow(result, "event_not_found", "Event not found"));
    await recordActivity(client, {
      eventId: row.id,
      type: "admin_link_rotated",
      actorType: "organizer",
      actorLabel: row.organizerName,
      metadata: {
        reason: "self_rotated",
      },
    });
    return row;
  });

  await sendAdminRecoveryEmail({
    event: updated,
    adminURL: buildAppURL(`/a/${adminToken.rawToken}`, env.publicAppURL),
    reason: "self_rotation",
  });

  logInfo("slotboard_admin_link_self_rotated", {
    eventId: updated.id,
    recipientDomain: emailDomain(updated.organizerEmail),
  });

  return { ok: true };
}

export async function rotateOrganizerPrivateLink(
  ownerUserId: string,
  eventId: string,
): Promise<{ ok: true }> {
  const env = loadEnv();
  const adminToken = createTokenPair("admin", env.tokenPepper);

  const updated = await withTransaction(async (client) => {
    const result = await client.query<EventRow>(
      `
        update slotboard.booking_events
        set admin_token_hash = $3
        where id = $1
          and owner_user_id = $2
          and deleted_at is null
        returning ${eventColumns}
      `,
      [eventId, ownerUserId, adminToken.tokenHash],
    );
    const row = mapEvent(rowOrThrow(result, "event_not_found", "Event not found"));
    await recordActivity(client, {
      eventId: row.id,
      type: "admin_link_rotated",
      actorType: "organizer",
      actorLabel: row.organizerName,
      metadata: {
        reason: "account_rotated",
      },
    });
    return row;
  });

  await sendAdminRecoveryEmail({
    event: updated,
    adminURL: buildAppURL(`/a/${adminToken.rawToken}`, env.publicAppURL),
    reason: "account_rotation",
  });

  logInfo("slotboard_admin_link_account_rotated", {
    eventId: updated.id,
    recipientDomain: emailDomain(updated.organizerEmail),
  });

  return { ok: true };
}

export async function recoverManageLink(
  rawToken: string,
  input: ManageLinkRecoveryInput,
): Promise<{ ok: true }> {
  const env = loadEnv();
  const manageToken = createTokenPair("manage", env.tokenPepper);

  const row = await withTransaction(async (client) => {
    const event = await resolveEventByToken("public_token_hash", rawToken, client);
    if (event.status !== "active") {
      return null;
    }
    const booking = await lockActiveBookingByParticipantEmail(client, event.id, input.participantEmail);
    if (!booking) {
      return null;
    }

    await client.query(
      `
        update slotboard.bookings
        set manage_token_hash = $2
        where id = $1
      `,
      [booking.booking_id, manageToken.tokenHash],
    );
    await recordActivity(client, {
      eventId: event.id,
      type: "manage_link_rotated",
      actorType: "participant",
      actorLabel: booking.participant_name,
      slotId: booking.slot_id,
      bookingId: booking.booking_id,
      metadata: {
        reason: "participant_recovery",
      },
    });
    return readBookingByManageToken(manageToken.rawToken, client);
  });

  if (row) {
    const response = mapManageRow(row);
    const manageURL = await buildParticipantURL(`/m/${manageToken.rawToken}`, response.event);
    await sendManageLinkRecoveryEmail({
      event: response.event,
      slot: response.slot,
      booking: response.booking,
      manageURL,
    });
  }

  logInfo("slotboard_manage_link_recovery_requested", {
    recipientDomain: emailDomain(input.participantEmail),
    matched: Boolean(row),
  });
  return { ok: true };
}

export async function rotateAdminPublicLink(rawToken: string): Promise<RotatedPublicLinkResponse> {
  const event = await resolveEventByToken("admin_token_hash", rawToken);
  return rotatePublicLinkForEvent(event);
}

export async function rotateOrganizerPublicLink(
  ownerUserId: string,
  eventId: string,
): Promise<RotatedPublicLinkResponse> {
  const event = await resolveEventByOwner(ownerUserId, eventId);
  return rotatePublicLinkForEvent(event);
}

async function rotatePublicLinkForEvent(event: EventDTO): Promise<RotatedPublicLinkResponse> {
  const env = loadEnv();
  const publicToken = createTokenPair("public", env.tokenPepper);
  const updated = await withTransaction(async (client) => {
    const result = await client.query<EventRow>(
      `
        update slotboard.booking_events
        set public_token_hash = $2
        where id = $1
          and deleted_at is null
        returning ${eventColumns}
      `,
      [event.id, publicToken.tokenHash],
    );
    const row = mapEvent(rowOrThrow(result, "event_not_found", "Event not found"));
    await recordActivity(client, {
      eventId: row.id,
      type: "public_link_rotated",
      actorType: "organizer",
      actorLabel: row.organizerName,
      metadata: {
        previousPublicLinkInvalidated: true,
      },
    });
    return row;
  });

  const publicURL = await buildParticipantURL(`/b/${publicToken.rawToken}`, updated);
  return {
    event: updated,
    links: {
      public: publicURL,
    },
    shareMessage: buildShareMessage(updated, publicURL),
  };
}

export async function readManagedCalendar(rawToken: string): Promise<CalendarDownload> {
  const { event, slot, booking } = await readManageBooking(rawToken);
  const cancelled = booking.status === "cancelled";
  const content = (cancelled ? createBookingCancellationIcs : createBookingRequestIcs)({
    bookingId: booking.id,
    sequence: booking.icsSequence,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    title: event.title,
    description: event.description,
    organizerName: event.organizerName,
    organizerEmail: event.organizerEmail,
    participantName: booking.participantName,
    participantEmail: booking.participantEmail,
  });

  return {
    filename: cancelled ? "slotboard-booking-cancelled.ics" : "slotboard-booking.ics",
    contentType: `text/calendar; method=${cancelled ? "CANCEL" : "REQUEST"}; charset=utf-8`,
    content,
  };
}

async function updateAdminEventLifecycle(
  rawToken: string,
  status: "archived" | "deleted",
): Promise<{ event: EventDTO }> {
  const event = await resolveEventByToken("admin_token_hash", rawToken);
  return updateEventLifecycleById(event.id, status);
}

async function updateOrganizerEventLifecycle(
  ownerUserId: string,
  eventId: string,
  status: "archived" | "deleted",
): Promise<{ event: EventDTO }> {
  const event = await resolveEventByOwner(ownerUserId, eventId);
  return updateEventLifecycleById(event.id, status);
}

async function updateEventLifecycleById(eventId: string, status: "archived" | "deleted"): Promise<{ event: EventDTO }> {
  const result = await getPool().query<EventRow>(
    `
      update slotboard.booking_events
      set status = $2,
          archived_at = case
            when $2 = 'archived' then coalesce(archived_at, now())
            else archived_at
          end,
          deleted_at = case
            when $2 = 'deleted' then coalesce(deleted_at, now())
            else deleted_at
          end
      where id = $1
        and deleted_at is null
      returning ${eventColumns}
    `,
    [eventId, status],
  );
  const updated = mapEvent(rowOrThrow(result, "event_not_found", "Event not found"));
  await recordActivity(getPool(), {
    eventId: updated.id,
    type: status === "archived" ? "event_archived" : "event_deleted",
    actorType: "organizer",
    actorLabel: updated.organizerName,
  });
  return { event: updated };
}

const eventColumns = `
  id,
  title,
  description,
  organizer_name,
  organizer_email,
  avatar_style,
  avatar_seed,
  timezone,
  meeting_duration_minutes,
  interval_minutes,
  allow_multiple_bookings,
  status,
  plan_key,
  payment_status,
  paid_at,
  expires_at,
  booking_limit,
  slot_limit,
  created_at,
  updated_at
`;

function eventColumnsWithAlias(alias: string): string {
  return [
    `${alias}.id`,
    `${alias}.title`,
    `${alias}.description`,
    `${alias}.organizer_name`,
    `${alias}.organizer_email`,
    `${alias}.avatar_style`,
    `${alias}.avatar_seed`,
    `${alias}.timezone`,
    `${alias}.meeting_duration_minutes`,
    `${alias}.interval_minutes`,
    `${alias}.allow_multiple_bookings`,
    `${alias}.status`,
    `${alias}.plan_key`,
    `${alias}.payment_status`,
    `${alias}.paid_at`,
    `${alias}.expires_at`,
    `${alias}.booking_limit`,
    `${alias}.slot_limit`,
    `${alias}.created_at`,
    `${alias}.updated_at`,
  ].join(",\n        ");
}

async function resolveEventByToken(
  column: "public_token_hash" | "admin_token_hash",
  rawToken: string,
  client: Queryable = getPool(),
  forUpdate = false,
): Promise<EventDTO> {
  const result = await client.query<EventRow>(
    `
      select ${eventColumns}
      from slotboard.booking_events
      where ${column} = $1
        and deleted_at is null
      ${forUpdate ? "for update" : ""}
    `,
    [tokenHash(rawToken)],
  );
  return mapEvent(rowOrThrow(result, "event_not_found", "Event not found"));
}

async function resolveEventByOwner(
  ownerUserId: string,
  eventId: string,
  client: Queryable = getPool(),
  forUpdate = false,
): Promise<EventDTO> {
  const result = await client.query<EventRow>(
    `
      select ${eventColumns}
      from slotboard.booking_events
      where id = $1
        and owner_user_id = $2
        and deleted_at is null
      ${forUpdate ? "for update" : ""}
    `,
    [eventId, ownerUserId],
  );
  return mapEvent(rowOrThrow(result, "event_not_found", "Event not found"));
}

async function readOpenSlots(
  eventId: string,
  slotLimit: number,
  options: { excludeBookingId?: string; excludeSlotId?: string } = {},
): Promise<SlotDTO[]> {
  const result = await getPool().query<SlotStatusRow>(
    `
      with ranked_slots as (
        select
          s.id,
          s.event_id,
          s.starts_at,
          s.ends_at,
          s.source_date,
          s.source_start_time,
          s.source_end_time,
          s.status,
          s.close_after_booking,
          row_number() over (order by s.starts_at asc, s.id asc)::int as publish_rank
        from slotboard.time_slots s
        where s.event_id = $1
      )
      select id, event_id, starts_at, ends_at, source_date, source_start_time, source_end_time, status, close_after_booking
      from ranked_slots s
      where s.publish_rank <= $2
        and s.status = 'open'
        and ($3::uuid is null or s.id <> $3::uuid)
        and not exists (
          select 1
          from slotboard.bookings b
          join slotboard.time_slots booked_slot on booked_slot.id = b.slot_id
          where b.event_id = s.event_id
            and b.cancelled_at is null
            and ($4::uuid is null or b.id <> $4::uuid)
            and s.starts_at < booked_slot.ends_at
            and s.ends_at > booked_slot.starts_at
        )
      order by starts_at asc, id asc
    `,
    [eventId, slotLimit, options.excludeSlotId ?? null, options.excludeBookingId ?? null],
  );
  return result.rows.map((row) => ({
    id: row.id,
    eventId: row.event_id,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    ...sourceSlotFields(row),
    state: "open",
    closeAfterBooking: row.close_after_booking,
  }));
}

async function readAdminSlots(eventId: string): Promise<SlotDTO[]> {
  const result = await getPool().query<AdminSlotRow>(
    `
      select
        s.id,
        s.event_id,
        s.starts_at,
        s.ends_at,
        s.source_date,
        s.source_start_time,
        s.source_end_time,
        s.status,
        s.close_after_booking,
        b.id as booking_id,
        b.participant_name,
        b.participant_email,
        b.notes,
        b.booked_at,
        exists (
          select 1
          from slotboard.email_delivery_logs l
          where l.booking_id = b.id
            and l.recipient_email = b.participant_email
            and l.status = 'bounced'
        ) as email_bounced,
        (
          select overlap_booking.id
          from slotboard.bookings overlap_booking
          join slotboard.time_slots overlap_slot on overlap_slot.id = overlap_booking.slot_id
          where overlap_booking.event_id = s.event_id
            and overlap_booking.cancelled_at is null
            and overlap_booking.slot_id <> s.id
            and s.starts_at < overlap_slot.ends_at
            and s.ends_at > overlap_slot.starts_at
          order by overlap_slot.starts_at asc, overlap_slot.id asc
          limit 1
        ) as overlap_booking_id
      from slotboard.time_slots s
      left join slotboard.bookings b on b.slot_id = s.id and b.cancelled_at is null
      where s.event_id = $1
      order by s.starts_at asc
    `,
    [eventId],
  );
  return result.rows.map((row) => {
    const booked = Boolean(row.booking_id);
    const blocked = !booked && row.status === "open" && Boolean(row.overlap_booking_id);
    return {
      id: row.id,
      eventId: row.event_id,
      startsAt: row.starts_at.toISOString(),
      endsAt: row.ends_at.toISOString(),
      ...sourceSlotFields(row),
      state: booked ? "booked" : blocked ? "blocked" : row.status,
      closeAfterBooking: row.close_after_booking,
      bookingId: row.booking_id ?? undefined,
      bookedInitials: row.participant_name ? initials(row.participant_name) : undefined,
      bookedName: row.participant_name ?? undefined,
      bookedEmail: row.participant_email ?? undefined,
      bookedNotes: row.notes ?? undefined,
      bookedAt: row.booked_at?.toISOString(),
      emailBounced: row.email_bounced || undefined,
    };
  });
}

async function lockSlot(client: pg.PoolClient, eventId: string, slotId: string): Promise<LockedSlotRow> {
  const result = await client.query<LockedSlotRow>(
    `
      select id, event_id, starts_at, ends_at, source_date, source_start_time, source_end_time, capacity, status, close_after_booking
      from slotboard.time_slots
      where event_id = $1
        and id = $2
      for update
    `,
    [eventId, slotId],
  );
  return rowOrThrow(result, "slot_not_found", "Slot not found");
}

async function lockSlotAndOverlaps(
  client: pg.PoolClient,
  eventId: string,
  slotId: string,
): Promise<LockedSlotRow> {
  const result = await client.query<LockedSlotRow>(
    `
      with target as (
        select starts_at, ends_at
        from slotboard.time_slots
        where event_id = $1
          and id = $2
      )
      select
        s.id,
        s.event_id,
        s.starts_at,
        s.ends_at,
        s.source_date,
        s.source_start_time,
        s.source_end_time,
        s.capacity,
        s.status,
        s.close_after_booking
      from slotboard.time_slots s
      join target t on true
      where s.event_id = $1
        and s.starts_at < t.ends_at
        and s.ends_at > t.starts_at
      order by s.starts_at asc, s.id asc
      for update of s
    `,
    [eventId, slotId],
  );
  const target = result.rows.find((row) => row.id === slotId);
  if (!target) {
    throw new ApiError(404, "slot_not_found", "Slot not found");
  }
  return target;
}

async function activeOverlappingBookingCount(
  client: pg.PoolClient,
  eventId: string,
  slot: Pick<LockedSlotRow, "starts_at" | "ends_at">,
  excludeBookingId?: string,
): Promise<number> {
  const result = await client.query<{ count: string }>(
    `
      select count(*)::text as count
      from slotboard.bookings b
      join slotboard.time_slots booked_slot on booked_slot.id = b.slot_id
      where b.event_id = $1
        and b.cancelled_at is null
        and booked_slot.starts_at < $3
        and booked_slot.ends_at > $2
        and ($4::uuid is null or b.id <> $4::uuid)
    `,
    [eventId, slot.starts_at, slot.ends_at, excludeBookingId ?? null],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function activeEventBookingCount(client: pg.PoolClient, eventId: string): Promise<number> {
  const result = await client.query<{ count: string }>(
    `
      select count(*)::text as count
      from slotboard.bookings
      where event_id = $1
        and cancelled_at is null
    `,
    [eventId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function countPublishedOpenSlots(event: EventDTO): Promise<number> {
  if (event.status !== "active" || isEventExpired(event)) {
    return 0;
  }
  return (await readOpenSlots(event.id, event.slotLimit)).length;
}

async function assertEventBookingLimit(client: pg.PoolClient, event: EventDTO): Promise<void> {
  const count = await activeEventBookingCount(client, event.id);
  if (count >= event.bookingLimit) {
    throw new ApiError(
      402,
      "booking_limit_reached",
      "This booking board has reached its booking limit. Ask the organizer to upgrade the board.",
    );
  }
}

async function assertSlotWithinPublishedLimit(
  client: pg.PoolClient,
  event: EventDTO,
  slotId: string,
): Promise<void> {
  const result = await client.query<{ publish_rank: number }>(
    `
      select publish_rank
      from (
        select
          id,
          row_number() over (order by starts_at asc, id asc)::int as publish_rank
        from slotboard.time_slots
        where event_id = $1
      ) ranked_slots
      where id = $2
    `,
    [event.id, slotId],
  );
  const row = rowOrThrow(result, "slot_not_found", "Slot not found");
  if (row.publish_rank > event.slotLimit) {
    throw new ApiError(
      402,
      "slot_limit_reached",
      "This slot is not published on the current plan. Ask the organizer to upgrade the board.",
    );
  }
}

async function insertBooking(
  client: pg.PoolClient,
  eventId: string,
  input: ClaimSlotInput,
  manageTokenHash: string,
  dedupeEmail: string | null,
): Promise<BookingRow> {
  try {
    const result = await client.query<BookingRow>(
      `
        insert into slotboard.bookings (
          event_id,
          slot_id,
          participant_name,
          participant_email,
          participant_timezone,
          participant_locale,
          participant_offset_at_booking,
          dedupe_email,
          notes,
          manage_token_hash
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        returning
          id,
          event_id,
          slot_id,
          participant_name,
          participant_email,
          participant_timezone,
          participant_locale,
          participant_offset_at_booking,
          notes,
          booked_at,
          cancelled_at,
          cancelled_by,
          ics_sequence
      `,
      [
        eventId,
        input.slotId,
        input.participantName,
        input.participantEmail,
        input.participantTimezone ?? null,
        input.participantLocale ?? null,
        input.participantOffsetAtBooking ?? null,
        dedupeEmail,
        input.notes,
        manageTokenHash,
      ],
    );
    return rowOrThrow(result, "booking_not_created", "Booking could not be created");
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(409, "slot_unavailable", "This slot has already been booked");
    }
    throw error;
  }
}

async function readBookingByManageToken(rawToken: string, client: Queryable = getPool()): Promise<ManageBookingRow> {
  const result = await client.query<ManageBookingRow>(
    `
      select ${joinedBookingColumns}
      from slotboard.bookings b
      join slotboard.booking_events e on e.id = b.event_id
      join slotboard.time_slots s on s.id = b.slot_id
      where b.manage_token_hash = $1
        and e.deleted_at is null
    `,
    [tokenHash(rawToken)],
  );
  return rowOrThrow(result, "booking_not_found", "Booking not found");
}

async function lockBookingByManageToken(client: pg.PoolClient, rawToken: string): Promise<ManageBookingRow> {
  const result = await client.query<{ booking_id: string; event_id: string; slot_id: string }>(
    `
      select b.id as booking_id, b.event_id, b.slot_id
      from slotboard.bookings b
      join slotboard.booking_events e on e.id = b.event_id
      where b.manage_token_hash = $1
        and e.deleted_at is null
      for update of b
    `,
    [tokenHash(rawToken)],
  );
  const locked = rowOrThrow(result, "booking_not_found", "Booking not found");
  await lockSlot(client, locked.event_id, locked.slot_id);
  return readBookingById(client, locked.event_id, locked.booking_id);
}

async function lockActiveBookingByParticipantEmail(
  client: pg.PoolClient,
  eventId: string,
  participantEmail: string,
): Promise<ManageBookingRow | null> {
  const result = await client.query<ManageBookingRow>(
    `
      select ${joinedBookingColumns}
      from slotboard.bookings b
      join slotboard.booking_events e on e.id = b.event_id
      join slotboard.time_slots s on s.id = b.slot_id
      where b.event_id = $1
        and b.participant_email = $2
        and b.cancelled_at is null
        and e.status = 'active'
        and e.deleted_at is null
      order by b.booked_at desc
      limit 1
      for update of b
    `,
    [eventId, participantEmail],
  );
  return result.rows[0] ?? null;
}

async function lockBookingById(client: pg.PoolClient, eventId: string, bookingId: string): Promise<AdminBookingLockRow> {
  const result = await client.query<{ id: string; slot_id: string; cancelled_at: Date | null }>(
    `
      select b.id, b.slot_id, b.cancelled_at
      from slotboard.bookings b
      where b.event_id = $1
        and b.id = $2
      for update of b
    `,
    [eventId, bookingId],
  );
  const locked = rowOrThrow(result, "booking_not_found", "Booking not found");
  const slot = await lockSlot(client, eventId, locked.slot_id);
  return {
    ...locked,
    close_after_booking: slot.close_after_booking,
  };
}

async function readBookingById(client: Queryable, eventId: string, bookingId: string): Promise<ManageBookingRow> {
  const result = await client.query<ManageBookingRow>(
    `
      select ${joinedBookingColumns}
      from slotboard.bookings b
      join slotboard.booking_events e on e.id = b.event_id
      join slotboard.time_slots s on s.id = b.slot_id
      where b.event_id = $1
        and b.id = $2
    `,
    [eventId, bookingId],
  );
  return rowOrThrow(result, "booking_not_found", "Booking not found");
}

function mapManageRow(row: ManageBookingRow): { event: EventDTO; slot: SlotDTO; booking: BookingDTO } {
  return {
    event: mapEventFromBookingRow(row),
    slot: {
      id: row.slot_id,
      eventId: row.event_id,
      startsAt: row.starts_at.toISOString(),
      endsAt: row.ends_at.toISOString(),
      ...sourceSlotFields(row),
      state: row.cancelled_at ? "cancelled" : "booked",
      closeAfterBooking: row.close_after_booking,
      bookingId: row.booking_id,
    },
    booking: mapBookingFromJoinedRow(row),
  };
}

function mapEvent(row: EventRow): EventDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    organizerName: row.organizer_name,
    organizerEmail: row.organizer_email,
    avatarStyle: row.avatar_style,
    avatarSeed: row.avatar_seed ?? undefined,
    timezone: row.timezone,
    durationMinutes: row.meeting_duration_minutes,
    intervalMinutes: row.interval_minutes,
    allowMultipleBookings: row.allow_multiple_bookings,
    status: row.status,
    planKey: row.plan_key,
    paymentStatus: row.payment_status,
    paidAt: row.paid_at?.toISOString(),
    expiresAt: row.expires_at?.toISOString(),
    bookingLimit: row.booking_limit,
    slotLimit: row.slot_limit,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapEventFromBookingRow(row: ManageBookingRow): EventDTO {
  return {
    id: row.event_id,
    title: row.title,
    description: row.description,
    organizerName: row.organizer_name,
    organizerEmail: row.organizer_email,
    avatarStyle: row.avatar_style,
    avatarSeed: row.avatar_seed ?? undefined,
    timezone: row.timezone,
    durationMinutes: row.meeting_duration_minutes,
    intervalMinutes: row.interval_minutes,
    allowMultipleBookings: row.allow_multiple_bookings,
    status: row.event_status,
    planKey: row.plan_key,
    paymentStatus: row.payment_status,
    paidAt: row.paid_at?.toISOString(),
    expiresAt: row.expires_at?.toISOString(),
    bookingLimit: row.booking_limit,
    slotLimit: row.slot_limit,
    createdAt: row.event_created_at.toISOString(),
    updatedAt: row.event_updated_at.toISOString(),
  };
}

function mapBooking(row: BookingRow): BookingDTO {
  return {
    id: row.id,
    eventId: row.event_id,
    slotId: row.slot_id,
    participantName: row.participant_name,
    participantEmail: row.participant_email,
    participantTimezone: row.participant_timezone ?? undefined,
    participantLocale: row.participant_locale ?? undefined,
    participantOffsetAtBooking: row.participant_offset_at_booking ?? undefined,
    notes: row.notes,
    status: row.cancelled_at ? "cancelled" : "active",
    bookedAt: row.booked_at.toISOString(),
    cancelledAt: row.cancelled_at?.toISOString(),
    cancelledBy: row.cancelled_by ?? undefined,
    icsSequence: row.ics_sequence,
  };
}

function mapBookingFromJoinedRow(row: ManageBookingRow): BookingDTO {
  return {
    id: row.booking_id,
    eventId: row.event_id,
    slotId: row.slot_id,
    participantName: row.participant_name,
    participantEmail: row.participant_email,
    participantTimezone: row.participant_timezone ?? undefined,
    participantLocale: row.participant_locale ?? undefined,
    participantOffsetAtBooking: row.participant_offset_at_booking ?? undefined,
    notes: row.notes,
    status: row.cancelled_at ? "cancelled" : "active",
    bookedAt: row.booked_at.toISOString(),
    cancelledAt: row.cancelled_at?.toISOString(),
    cancelledBy: row.cancelled_by ?? undefined,
    icsSequence: row.ics_sequence,
  };
}

function sourceSlotFields(row: SlotSourceRow): Pick<SlotDTO, "sourceDate" | "sourceStartTime" | "sourceEndTime"> {
  return {
    sourceDate: dateOnly(row.source_date),
    sourceStartTime: timeOnly(row.source_start_time),
    sourceEndTime: timeOnly(row.source_end_time),
  };
}

function dateOnly(value: Date | string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return value.slice(0, 10);
}

function timeOnly(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.slice(0, 5);
}

function rowOrThrow<T extends pg.QueryResultRow>(
  result: pg.QueryResult<T>,
  code: string,
  message: string,
): T {
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(404, code, message);
  }
  return row;
}

async function buildParticipantURL(path: string, event: Pick<EventDTO, "id" | "organizerEmail">): Promise<string> {
  const env = loadEnv();
  const ownerUserId = await readEventOwnerUserId(event.id);
  const baseURL = await readActiveCustomDomainBaseURL({
    ownerUserId,
    ownerEmail: event.organizerEmail,
  }) ?? env.publicAppURL;
  return buildAppURL(path, baseURL);
}

async function buildParticipantCalendarURL(
  rawManageToken: string,
  event: Pick<EventDTO, "id" | "organizerEmail">,
): Promise<string> {
  return buildParticipantURL(
    `/api/slotboard/manage/${encodeURIComponent(rawManageToken)}/calendar.ics`,
    event,
  );
}

async function readEventOwnerUserId(eventId: string): Promise<string | null> {
  const result = await getPool().query<{ owner_user_id: string | null }>(
    `
      select owner_user_id
      from slotboard.booking_events
      where id = $1
        and deleted_at is null
      limit 1
    `,
    [eventId],
  );
  return result.rows[0]?.owner_user_id ?? null;
}

function buildAppURL(path: string, baseURL: string): string {
  return new URL(path, withTrailingSlash(baseURL)).toString();
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function csvCell(value: string): string {
  const safeValue = formulaSafeCsvValue(value);
  if (!/[",\n\r]/.test(safeValue)) {
    return safeValue;
  }
  return `"${safeValue.replaceAll('"', '""')}"`;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function emailDomain(email: string): string {
  return email.split("@").at(1)?.toLowerCase() ?? "unknown";
}

function formulaSafeCsvValue(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function isEventExpired(event: EventDTO): boolean {
  if (!event.expiresAt) {
    return false;
  }
  return Date.parse(event.expiresAt) <= Date.now();
}

function hasActivePaidFeatures(event: EventDTO): boolean {
  return (
    event.paymentStatus === "paid" &&
    (event.planKey === "event_pass" || event.planKey === "company_standby") &&
    !isEventExpired(event)
  );
}

function isEventPaymentReady(event: EventDTO): boolean {
  return event.paymentStatus === "paid" || event.paymentStatus === "not_required";
}

function isEventPubliclyBookable(event: EventDTO): boolean {
  return event.status === "active" && !isEventExpired(event) && isEventPaymentReady(event);
}

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

type EventRow = {
  id: string;
  title: string;
  description: string;
  organizer_name: string;
  organizer_email: string;
  avatar_style: "notionists" | "open-peeps" | "lorelei" | "big-smile";
  avatar_seed: string | null;
  timezone: string;
  meeting_duration_minutes: number;
  interval_minutes: number;
  allow_multiple_bookings: boolean;
  status: "active" | "archived" | "deleted";
  plan_key: "free" | "event_pass" | "company_standby";
  payment_status: "not_required" | "pending" | "paid" | "failed" | "refunded";
  paid_at: Date | null;
  expires_at: Date | null;
  booking_limit: number;
  slot_limit: number;
  created_at: Date;
  updated_at: Date;
};

type OrganizerEventSummaryRow = EventRow & {
  slot_count: number;
  active_booking_count: number;
};

type SlotStatusRow = {
  id: string;
  event_id: string;
  starts_at: Date;
  ends_at: Date;
  source_date: Date | string | null;
  source_start_time: string | null;
  source_end_time: string | null;
  status: "open" | "closed";
  close_after_booking: boolean;
};

type SlotSourceRow = Pick<SlotStatusRow, "source_date" | "source_start_time" | "source_end_time">;

type LockedSlotRow = SlotStatusRow & {
  capacity: number;
};

type BookingRow = {
  id: string;
  event_id: string;
  slot_id: string;
  participant_name: string;
  participant_email: string;
  participant_timezone: string | null;
  participant_locale: string | null;
  participant_offset_at_booking: string | null;
  notes: string;
  booked_at: Date;
  cancelled_at: Date | null;
  cancelled_by: "participant" | "organizer" | null;
  ics_sequence: number;
};

type AdminSlotRow = SlotStatusRow & {
  booking_id: string | null;
  participant_name: string | null;
  participant_email: string | null;
  notes: string | null;
  booked_at: Date | null;
  email_bounced: boolean;
  overlap_booking_id: string | null;
};

const joinedBookingColumns = `
  e.id as event_id,
  e.title,
  e.description,
  e.organizer_name,
  e.organizer_email,
  e.avatar_style,
  e.avatar_seed,
  e.timezone,
  e.meeting_duration_minutes,
  e.interval_minutes,
  e.allow_multiple_bookings,
  e.status as event_status,
  e.plan_key,
  e.payment_status,
  e.paid_at,
  e.expires_at,
  e.booking_limit,
  e.slot_limit,
  e.created_at as event_created_at,
  e.updated_at as event_updated_at,
  s.id as slot_id,
  s.starts_at,
  s.ends_at,
  s.source_date,
  s.source_start_time,
  s.source_end_time,
  s.close_after_booking,
  b.id as booking_id,
  b.participant_name,
  b.participant_email,
  b.participant_timezone,
  b.participant_locale,
  b.participant_offset_at_booking,
  b.notes,
  b.booked_at,
  b.cancelled_at,
  b.cancelled_by,
  b.ics_sequence
`;

type ManageBookingRow = {
  event_id: string;
  title: string;
  description: string;
  organizer_name: string;
  organizer_email: string;
  avatar_style: "notionists" | "open-peeps" | "lorelei" | "big-smile";
  avatar_seed: string | null;
  timezone: string;
  meeting_duration_minutes: number;
  interval_minutes: number;
  allow_multiple_bookings: boolean;
  event_status: "active" | "archived" | "deleted";
  plan_key: "free" | "event_pass" | "company_standby";
  payment_status: "not_required" | "pending" | "paid" | "failed" | "refunded";
  paid_at: Date | null;
  expires_at: Date | null;
  booking_limit: number;
  slot_limit: number;
  event_created_at: Date;
  event_updated_at: Date;
  slot_id: string;
  starts_at: Date;
  ends_at: Date;
  source_date: Date | string | null;
  source_start_time: string | null;
  source_end_time: string | null;
  close_after_booking: boolean;
  booking_id: string;
  participant_name: string;
  participant_email: string;
  participant_timezone: string | null;
  participant_locale: string | null;
  participant_offset_at_booking: string | null;
  notes: string;
  booked_at: Date;
  cancelled_at: Date | null;
  cancelled_by: "participant" | "organizer" | null;
  ics_sequence: number;
};

type AdminBookingLockRow = {
  id: string;
  slot_id: string;
  cancelled_at: Date | null;
  close_after_booking: boolean;
};

type AdminCsvRow = {
  starts_at: Date;
  ends_at: Date;
  source_date: Date | string | null;
  source_start_time: string | null;
  source_end_time: string | null;
  slot_status: string;
  booking_id: string | null;
  participant_name: string | null;
  participant_email: string | null;
  participant_timezone: string | null;
  participant_locale: string | null;
  participant_offset_at_booking: string | null;
  notes: string | null;
  booked_at: Date | null;
  cancelled_at: Date | null;
  cancelled_by: string | null;
};

type CrossBoardCsvRow = AdminCsvRow & {
  event_id: string;
  event_title: string;
};
