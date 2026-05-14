import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Clock, Globe } from 'lucide-react';
import type { TimeSlot } from '../lib/types';
import { formatTimeInTz } from '../lib/time';

/* ─── SlotCarousel ────────────────────────────────────
 * Horizontal scroll-snap row of editorial slot cards.
 * Centered card is full-size + full opacity; neighbors
 * scale to 0.88 + 50% opacity. Snap on swipe/keyboard.
 * One slot is one decision; neighbors give peripheral
 * awareness without competing.
 *
 * Replaces the week-grid as the primary slot picker. */

export interface SlotCarouselProps {
  slots: TimeSlot[];
  viewerTz: string;
  sourceTz: string;
  meetingDurationMinutes: number;
  organizerName: string;
  /** Optional — controls which slot is centered. */
  index?: number;
  onIndexChange?: (next: number) => void;
  onSlotPick?: (slot: TimeSlot) => void;
}

export function SlotCarousel({
  slots,
  viewerTz,
  sourceTz,
  meetingDurationMinutes,
  organizerName,
  index: controlledIndex,
  onIndexChange,
  onSlotPick,
}: SlotCarouselProps) {
  const [uncontrolledIndex, setUncontrolledIndex] = useState(0);
  const index = controlledIndex ?? uncontrolledIndex;
  const setIndex = (next: number) => {
    const clamped = Math.max(0, Math.min(slots.length - 1, next));
    if (controlledIndex === undefined) setUncontrolledIndex(clamped);
    onIndexChange?.(clamped);
  };

  const trackRef = useRef<HTMLDivElement | null>(null);

  /* Scroll the centered card into view whenever index changes
     externally (e.g. clicking a density-strip bar). */
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.children[index] as HTMLElement | undefined;
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [index]);

  /* Detect which card is centered by reading scroll position. */
  const onScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const center = track.scrollLeft + track.clientWidth / 2;
    let closest = 0;
    let closestDist = Infinity;
    for (let i = 0; i < track.children.length; i += 1) {
      const child = track.children[i] as HTMLElement;
      const childCenter = child.offsetLeft + child.offsetWidth / 2;
      const dist = Math.abs(childCenter - center);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    }
    if (closest !== index) setIndex(closest);
  };

  /* Keyboard support — arrow keys move between cards. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setIndex(index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setIndex(index - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const slot = slots[index];
      if (slot) onSlotPick?.(slot);
    }
  };

  if (slots.length === 0) {
    return (
      <section className="carousel">
        <div className="carousel__empty">
          <p>No open slots match the current filter.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="carousel" aria-label="Available time slots">
      <div
        ref={trackRef}
        className="carousel__track"
        role="listbox"
        aria-orientation="horizontal"
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
      >
        {slots.map((slot, i) => {
          const focused = i === index;
          return (
            <SlotCard
              key={slot.id}
              slot={slot}
              focused={focused}
              viewerTz={viewerTz}
              sourceTz={sourceTz}
              meetingDurationMinutes={meetingDurationMinutes}
              organizerName={organizerName}
              onPick={() => onSlotPick?.(slot)}
              onFocus={() => setIndex(i)}
            />
          );
        })}
      </div>

      {/* Step nav — large arrows for explicit navigation alongside swipe. */}
      <div className="carousel__nav">
        <button
          type="button"
          className="carousel__nav-btn"
          onClick={() => setIndex(index - 1)}
          disabled={index === 0}
          aria-label="Previous slot"
        >
          <ArrowLeft size={18} strokeWidth={1.6} aria-hidden="true" />
        </button>
        <span className="carousel__nav-counter">
          <span className="mono tabular">{String(index + 1).padStart(2, '0')}</span>
          <span className="carousel__nav-counter-sep">of</span>
          <span className="mono tabular">{String(slots.length).padStart(2, '0')}</span>
        </span>
        <button
          type="button"
          className="carousel__nav-btn"
          onClick={() => setIndex(index + 1)}
          disabled={index >= slots.length - 1}
          aria-label="Next slot"
        >
          <ArrowRight size={18} strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

/* ─── SlotCard ─────────────────────────────────────────
 * One editorial slot card. Time is the hero (large
 * Fraunces). Date + meta are supporting. Click confirms.
 * Focused state lifts + brightens; unfocused dims and
 * scales 0.88 — peripheral awareness without competing. */

function SlotCard({
  slot,
  focused,
  viewerTz,
  sourceTz,
  meetingDurationMinutes,
  organizerName,
  onPick,
  onFocus,
}: {
  slot: TimeSlot;
  focused: boolean;
  viewerTz: string;
  sourceTz: string;
  meetingDurationMinutes: number;
  organizerName: string;
  onPick: () => void;
  onFocus: () => void;
}) {
  const startsAt = useMemo(() => new Date(slot.startsAt), [slot.startsAt]);
  const localTime = formatTimeInTz(startsAt, viewerTz);
  const sourceTime = formatTimeInTz(startsAt, sourceTz);
  const dayName = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    timeZone: viewerTz,
  }).format(startsAt);
  const dateLabel = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: viewerTz,
  }).format(startsAt);

  return (
    <article
      className={`slot-card${focused ? ' is-focused' : ''}`}
      role="option"
      aria-selected={focused}
      aria-label={`${dayName} ${dateLabel} at ${localTime}, ${meetingDurationMinutes} minute meeting with ${organizerName}`}
    >
      <header className="slot-card__head">
        <span className="slot-card__day">{dayName}</span>
        <span className="slot-card__date mono">{dateLabel}</span>
      </header>

      <div className="slot-card__time-block">
        <span className="slot-card__time mono tabular">{localTime}</span>
        {viewerTz !== sourceTz && (
          <span className="slot-card__source mono">
            {sourceTime} <span className="slot-card__source-tag">organizer</span>
          </span>
        )}
      </div>

      <ul className="slot-card__meta">
        <li>
          <Clock size={13} strokeWidth={1.6} aria-hidden="true" />
          <span className="mono tabular">{meetingDurationMinutes}</span> min
        </li>
        <li>
          <Globe size={13} strokeWidth={1.6} aria-hidden="true" />
          <span>{viewerTz.split('/').pop()?.replace(/_/g, ' ') ?? viewerTz}</span>
        </li>
      </ul>

      {focused ? (
        <button type="button" className="slot-card__cta" onClick={onPick}>
          Book this time →
        </button>
      ) : (
        <button
          type="button"
          className="slot-card__focus-btn"
          onClick={onFocus}
          aria-label={`Focus ${dayName} at ${localTime}`}
        />
      )}
    </article>
  );
}
