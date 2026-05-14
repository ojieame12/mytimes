/* Fire each of the 10 production email variants at a real address,
 * so you can visually verify rendering in Gmail, Outlook, Apple Mail, etc.
 *
 *   SLOTBOARD_EMAIL_PROVIDER=resend RESEND_API_KEY=re_xxx \
 *   SLOTBOARD_FROM_EMAIL=hello@yourdomain \
 *     npx tsx scripts/test-send-emails.mts you@example.com [variant]
 *
 * If `variant` is provided (e.g. `1`, `01`, `booking-confirmation`), only that
 * one is sent. Otherwise all 10 fire in order with a small delay between each
 * so providers don't rate-limit. */

import {
  sendBookingClaimedEmails,
  sendEventCreatedEmail,
  sendBookingCancellationEmails,
  sendManagedBookingDetailsEmail,
  sendAdminRecoveryEmail,
  sendManageLinkRecoveryEmail,
  sendMyBoardsLinkEmail,
  sendOperationalTestEmail,
} from '../src/email.ts';
import type { BookingDTO, EventDTO, SlotDTO } from '../src/slotboard.ts';

const recipient = process.argv[2];
const filter = process.argv[3];
if (!recipient) {
  console.error('usage: test-send-emails.mts <recipient-email> [variant]');
  process.exit(1);
}

// ── Mock domain objects ──────────────────────────────────────────────────────
const eventId = 'evt_mock_vision_assessment';
const slotId = 'slot_mock_tue_10';
const bookingId = 'bkg_mock_casey';

const baseEvent: EventDTO = {
  id: eventId,
  title: 'Vision Assessment',
  description: '60-minute deep-dive on your roadmap and team strategy.',
  organizerName: 'Oyani Solis',
  organizerEmail: recipient,
  timezone: 'Europe/London',
  durationMinutes: 60,
  allowMultipleBookings: false,
  status: 'active',
  planKey: 'event_pass',
  paymentStatus: 'paid',
  paidAt: '2026-05-10T12:00:00Z',
  expiresAt: '2026-08-13T23:59:59Z',
  bookingLimit: 1,
  slotLimit: 10,
  createdAt: '2026-05-10T12:00:00Z',
  updatedAt: '2026-05-10T12:00:00Z',
};

const baseSlot: SlotDTO = {
  id: slotId,
  eventId,
  startsAt: '2026-05-18T08:00:00Z',
  endsAt: '2026-05-18T09:00:00Z',
  state: 'booked',
  bookingId,
};

const baseBooking: BookingDTO = {
  id: bookingId,
  eventId,
  slotId,
  participantName: 'Casey Rivera',
  participantEmail: recipient,
  participantTimezone: 'Africa/Johannesburg',
  notes: 'On a phone for the first 5 minutes.',
  status: 'active',
  bookedAt: '2026-05-12T10:30:00Z',
};

const manageURL = 'https://mytimes.co/m/k3J9-2Xm-4Tn8';
const publicURL = 'https://mytimes.co/b/vision-assessment-2026';
const adminURL = 'https://mytimes.co/admin/k3J9-2Xm-4Tn8';
const boardsURL = 'https://mytimes.co/my-boards?token=abc123def456';

// ── Variants ─────────────────────────────────────────────────────────────────
type Variant = { id: string; aliases: string[]; label: string; run: () => Promise<unknown> };

const variants: Variant[] = [
  {
    id: '01',
    aliases: ['1', 'booking-confirmation', 'confirmation'],
    label: 'Booking confirmation (+ organizer notice)',
    run: () => sendBookingClaimedEmails({ event: baseEvent, slot: baseSlot, booking: baseBooking, manageURL }),
  },
  {
    id: '02',
    aliases: ['2', 'event-created', 'board-created'],
    label: 'Event created (organizer)',
    run: () => sendEventCreatedEmail({ event: baseEvent, publicURL, adminURL }),
  },
  {
    id: '03',
    aliases: ['3', 'cancellation-participant'],
    label: 'Cancellation — participant copy',
    run: () => sendBookingCancellationEmails({ event: baseEvent, slot: baseSlot, booking: baseBooking, cancelledBy: 'participant', reopenedSlot: true, rebookURL: publicURL, adminURL, openSlotCount: 4 }),
  },
  {
    id: '04',
    aliases: ['4', 'admin-recovery'],
    label: 'Admin link recovery',
    run: () => sendAdminRecoveryEmail({ event: baseEvent, adminURL }),
  },
  {
    id: '05',
    aliases: ['5', 'my-boards-link'],
    label: 'My boards link',
    run: () => sendMyBoardsLinkEmail({ organizerEmail: recipient, boardsURL, boardCount: 3, expiresAt: new Date('2026-05-15T14:32:00Z') }),
  },
  {
    id: '08',
    aliases: ['8', 'managed-booking-resend'],
    label: 'Managed booking details (resend)',
    run: () => sendManagedBookingDetailsEmail({ event: baseEvent, slot: baseSlot, booking: baseBooking, manageURL }),
  },
  {
    id: '09',
    aliases: ['9', 'manage-link-recovery'],
    label: 'Manage link recovery',
    run: () => sendManageLinkRecoveryEmail({ event: baseEvent, slot: baseSlot, booking: baseBooking, manageURL }),
  },
  {
    id: '10',
    aliases: ['10', 'operational-test'],
    label: 'Operational test',
    run: () => sendOperationalTestEmail({ recipientEmail: recipient }),
  },
];

// Note: variants 06 (organizer new-booking) and 07 (organizer cancellation)
// are emitted together with their participant counterparts (#01 and #03), so
// firing #01 and #03 covers all six participant/organizer pairs.

const match = (v: Variant) => v.id === filter || v.aliases.includes(filter ?? '');
const toRun = filter ? variants.filter(match) : variants;
if (filter && toRun.length === 0) {
  console.error(`no variant matched "${filter}". choose from:`);
  variants.forEach((v) => console.error(`  ${v.id} — ${v.label} (aliases: ${v.aliases.join(', ')})`));
  process.exit(1);
}

console.log(`sending ${toRun.length} variant${toRun.length === 1 ? '' : 's'} to ${recipient}`);
console.log('provider:', process.env.SLOTBOARD_EMAIL_PROVIDER ?? 'console (logs only — not delivered)');
console.log('');

for (const variant of toRun) {
  process.stdout.write(`  ${variant.id} — ${variant.label} … `);
  try {
    await variant.run();
    console.log('ok');
  } catch (error) {
    console.log('FAILED');
    console.error('   ', error instanceof Error ? error.message : error);
  }
  // Pace the sends to avoid provider rate limits.
  if (toRun.length > 1) await new Promise((r) => setTimeout(r, 800));
}

console.log('');
console.log('done. open the recipient inbox in Gmail and Outlook to verify rendering.');
process.exit(0);
