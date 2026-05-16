import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarX2 } from 'lucide-react';
import {
  EMPTY_INLINE_SLOT_FORM_DRAFT,
  InlineSlotForm,
  type InlineSlotFormDraft,
} from '../components/InlineSlotForm';
import { MonthDateSpinners } from '../components/MonthDateSpinners';
import { BookingCompact } from '../components/BookingCompact';
import { BookingHeaderCard } from '../components/BookingHeaderCard';
import { TimezonePicker } from '../components/TimezonePicker';
import type { BookingEvent, TimeSlot } from '../lib/types';
import {
  formatDateKey,
  formatDayPartsInTz,
  formatTimeInTz,
  hourInTz,
  viewerTimezone,
} from '../lib/time';
import { MOCK_EVENT, MOCK_SLOTS } from '../lib/mockData';
import type { ClaimSlotResponse } from '../lib/api';

/* ─── BookingPage (public, /b/<public_token>) ─────────────
 * Single-column document: a consolidated header card holds the
 * organizer identity, title, meta, description, plus a compact
 * footer strip with stats + reference + a Details disclosure.
 * The day-band picker stretches full width below. */

type TimeFilter = 'all' | 'morning' | 'afternoon' | 'evening';

const DEMO_VIEWER_TIMEZONE = 'America/Los_Angeles';
const DEMO_COMMON_TIMEZONES = [
  'America/Los_Angeles',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'UTC',
];

export interface BookingPageProps {
  publicToken: string;
  event?: BookingEvent;
  slots?: TimeSlot[];
  /** Optional — fired when a booking succeeds inline. Parent
   *  can use this to remove the claimed slot from its state. */
  onClaimed?: (response: ClaimSlotResponse) => void;
  /** Optional — fired after a slot conflict is acknowledged so
   *  the parent can refetch the board. */
  onConflict?: () => void;
  /** Preview boards render real UI with mock data but never call the API. */
  demoMode?: boolean;
}

export function BookingPage({
  publicToken,
  event = MOCK_EVENT,
  slots = MOCK_SLOTS,
  onClaimed,
  onConflict,
  demoMode = publicToken === 'preview' && !onClaimed,
}: BookingPageProps) {
  const detectedViewerTz = useMemo(
    () => (demoMode ? DEMO_VIEWER_TIMEZONE : viewerTimezone()),
    [demoMode],
  );
  const [viewerTz, setViewerTz] = useState(detectedViewerTz);
  const [filter, setFilter] = useState<TimeFilter>('all');
  /* Selected-slot ID — when set, that day-band inverts and the
     inline booking form mounts inside it. No modal. */
  const [selectedSlotId, setSelectedSlotId] = useState<string | undefined>();
  const [bookingDraft, setBookingDraft] = useState<InlineSlotFormDraft>(
    EMPTY_INLINE_SLOT_FORM_DRAFT,
  );

  useEffect(() => {
    setSelectedSlotId(undefined);
    setBookingDraft(EMPTY_INLINE_SLOT_FORM_DRAFT);
    setViewerTz(detectedViewerTz);
  }, [detectedViewerTz, publicToken]);

  const isArchived = event.status === 'archived';
  const isExpired = Boolean(event.expiresAt && Date.parse(event.expiresAt) <= Date.now());
  const isPaymentUnavailable = Boolean(
    event.paymentStatus &&
      event.paymentStatus !== 'paid' &&
      event.paymentStatus !== 'not_required',
  );
  const isUnavailable = !isArchived && (isExpired || isPaymentUnavailable);
  const openSlots = useMemo(() => slots.filter((s) => s.state === 'open'), [slots]);
  const openSlotCount = openSlots.length;
  const fullyBooked = !isArchived && !isUnavailable && openSlotCount === 0;

  const tBuckets = useMemo(() => bucketByTimeOfDay(openSlots, viewerTz), [openSlots, viewerTz]);
  const counts = useMemo(
    () => ({
      all: openSlotCount,
      morning: tBuckets.morning.length,
      afternoon: tBuckets.afternoon.length,
      evening: tBuckets.evening.length,
    }),
    [openSlotCount, tBuckets],
  );

  /* Carousel + density strip both consume the open slots filtered
     by time-of-day. Closed / booked slots are hidden from the
     public picker entirely. */
  const carouselSlots = useMemo(
    () =>
      filter === 'all'
        ? openSlots
        : openSlots.filter((s) => isInTimeBucket(s, viewerTz, filter)),
    [openSlots, filter, viewerTz],
  );

  const slotDisplayById = useMemo(() => {
    const display = new Map<
      string,
      {
        localTime: string;
        sourceTime: string;
        showSource: boolean;
        dateDiffers: boolean;
        meridiem: 'am' | 'pm';
      }
    >();
    for (const slot of carouselSlots) {
      const startsAt = new Date(slot.startsAt);
      const localTime = formatTimeInTz(startsAt, viewerTz);
      const sourceTime = formatTimeInTz(startsAt, event.timezone);
      const hour = hourInTz(startsAt, viewerTz);
      display.set(slot.id, {
        localTime,
        sourceTime,
        showSource: viewerTz !== event.timezone,
        dateDiffers:
          formatDateKey(startsAt, viewerTz) !== formatDateKey(startsAt, event.timezone),
        meridiem: hour < 12 ? 'am' : 'pm',
      });
    }
    return display;
  }, [carouselSlots, event.timezone, viewerTz]);

  /* Group filtered slots by viewer-local day. Single pass: keep
     them in chronological order, slice into day buckets. */
  const dayGroups = useMemo(() => {
    type Group = {
      dateKey: string;
      date: Date;
      dayShort: string;
      dayNum: string;
      monthShort: string;
      slots: TimeSlot[];
    };
    const out: Group[] = [];
    const map = new Map<string, Group>();
    carouselSlots.forEach((slot) => {
      const d = new Date(slot.startsAt);
      const dateKey = formatDateKey(d, viewerTz);
      const existing = map.get(dateKey);
      if (existing) {
        existing.slots.push(slot);
      } else {
        const labels = formatDayPartsInTz(d, viewerTz);
        const g = {
          dateKey,
          date: d,
          dayShort: labels.weekdayShort,
          dayNum: labels.day,
          monthShort: labels.monthShort,
          slots: [slot],
        };
        map.set(dateKey, g);
        out.push(g);
      }
    });
    return out;
  }, [carouselSlots, viewerTz]);

  /* The currently-selected slot lives somewhere in the day groups.
     We compute it once per render so we can mount the inline form
     inside the right band. */
  const selectedSlot = useMemo(
    () => carouselSlots.find((s) => s.id === selectedSlotId),
    [carouselSlots, selectedSlotId],
  );

  useEffect(() => {
    if (selectedSlotId && !selectedSlot) {
      setSelectedSlotId(undefined);
    }
  }, [selectedSlot, selectedSlotId]);

  /* Click outside the selected band → close. Pointerdown so we catch
     it before the click bubbles to a chip in another band. ESC also
     closes via a global keydown. */
  useEffect(() => {
    if (!selectedSlotId) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.day-band.is-selected')) return;
      /* Allow clicking another chip in another band — that handler
         will reset selectedSlotId to the new slot's id. */
      if (target.closest('.day-band__chip')) return;
      setSelectedSlotId(undefined);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedSlotId(undefined);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [selectedSlotId]);

  /* Combined IntersectionObserver — does double duty:
   *    1. tracks the most-visible band for the date dial
   *    2. toggles `.is-active-view` on bands that are firmly in
   *       the reading zone (crossed 50% of own height into view)
   *  One IO with one threshold = far cheaper than two IOs with
   *  many thresholds each. */
  const [visibleDateKey, setVisibleDateKey] = useState<string | undefined>();
  const dayListRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = dayListRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let bestVisible: IntersectionObserverEntry | undefined;
        entries.forEach((entry) => {
          const el = entry.target as HTMLElement;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            el.classList.add('is-active-view');
          } else {
            el.classList.remove('is-active-view');
          }
          if (
            entry.isIntersecting &&
            (!bestVisible || entry.intersectionRatio > bestVisible.intersectionRatio)
          ) {
            bestVisible = entry;
          }
        });
        if (bestVisible) {
          const id = (bestVisible.target as HTMLElement).id;
          if (id.startsWith('day-')) setVisibleDateKey(id.slice(4));
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    root.querySelectorAll('.day-band').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [dayGroups]);

  const uniqueDays = useMemo(() => {
    const set = new Set<string>();
    for (const s of openSlots) set.add(formatDateKey(new Date(s.startsAt), viewerTz));
    return set.size;
  }, [openSlots, viewerTz]);

  /* Watch the full booking card — when it scrolls out of view,
   *  fade in the compact sticky bar so the user always knows
   *  whose calendar they're on. Standard IO with threshold=0:
   *  isIntersecting flips to false the moment the card is fully
   *  above the viewport top. */
  const headerCardRef = useRef<HTMLDivElement | null>(null);
  const [compactVisible, setCompactVisible] = useState(false);
  useEffect(() => {
    const el = headerCardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setCompactVisible(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const firstName = event.organizerName.split(' ')[0];

  return (
    <div
      className="booking"
      data-public-token={publicToken === 'preview' ? publicToken : undefined}
    >
      <BookingCompact
        event={event}
        openSlotCount={openSlotCount}
        visible={compactVisible}
      />
      <div className="booking__primary">
        <div ref={headerCardRef}>
          <BookingHeaderCard
            event={event}
            viewerTz={viewerTz}
            detectedViewerTz={detectedViewerTz}
            onViewerTzChange={setViewerTz}
            openSlotCount={openSlotCount}
            uniqueDays={uniqueDays}
            commonTimezones={demoMode ? DEMO_COMMON_TIMEZONES : undefined}
          />
        </div>

        {/* Picker toolbar — spinners on the left, filter pills on
            the right. Same row, no heading text. */}
        {!isArchived && !isUnavailable && !fullyBooked && (
          <>
            <div className="booking__toolbar">
              <MonthDateSpinners
                slots={carouselSlots}
                viewerTz={viewerTz}
                currentDateKey={visibleDateKey}
                onSelectDate={(dateKey) => {
                  const anchor = document.getElementById(`day-${dateKey}`);
                  anchor?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  });
                }}
              />
              <FilterStrip filter={filter} counts={counts} onChange={setFilter} />
            </div>

            {viewerTz !== event.timezone && (
              <ParticipantTzStrip
                viewerTz={viewerTz}
                detectedViewerTz={detectedViewerTz}
                sourceTz={event.timezone}
                onViewerTzChange={setViewerTz}
                commonTimezones={demoMode ? DEMO_COMMON_TIMEZONES : undefined}
              />
            )}

            {/* Day-bands fill the canvas width below the selector. */}
            {dayGroups.length === 0 ? (
              <div className="booking__week-empty">
                <CalendarX2 size={20} strokeWidth={1.5} aria-hidden="true" />
                <p>No slots match this filter.</p>
                <button
                  type="button"
                  className="booking__inline-link"
                  onClick={() => setFilter('all')}
                >
                  Show all
                </button>
              </div>
            ) : (
              <div className="day-list" ref={dayListRef}>
                {dayGroups.map((group) => {
                  const bandSelected = selectedSlot && group.slots.some((s) => s.id === selectedSlot.id);
                  return (
                    <section
                      key={group.dateKey}
                      id={`day-${group.dateKey}`}
                      className={`day-band${bandSelected ? ' is-selected' : ''}`}
                    >
                      {/* Top row — date block hard-left, chips hard-right.
                          Flex with space-between puts a real gulf of
                          whitespace between the two clusters. */}
                      <div className="day-band__top">
                        <div className="day-band__head">
                          <span className="day-band__weekday">{group.dayShort}</span>
                          <span className="day-band__num">{group.dayNum}</span>
                          <span className="day-band__month">{group.monthShort}</span>
                        </div>

                        <div className="day-band__chips">
                          {group.slots.map((slot) => {
                            const isSelected = slot.id === selectedSlotId;
                            const display = slotDisplayById.get(slot.id);
                            if (!display) return null;
                            return (
                              <button
                                key={slot.id}
                                type="button"
                                className={`day-band__chip day-band__chip--${display.meridiem}${isSelected ? ' is-selected' : ''}${display.showSource ? ' day-band__chip--dual' : ''}${display.dateDiffers ? ' day-band__chip--date-shift' : ''}`}
                                onClick={() =>
                                  setSelectedSlotId((current) =>
                                    current === slot.id ? undefined : slot.id,
                                  )
                                }
                                aria-pressed={isSelected}
                                aria-label={
                                  display.showSource
                                    ? `Book ${group.dayShort} ${group.dayNum} ${group.monthShort} at ${display.localTime} ${display.meridiem} your time (${display.sourceTime} organizer time${display.dateDiffers ? ', different date for organizer' : ''})`
                                    : `Book ${group.dayShort} ${group.dayNum} ${group.monthShort} at ${display.localTime} ${display.meridiem}`
                                }
                              >
                                <span className="day-band__chip-time mono tabular">
                                  {display.localTime}
                                </span>
                                <span
                                  className="day-band__chip-meridiem"
                                  aria-hidden="true"
                                >
                                  {display.meridiem}
                                </span>
                                {display.showSource && (
                                  <span
                                    className="day-band__chip-source mono"
                                    aria-hidden="true"
                                  >
                                    {display.sourceTime}
                                  </span>
                                )}
                                {display.dateDiffers && (
                                  <span
                                    className="day-band__chip-shift"
                                    aria-hidden="true"
                                    title={`This is a different date for the organizer (${display.sourceTime} ${event.timezone})`}
                                  >
                                    +1d
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Inline form expands inside the band via
                          grid-template-rows: 0fr → 1fr. Form is
                          always in the DOM when the band is selected;
                          the parent band's grid animates the height. */}
                      <div className="day-band__form" aria-hidden={!bandSelected}>
                        {bandSelected && selectedSlot && (
                          <div className="day-band__form-inner">
                            <InlineSlotForm
                              publicToken={publicToken}
                              slot={selectedSlot}
                              sourceTz={event.timezone}
                              viewerTz={viewerTz}
                              organizerTitle={event.title}
                              meetingDurationMinutes={event.durationMinutes}
                              draft={bookingDraft}
                              onDraftChange={setBookingDraft}
                              onClose={() => setSelectedSlotId(undefined)}
                              demoMode={demoMode}
                              onClaimed={(response) => {
                                onClaimed?.(response);
                              }}
                              onConflict={onConflict}
                            />
                          </div>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </>
        )}

        {isArchived && <ArchivedNotice organizerName={event.organizerName} />}
        {isUnavailable && (
          <UnavailableNotice
            organizerName={event.organizerName}
            organizerEmail={event.organizerEmail}
            reason={isExpired ? 'expired' : 'payment'}
          />
        )}
        {fullyBooked && (
          <FullyBookedNotice
            organizerName={event.organizerName}
            organizerEmail={event.organizerEmail}
          />
        )}

        <p className="booking__contact-note">
          Need a time that isn't here? Reply to your invite email and{' '}
          <strong>{firstName}</strong> will sort it.
        </p>
      </div>
    </div>
  );
}

/* ─── FilterStrip ─────────────────────────────────────────
 *  Editorial text tabs with inline counts and a density bar
 *  underneath each label. The bar shows the bucket's share of
 *  total open slots — morning-heavy days look different from
 *  evening-heavy ones at a glance. Active tab gets an orange
 *  bar; inactive tabs get a soft grey one. */

/* ─── ParticipantTzStrip ──────────────────────────────────
 *  A thin contextual row that surfaces the gap between the
 *  viewer's timezone and the organizer's source timezone. Only
 *  rendered when the two differ — otherwise it's redundant
 *  noise. Click the picker to change your viewing timezone. */

function ParticipantTzStrip({
  viewerTz,
  detectedViewerTz,
  sourceTz,
  onViewerTzChange,
  commonTimezones,
}: {
  viewerTz: string;
  detectedViewerTz: string;
  sourceTz: string;
  onViewerTzChange: (tz: string) => void;
  commonTimezones?: string[];
}) {
  return (
    <div className="booking__tz-strip" role="region" aria-label="Timezone context">
      <span className="booking__tz-strip-label">Showing in</span>
      <TimezonePicker
        value={viewerTz}
        onChange={onViewerTzChange}
        detected={detectedViewerTz}
        commonZones={commonTimezones}
      />
      <span className="booking__tz-strip-sep" aria-hidden="true">·</span>
      <span className="booking__tz-strip-source">
        <span className="booking__tz-strip-label">Organizer in</span>
        <span className="booking__tz-strip-source-value mono">{sourceTz}</span>
      </span>
    </div>
  );
}

function FilterStrip({
  filter,
  counts,
  onChange,
}: {
  filter: TimeFilter;
  counts: Record<TimeFilter, number>;
  onChange: (f: TimeFilter) => void;
}) {
  const items: Array<{ id: TimeFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'morning', label: 'Morning' },
    { id: 'afternoon', label: 'Afternoon' },
    { id: 'evening', label: 'Evening' },
  ];
  /* "All" is always 100%. Buckets show their share of total. */
  const total = counts.all || 1;
  return (
    <div className="booking__filter" role="tablist" aria-label="Filter by time of day">
      {items.map((it) => {
        const isActive = filter === it.id;
        const c = counts[it.id];
        const pct = it.id === 'all' ? 100 : Math.round((c / total) * 100);
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`booking__filter-tab${isActive ? ' is-active' : ''}`}
            onClick={() => onChange(it.id)}
          >
            <span className="booking__filter-tab-head">
              <span className="booking__filter-tab-label">{it.label}</span>
              <span className="booking__filter-tab-count mono tabular">{c}</span>
            </span>
            <span className="booking__filter-tab-bar" aria-hidden="true">
              <span
                className="booking__filter-tab-bar-fill"
                style={{ width: `${pct}%` }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────── */

function bucketByTimeOfDay(slots: TimeSlot[], viewerTz: string) {
  const morning: TimeSlot[] = [];
  const afternoon: TimeSlot[] = [];
  const evening: TimeSlot[] = [];
  for (const slot of slots) {
    const hour = viewerHour(slot.startsAt, viewerTz);
    if (hour < 12) morning.push(slot);
    else if (hour < 17) afternoon.push(slot);
    else evening.push(slot);
  }
  return { morning, afternoon, evening };
}

function isInTimeBucket(slot: TimeSlot, viewerTz: string, bucket: TimeFilter): boolean {
  if (bucket === 'all') return true;
  const hour = viewerHour(slot.startsAt, viewerTz);
  if (bucket === 'morning') return hour < 12;
  if (bucket === 'afternoon') return hour >= 12 && hour < 17;
  return hour >= 17;
}

function viewerHour(iso: string, tz: string): number {
  return hourInTz(new Date(iso), tz);
}

/* ─── Notices ─────────────────────────────────────── */

function FullyBookedNotice({
  organizerName,
  organizerEmail,
}: {
  organizerName: string;
  organizerEmail: string;
}) {
  return (
    <div className="booking__notice">
      <h2 className="booking__notice-title">All slots are currently booked</h2>
      <p className="booking__notice-body">
        Reach out to {organizerName} (
        <a href={`mailto:${organizerEmail}`}>{organizerEmail}</a>
        ) for alternative times.
      </p>
    </div>
  );
}

function ArchivedNotice({ organizerName }: { organizerName: string }) {
  return (
    <div className="booking__notice booking__notice--archived">
      <h2 className="booking__notice-title">This booking is no longer accepting reservations.</h2>
      <p className="booking__notice-body">
        {organizerName} archived this event. If you already have a booking, keep your
        confirmation details and private manage link.
      </p>
    </div>
  );
}

function UnavailableNotice({
  organizerName,
  organizerEmail,
  reason,
}: {
  organizerName: string;
  organizerEmail: string;
  reason: 'expired' | 'payment';
}) {
  const title =
    reason === 'expired'
      ? 'This booking board has expired.'
      : 'This booking board is not accepting bookings yet.';
  const body =
    reason === 'expired'
      ? `${organizerName}'s board is past its active booking window.`
      : `${organizerName}'s board needs to be activated by the organizer before reservations open.`;
  return (
    <div className="booking__notice booking__notice--unavailable">
      <h2 className="booking__notice-title">{title}</h2>
      <p className="booking__notice-body">
        {body}{' '}
        <a href={`mailto:${organizerEmail}`}>Contact {organizerName}</a> if you need a time.
      </p>
    </div>
  );
}
