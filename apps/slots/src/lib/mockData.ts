import type { BookingEvent, TimeSlot } from './types';

/* ─── Mock event ──────────────────────────────────────────
 * A realistic Vision Assessment round across an entire month
 * of availability. The mock is engineered to exercise every
 * UI corner: the DateStrip's prev/next arrows, the JUN month
 * divider, all-day chips, fully-booked days, and the partial-
 * density bands in between. */

export const MOCK_EVENT: BookingEvent = {
  id: 'evt_vision_assessment_2026',
  title: 'Vision Assessment',
  description:
    'Half-hour intro to scope the assessment. Pick a time that works for you. We send a calendar file after you confirm.',
  organizerName: 'Emily Carter',
  organizerEmail: 'emily@vision.studio',
  timezone: 'Europe/London',
  durationMinutes: 60,
  allowMultipleBookings: false,
  status: 'active',
  createdAt: new Date().toISOString(),
  avatarStyle: 'notionists',
  avatarSeed: 'mock-event-avatar',
};

/** Next N weekdays starting tomorrow (so today's slots aren't past). */
function nextWeekdays(count: number, from: Date = new Date()): Date[] {
  const out: Date[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  while (out.length < count) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) out.push(new Date(cursor));
  }
  return out;
}

/** Build a slot starting at HH:00 BST on the given local date. */
function buildSlot(
  eventId: string,
  date: Date,
  hourBST: number,
  state: TimeSlot['state'],
  extras: Partial<TimeSlot> = {},
): TimeSlot {
  // Slots are stored as UTC ISO. BST = UTC+1, GMT = UTC+0. May is BST.
  const start = new Date(date);
  start.setHours(hourBST - 1, 0, 0, 0); // UTC hour
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return {
    id: `slot_${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}_${pad2(hourBST)}`,
    eventId,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    state,
    ...extras,
  };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/* Full availability — every working hour 8am→7pm BST open. The
 * old "all-day" variant became this: a day where every time slot
 * is bookable, so the picker shows a wall of time chips. */
const FULL_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const FULL_ALL_OPEN: Array<TimeSlot['state']> = FULL_HOURS.map(() => 'open');

const eventId = MOCK_EVENT.id;

/* Full month: 22 weekdays so the picker spans from the current
 * week into June — exercises the JUN month divider and the
 * scrollable DateStrip with prev/next arrows. */
const days = nextWeekdays(22);

/* Mock admin-only metadata seeded into booked slots. */
const BOOKED_PEOPLE = [
  { initials: 'MR', name: 'Mark Reynolds', email: 'mark@reynolds.design', notes: 'On a phone for the first 5 minutes.' },
  { initials: 'AG', name: 'Anya Gupta', email: 'anya@protonmail.com', notes: '' },
  { initials: 'TM', name: 'Tomás Marín', email: 'tomas@stack.studio', notes: 'May join from the road, audio only.' },
  { initials: 'RS', name: 'Rin Sato', email: 'rin@studio-r.jp', notes: '' },
  { initials: 'JK', name: 'Júlia Kowalski', email: 'julia@kowalski.eu', notes: '' },
  { initials: 'MB', name: 'Mira Boateng', email: 'mira@diaspora.co', notes: '' },
  { initials: 'LP', name: 'Luca Pellegrini', email: 'luca@pellegrini.it', notes: '' },
  { initials: 'EK', name: 'Esme Kahale', email: 'esme@kahale.us', notes: 'Will share screen.' },
  { initials: 'FZ', name: 'Faisal Zayn', email: 'faisal@zayn.dev', notes: '' },
  { initials: 'HV', name: 'Helena Voss', email: 'helena@voss.studio', notes: '' },
  { initials: 'KO', name: 'Kenji Ohara', email: 'kenji@ohara.jp', notes: 'Brings a hardware demo.' },
  { initials: 'CM', name: 'Camille Moreau', email: 'camille@moreau.fr', notes: '' },
];

/* ─── Daily plans ──────────────────────────────────────────
 * Each day is one of these shapes. The mock cycles through
 * them so the picker shows a believable mix: dense days, sparse
 * days, all-day blocks, fully-booked days, and weekday gaps.
 *
 * Shape signature:
 *   - 'all-day-open'      → one all-day chip, bookable
 *   - 'all-day-booked'    → one all-day chip, already booked
 *   - { hours, plan }     → hourly slots with per-slot state */

type DayPlan = { kind: 'hourly'; hours: number[]; plan: Array<TimeSlot['state']> };

/* 22-day cycle. Roughly:
 *   - 3 all-day days (1 open, 2 mixed)
 *   - 2 fully-booked days
 *   - sparse days (1-3 slots), medium (4-6), full (8-9)
 *   - 1 "morning only" and 1 "afternoon only" day for filter QA */
const DAY_PLANS: DayPlan[] = [
  /* Day 1 — sparse, mostly open */
  { kind: 'hourly', hours: [10, 11, 14], plan: ['open', 'open', 'open'] },
  /* Day 2 — FULL availability (every hour 8–19 open) */
  { kind: 'hourly', hours: FULL_HOURS, plan: FULL_ALL_OPEN },
  /* Day 3 — dense, half-booked */
  { kind: 'hourly', hours: [9, 10, 11, 14, 15, 16], plan: ['booked', 'open', 'open', 'booked', 'open', 'booked'] },
  /* Day 4 — fully booked */
  { kind: 'hourly', hours: [9, 10, 11, 14, 15, 16], plan: ['booked', 'booked', 'booked', 'booked', 'booked', 'booked'] },
  /* Day 5 — morning only */
  { kind: 'hourly', hours: [8, 9, 10, 11], plan: ['open', 'open', 'open', 'open'] },
  /* Day 6 — afternoon only */
  { kind: 'hourly', hours: [14, 15, 16, 17], plan: ['open', 'open', 'open', 'open'] },
  /* Day 7 — FULL availability (mixed bookings — exercises busy day) */
  {
    kind: 'hourly',
    hours: FULL_HOURS,
    plan: ['open', 'booked', 'open', 'open', 'booked', 'open', 'open', 'open', 'booked', 'open', 'open', 'open'],
  },
  /* Day 8 — single open slot */
  { kind: 'hourly', hours: [11], plan: ['open'] },
  /* Day 9 — extended hours, mixed */
  { kind: 'hourly', hours: [8, 9, 10, 11, 14, 15, 16, 17, 18], plan: ['open', 'booked', 'open', 'open', 'closed', 'open', 'booked', 'open', 'open'] },
  /* Day 10 — typical pattern */
  { kind: 'hourly', hours: [9, 10, 11, 14, 15, 16], plan: ['open', 'closed', 'open', 'open', 'open', 'open'] },
  /* Day 11 — fully booked */
  { kind: 'hourly', hours: [9, 10, 11, 14, 15], plan: ['booked', 'booked', 'booked', 'booked', 'booked'] },
  /* Day 12 — FULL availability (another one — likely lands in June) */
  { kind: 'hourly', hours: FULL_HOURS, plan: FULL_ALL_OPEN },
  /* Day 13 — sparse */
  { kind: 'hourly', hours: [10, 15], plan: ['open', 'open'] },
  /* Day 14 — dense, mostly open */
  { kind: 'hourly', hours: [9, 10, 11, 13, 14, 15, 16], plan: ['open', 'open', 'open', 'open', 'open', 'open', 'open'] },
  /* Day 15 — early-morning only */
  { kind: 'hourly', hours: [7, 8, 9], plan: ['open', 'open', 'open'] },
  /* Day 16 — typical */
  { kind: 'hourly', hours: [9, 10, 11, 14, 15, 16], plan: ['open', 'open', 'booked', 'open', 'booked', 'open'] },
  /* Day 17 — single booked + 2 open */
  { kind: 'hourly', hours: [10, 11, 14], plan: ['booked', 'open', 'open'] },
  /* Day 18 — evening-heavy */
  { kind: 'hourly', hours: [14, 15, 16, 17, 18, 19], plan: ['open', 'open', 'open', 'open', 'open', 'open'] },
  /* Day 19 — typical */
  { kind: 'hourly', hours: [9, 10, 11, 14, 15], plan: ['open', 'open', 'open', 'open', 'open'] },
  /* Day 20 — FULL availability */
  { kind: 'hourly', hours: FULL_HOURS, plan: FULL_ALL_OPEN },
  /* Day 21 — medium, half-booked */
  { kind: 'hourly', hours: [10, 11, 14, 15], plan: ['open', 'booked', 'open', 'open'] },
  /* Day 22 — sparse end */
  { kind: 'hourly', hours: [11, 14], plan: ['open', 'open'] },
];

let bookedCursor = 0;

function nextBooked(): Partial<TimeSlot> {
  const person = BOOKED_PEOPLE[bookedCursor % BOOKED_PEOPLE.length];
  bookedCursor += 1;
  const extras: Partial<TimeSlot> = {
    bookedInitials: person.initials,
    bookedName: person.name,
    bookedEmail: person.email,
    bookedNotes: person.notes,
    bookedAt: new Date(Date.now() - (bookedCursor * 3600_000)).toISOString(),
  };
  // Sprinkle one bounce on the second booking for the admin demo.
  if (bookedCursor === 2) extras.emailBounced = true;
  return extras;
}

export const MOCK_SLOTS: TimeSlot[] = days.flatMap((date, i) => {
  const plan = DAY_PLANS[i % DAY_PLANS.length];
  return plan.hours.map((hour, hourIdx) => {
    const state = plan.plan[hourIdx];
    const extras = state === 'booked' ? nextBooked() : {};
    return buildSlot(eventId, date, hour, state, extras);
  });
});
