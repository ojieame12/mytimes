import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock,
  Video,
  Globe,
  CalendarX2,
  User,
  Mail,
  Copy,
  Check,
  ShieldCheck,
  RefreshCcw,
  ChevronDown,
} from 'lucide-react';
import {
  EMPTY_INLINE_SLOT_FORM_DRAFT,
  InlineSlotForm,
  type InlineSlotFormDraft,
} from '../components/InlineSlotForm';
import { MonthDateSpinners } from '../components/MonthDateSpinners';
import { Avatar } from '../components/Avatar';
import { BookingCompact } from '../components/BookingCompact';
import { TimezonePicker } from '../components/TimezonePicker';
import type { BookingEvent, TimeSlot } from '../lib/types';
import { viewerTimezone, formatTimeInTz, formatDateKey } from '../lib/time';
import { MOCK_EVENT, MOCK_SLOTS } from '../lib/mockData';
import type { ClaimSlotResponse } from '../lib/api';

/* ─── BookingPage (public, /b/<public_token>) ─────────────
 * Single-column document: a consolidated header card holds the
 * organizer identity, title, meta, description, plus a compact
 * footer strip with stats + reference + a Details disclosure.
 * The day-band picker stretches full width below. */

type TimeFilter = 'all' | 'morning' | 'afternoon' | 'evening';

const COMMON_TIMEZONES = [
  'Africa/Johannesburg',
  'Europe/London',
  'Europe/Helsinki',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Singapore',
  'Australia/Sydney',
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
  const detectedViewerTz = useMemo(() => viewerTimezone(), []);
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
  }, [publicToken]);

  const isArchived = event.status === 'archived';
  const isExpired = Boolean(event.expiresAt && Date.parse(event.expiresAt) <= Date.now());
  const isPaymentUnavailable = Boolean(
    event.paymentStatus &&
      event.paymentStatus !== 'paid' &&
      event.paymentStatus !== 'not_required',
  );
  const isUnavailable = !isArchived && (isExpired || isPaymentUnavailable);
  const openSlots = slots.filter((s) => s.state === 'open');
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

  /* Group filtered slots by viewer-local day. Single pass: keep
     them in chronological order, slice into day buckets. */
  const dayGroups = useMemo(() => {
    type Group = { dateKey: string; date: Date; slots: TimeSlot[] };
    const out: Group[] = [];
    const map = new Map<string, Group>();
    carouselSlots.forEach((slot) => {
      const d = new Date(slot.startsAt);
      const dateKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: viewerTz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
      const existing = map.get(dateKey);
      if (existing) {
        existing.slots.push(slot);
      } else {
        const g = { dateKey, date: d, slots: [slot] };
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
                  const dayName = new Intl.DateTimeFormat('en-GB', {
                    weekday: 'long',
                    timeZone: viewerTz,
                  }).format(group.date);
                  const dayShort = new Intl.DateTimeFormat('en-GB', {
                    weekday: 'short',
                    timeZone: viewerTz,
                  }).format(group.date);
                  const dayNum = new Intl.DateTimeFormat('en-GB', {
                    day: '2-digit',
                    timeZone: viewerTz,
                  }).format(group.date);
                  const monthShort = new Intl.DateTimeFormat('en-GB', {
                    month: 'short',
                    timeZone: viewerTz,
                  }).format(group.date);
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
                          <span className="day-band__weekday">{dayShort}</span>
                          <span className="day-band__num">{dayNum}</span>
                          <span className="day-band__month">{monthShort}</span>
                        </div>

                        <div className="day-band__chips">
                          {group.slots.map((slot) => {
                            const isSelected = slot.id === selectedSlotId;
                            const startsAt = new Date(slot.startsAt);
                            const localTime = formatTimeInTz(startsAt, viewerTz);
                            const sourceTime = formatTimeInTz(startsAt, event.timezone);
                            const showSource = viewerTz !== event.timezone;
                            const localDateKey = formatDateKey(startsAt, viewerTz);
                            const sourceDateKey = formatDateKey(startsAt, event.timezone);
                            const dateDiffers = localDateKey !== sourceDateKey;
                            const hour = viewerHour(slot.startsAt, viewerTz);
                            const meridiem = hour < 12 ? 'am' : 'pm';
                            return (
                              <button
                                key={slot.id}
                                type="button"
                                className={`day-band__chip day-band__chip--${meridiem}${isSelected ? ' is-selected' : ''}${showSource ? ' day-band__chip--dual' : ''}${dateDiffers ? ' day-band__chip--date-shift' : ''}`}
                                onClick={() =>
                                  setSelectedSlotId((current) =>
                                    current === slot.id ? undefined : slot.id,
                                  )
                                }
                                aria-pressed={isSelected}
                                aria-label={
                                  showSource
                                    ? `Book ${dayShort} ${dayNum} ${monthShort} at ${localTime} ${meridiem} your time (${sourceTime} organizer time${dateDiffers ? ', different date for organizer' : ''})`
                                    : `Book ${dayShort} ${dayNum} ${monthShort} at ${localTime} ${meridiem}`
                                }
                              >
                                <span className="day-band__chip-time mono tabular">
                                  {localTime}
                                </span>
                                <span
                                  className="day-band__chip-meridiem"
                                  aria-hidden="true"
                                >
                                  {meridiem}
                                </span>
                                {showSource && (
                                  <span
                                    className="day-band__chip-source mono"
                                    aria-hidden="true"
                                  >
                                    {sourceTime}
                                  </span>
                                )}
                                {dateDiffers && (
                                  <span
                                    className="day-band__chip-shift"
                                    aria-hidden="true"
                                    title={`This is a different date for the organizer (${sourceTime} ${event.timezone})`}
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

/* ─── BookingHeaderCard ───────────────────────────────────
 * One wide card that replaces the old hero + side rail. Top
 * zone is the always-visible identity (avatar, eyebrow, title,
 * meta, description). Bottom strip is a compact row: stats,
 * reference code, and a Details ▾ disclosure. Clicking the
 * disclosure expands an inline tray via the grid-template-rows
 * 0fr → 1fr trick that the day-bands use. */
export function BookingHeaderCard({
  event,
  viewerTz,
  detectedViewerTz,
  onViewerTzChange,
  openSlotCount,
  uniqueDays,
}: {
  event: BookingEvent;
  viewerTz: string;
  detectedViewerTz: string;
  onViewerTzChange: (timezone: string) => void;
  openSlotCount: number;
  uniqueDays: number;
}) {
  const [open, setOpen] = useState(false);
  const showMytimesFooter = !(
    event.paymentStatus === 'paid' &&
    (event.planKey === 'event_pass' || event.planKey === 'company_standby')
  );
  return (
    <section
      className={`booking-card${open ? ' is-expanded' : ''}`}
      aria-label="Event details"
    >
      <header className="booking-card__main">
        <div className="booking-card__text">
          <p className="booking-card__eyebrow">
            <span>{event.organizerName}</span> invites you to book
          </p>
          <h1 className="booking-card__title">{event.title}</h1>
          <ul className="booking-card__meta">
            <li>
              <Clock size={14} strokeWidth={1.6} aria-hidden="true" />
              <span className="mono tabular">{event.durationMinutes} min</span>
            </li>
            <li>
              <Video size={14} strokeWidth={1.6} aria-hidden="true" />
              <span>Video call</span>
            </li>
            <li>
              <TimezonePicker
                value={viewerTz}
                onChange={onViewerTzChange}
                detected={detectedViewerTz}
                showLabel
              />
            </li>
            <li>
              <Mail size={14} strokeWidth={1.6} aria-hidden="true" />
              <a
                href={`mailto:${event.organizerEmail}`}
                className="booking-card__meta-email mono"
              >
                {event.organizerEmail}
              </a>
            </li>
          </ul>
        </div>
        <Avatar
          seed={event.organizerEmail}
          style={event.avatarStyle ?? 'notionists'}
          size={44}
        />
      </header>

      {/* The entire strip is the disclosure trigger. ReferenceInline
       *  stops propagation so it still copies on click. */}
      <div
        className="booking-card__strip"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={open ? 'Hide event details' : 'Show event details'}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        <div className="booking-card__strip-left">
          <span className="booking-card__stats">
            <span className="booking-card__stats-num mono tabular">{openSlotCount}</span>
            <span className="booking-card__stats-label">open</span>
            <span className="booking-card__stats-sep" aria-hidden="true">·</span>
            <span className="booking-card__stats-num mono tabular">{uniqueDays}</span>
            <span className="booking-card__stats-label">days</span>
          </span>
          <span className="booking-card__strip-sep" aria-hidden="true" />
          <ReferenceInline value={formatReference(event.id)} />
          {showMytimesFooter && (
            <>
              <span className="booking-card__strip-sep" aria-hidden="true" />
              <span className="booking-card__trust">
                <ShieldCheck size={12} strokeWidth={1.6} aria-hidden="true" />
                <span>Hosted on mytimes · Private booking link</span>
              </span>
            </>
          )}
        </div>
        <span className="booking-card__caret-icon" aria-hidden="true">
          <ChevronDown size={14} strokeWidth={1.8} />
        </span>
      </div>

      <div className="booking-card__tray" aria-hidden={!open}>
        <div className="booking-card__tray-inner">
          <section className="booking-card__tray-section">
            <h3 className="booking-card__tray-label">What to expect</h3>
            <ul className="booking-card__tray-list">
              <li>
                <Video size={13} strokeWidth={1.6} aria-hidden="true" />
                <span>Video call details after confirm</span>
              </li>
              <li>
                <Clock size={13} strokeWidth={1.6} aria-hidden="true" />
                <span>
                  <span className="mono tabular">{event.durationMinutes}</span> minutes, kept tight
                </span>
              </li>
              <li>
                <User size={13} strokeWidth={1.6} aria-hidden="true" />
                <span>1-on-1, no prep needed</span>
              </li>
              <li>
                <Mail size={13} strokeWidth={1.6} aria-hidden="true" />
                <span>Manage link shown after booking</span>
              </li>
            </ul>
          </section>

          <section className="booking-card__tray-section">
            <h3 className="booking-card__tray-label">
              <RefreshCcw size={12} strokeWidth={1.8} aria-hidden="true" />
              If you can't make it
            </h3>
            <p className="booking-card__tray-body">
              Use your private manage link to cancel. Your slot reopens for someone else.
              Organizer timezone: <span className="mono">{event.timezone}</span>.
              Detected here: <span className="mono">{detectedViewerTz}</span>.
            </p>
          </section>
        </div>
      </div>
    </section>
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
}: {
  viewerTz: string;
  detectedViewerTz: string;
  sourceTz: string;
  onViewerTzChange: (tz: string) => void;
}) {
  return (
    <div className="booking__tz-strip" role="region" aria-label="Timezone context">
      <span className="booking__tz-strip-label">Showing in</span>
      <TimezonePicker
        value={viewerTz}
        onChange={onViewerTzChange}
        detected={detectedViewerTz}
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

/* ─── ReferenceInline — quiet code text + tap-to-copy icon
 * Inline mono text that lives in the strip row alongside the
 * stats. Click anywhere on it to copy; a flash of "Copied"
 * confirms. No surrounding plate or border. */

function ReferenceInline({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    /* Stop the strip's onClick from toggling the tray when the
     *  user is actually trying to copy the reference code. */
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — silently skip */
    }
  };
  return (
    <button
      type="button"
      className="booking-card__ref"
      onClick={copy}
      aria-label={copied ? 'Copied reference code' : `Copy reference code ${value}`}
    >
      <code className="mono">{value}</code>
      {copied ? (
        <Check size={12} strokeWidth={1.8} aria-hidden="true" />
      ) : (
        <Copy size={12} strokeWidth={1.6} aria-hidden="true" />
      )}
    </button>
  );
}

/* ─── Helpers ─────────────────────────────────────────── */

function formatReference(id: string): string {
  const tail = id.replace(/[^a-z0-9]/gi, '').slice(-12).toUpperCase().padStart(12, '0');
  return `${tail.slice(0, 4)}-${tail.slice(4, 8)}-${tail.slice(8, 12)}`;
}

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
  const h = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    hour12: false,
    timeZone: tz,
  }).format(new Date(iso));
  return Number(h);
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
