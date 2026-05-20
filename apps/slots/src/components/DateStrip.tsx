import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { TimeSlot } from '../lib/types';
import { expressiveScrollBehavior, syncScrollBehavior } from '../lib/motion';
import '../styles/carousel.css';

/* ─── DateStrip ───────────────────────────────────────
 * Horizontal nav at the top of the picker. Each cell
 * mirrors the typographic block of the day band below
 * (small weekday, big numeral, count). Click a cell to
 * jump-scroll to the matching band.
 *
 * Adds: prev/next arrows, month dividers when the month
 * changes between cells, "today" mark, and sticky
 * positioning so the strip stays in reach while you
 * scroll the bands. */

export interface DateStripProps {
  slots: TimeSlot[];
  viewerTz: string;
  /** dateKey of the band most-visible in the viewport. */
  currentDateKey?: string;
}

export function DateStrip({ slots, viewerTz, currentDateKey }: DateStripProps) {
  const todayKey = useMemo(
    () =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: viewerTz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
    [viewerTz],
  );

  const days = useMemo(() => {
    type Day = {
      dateKey: string;
      date: Date;
      count: number;
      dayShort: string;
      dayNum: string;
      monthShort: string;
      monthKey: string;
    };
    const map = new Map<string, Day>();
    slots.forEach((slot) => {
      const d = new Date(slot.startsAt);
      const dateKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: viewerTz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
      const existing = map.get(dateKey);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(dateKey, {
          dateKey,
          date: d,
          count: 1,
          dayShort: new Intl.DateTimeFormat('en-GB', {
            weekday: 'short',
            timeZone: viewerTz,
          }).format(d),
          dayNum: new Intl.DateTimeFormat('en-GB', {
            day: 'numeric',
            timeZone: viewerTz,
          }).format(d),
          monthShort: new Intl.DateTimeFormat('en-GB', {
            month: 'short',
            timeZone: viewerTz,
          }).format(d),
          monthKey: new Intl.DateTimeFormat('en-CA', {
            timeZone: viewerTz,
            year: 'numeric',
            month: '2-digit',
          }).format(d),
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }, [slots, viewerTz]);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  /* Read scroll position to toggle arrow enable state. */
  const updateNav = () => {
    const t = trackRef.current;
    if (!t) return;
    setCanPrev(t.scrollLeft > 4);
    setCanNext(t.scrollLeft + t.clientWidth < t.scrollWidth - 4);
  };

  useEffect(() => {
    updateNav();
    const t = trackRef.current;
    if (!t) return;
    t.addEventListener('scroll', updateNav, { passive: true });
    const ro = new ResizeObserver(updateNav);
    ro.observe(t);
    return () => {
      t.removeEventListener('scroll', updateNav);
      ro.disconnect();
    };
  }, [days.length]);

  const scrollBy = (direction: -1 | 1) => {
    const t = trackRef.current;
    if (!t) return;
    /* Scroll one "page" (~75% of the visible width) for a meaningful jump. */
    t.scrollBy({ left: direction * t.clientWidth * 0.75, behavior: expressiveScrollBehavior() });
  };

  /* When the current date changes externally (band scrolled into view),
     auto-scroll the matching cell into view in the strip. */
  useEffect(() => {
    if (!currentDateKey) return;
    const t = trackRef.current;
    if (!t) return;
    const cell = t.querySelector<HTMLElement>(`[data-date="${currentDateKey}"]`);
    if (!cell) return;
    const cellLeft = cell.offsetLeft - t.offsetLeft;
    const cellRight = cellLeft + cell.offsetWidth;
    const viewLeft = t.scrollLeft;
    const viewRight = viewLeft + t.clientWidth;
    if (cellLeft < viewLeft || cellRight > viewRight) {
      cell.scrollIntoView({ behavior: syncScrollBehavior(), block: 'nearest', inline: 'nearest' });
    }
  }, [currentDateKey]);

  if (days.length === 0) return null;

  return (
    <nav className="date-strip" aria-label="Jump to day">
      <button
        type="button"
        className="date-strip__nav-btn date-strip__nav-btn--prev"
        onClick={() => scrollBy(-1)}
        disabled={!canPrev}
        aria-label="Earlier dates"
      >
        <ChevronLeft size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>

      <div className="date-strip__track" ref={trackRef}>
        {days.map((day, i) => {
          const prev = days[i - 1];
          const monthChanged = !prev || prev.monthKey !== day.monthKey;
          const isCurrent = day.dateKey === currentDateKey;
          const isToday = day.dateKey === todayKey;
          return (
            <div key={day.dateKey} className="date-strip__segment">
              {monthChanged && (
                <span className="date-strip__month" aria-hidden="true">
                  {day.monthShort}
                </span>
              )}
              <button
                type="button"
                data-date={day.dateKey}
                className={`date-strip__cell${isCurrent ? ' is-current' : ''}${isToday ? ' is-today' : ''}`}
                onClick={() => {
                  const anchor = document.getElementById(`day-${day.dateKey}`);
                  anchor?.scrollIntoView({ behavior: expressiveScrollBehavior(), block: 'start' });
                }}
                aria-current={isCurrent ? 'true' : undefined}
                aria-label={`${day.dayShort} ${day.dayNum} ${day.monthShort}: ${day.count} slot${day.count === 1 ? '' : 's'}`}
              >
                <span className="date-strip__cell-day">{day.dayShort}</span>
                <span className="date-strip__cell-num">{day.dayNum}</span>
                <span className="date-strip__cell-count mono tabular">{day.count}</span>
                {isToday && <span className="date-strip__cell-today" aria-hidden="true" />}
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="date-strip__nav-btn date-strip__nav-btn--next"
        onClick={() => scrollBy(1)}
        disabled={!canNext}
        aria-label="Later dates"
      >
        <ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </nav>
  );
}
