/* ─── Domain types ────────────────────────────────────────
 * Mirrors the v1 data model from the spec. PII fields are
 * optional on the wire — public token responses redact them. */

export type EventStatus = 'active' | 'archived' | 'deleted';
export type EventPlanKey = 'free' | 'event_pass' | 'company_standby';
export type EventPaymentStatus = 'not_required' | 'pending' | 'paid' | 'failed' | 'refunded';

/* DiceBear illustration style for the organizer avatar. Each
 * style is deterministic — the same email always produces the
 * same illustration in that style. */
export type AvatarStyle = 'notionists' | 'open-peeps' | 'lorelei' | 'big-smile';

export const AVATAR_STYLES: ReadonlyArray<{
  id: AvatarStyle;
  label: string;
  blurb: string;
}> = [
  { id: 'notionists', label: 'Notionists', blurb: 'Clean line work' },
  { id: 'open-peeps', label: 'Open Peeps', blurb: 'Hand-drawn, expressive' },
  { id: 'lorelei', label: 'Lorelei', blurb: 'Polished illustration' },
  { id: 'big-smile', label: 'Big Smile', blurb: 'Friendly cartoon' },
];

export interface BookingEvent {
  id: string;
  title: string;
  description?: string;
  organizerName: string;
  organizerEmail: string;
  timezone: string;              // IANA, e.g. "Europe/London"
  durationMinutes: number;       // 15 | 30 | 45 | 60 | 90
  intervalMinutes?: number;      // Slot starts every N minutes; defaults to duration.
  allowMultipleBookings: boolean;
  status: EventStatus;
  planKey?: EventPlanKey;
  paymentStatus?: EventPaymentStatus;
  paidAt?: string;
  expiresAt?: string;
  bookingLimit?: number;
  slotLimit?: number;
  createdAt: string;             // ISO 8601
  /** Picked during create flow. Defaults to 'notionists'. */
  avatarStyle?: AvatarStyle;
  /** Stable event-level seed so the board avatar survives organizer email edits. */
  avatarSeed?: string;
}

/** Slot state, as derived from {time_slots.status, has-active-booking,
 *  close_after_booking}. Front-end deals in this flattened enum. */
export type SlotState =
  | 'open'              // status='open', no active booking
  | 'booked'            // status='open' (or 'closed' + close_after_booking),
                        // has active booking. Public view hides; admin reveals.
  | 'closed'            // status='closed', no booking
  | 'blocked'           // open in source grid but overlaps an active booking
  | 'just-claimed'      // ephemeral — your own confirmation
  | 'cancelled';        // historical, shown only when filter is on

export interface TimeSlot {
  id: string;
  eventId: string;
  startsAt: string;     // ISO 8601, UTC
  endsAt: string;
  sourceDate?: string;
  sourceStartTime?: string;
  sourceEndTime?: string;
  state: SlotState;
  /** Closed-after-booking — true means slot stays closed even on cancel. */
  closeAfterBooking?: boolean;
  /** Admin-only fields, set when state === 'booked'. */
  bookingId?: string;
  bookedInitials?: string;
  bookedName?: string;
  bookedEmail?: string;
  bookedNotes?: string;
  bookedAt?: string;
  /** True when the participant's confirmation email bounced. */
  emailBounced?: boolean;
}

/** Day-grouped view of slots, computed by groupSlotsByDay(). */
export interface DayGroup {
  /** Local midnight of the viewer's day, used as a stable key. */
  dateKey: string;
  /** The Date object pinned to viewer-local midnight. */
  date: Date;
  slots: TimeSlot[];
}
