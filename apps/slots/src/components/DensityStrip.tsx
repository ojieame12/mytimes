import { useMemo } from 'react';
import type { TimeSlot } from '../lib/types';
import { formatDayLabel } from '../lib/time';

/* ─── DensityStrip ────────────────────────────────────
 * Thin bar chart above the slot carousel. Each bar is a
 * day; height = slot count on that day. Bars are
 * clickable — clicking jumps the carousel to that day's
 * first slot. The current day (carousel-focused) gets a
 * highlighted band underneath.
 *
 * Territory legibility: participant sees the WEEK shape
 * (where are slots clustered) without having to scroll
 * the carousel to find out. */

export interface DensityStripProps {
  slots: TimeSlot[];
  viewerTz: string;
  /** Currently-focused slot index in the parent carousel. */
  focusedIndex: number;
  /** Called when a bar is clicked. Passes the index of the
   *  first slot on the clicked day. */
  onJumpToSlot: (slotIndex: number) => void;
}

export function DensityStrip({
  slots,
  viewerTz,
  focusedIndex,
  onJumpToSlot,
}: DensityStripProps) {
  /* Group slots by day with their starting index in the flat list. */
  const days = useMemo(() => {
    type Day = {
      dateKey: string;
      date: Date;
      count: number;
      firstIndex: number;
      lastIndex: number;
    };
    const map = new Map<string, Day>();
    slots.forEach((slot, i) => {
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
        existing.lastIndex = i;
      } else {
        map.set(dateKey, { dateKey, date: d, count: 1, firstIndex: i, lastIndex: i });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }, [slots, viewerTz]);

  const maxCount = days.reduce((m, d) => Math.max(m, d.count), 1);
  const focusedDayKey = useMemo(() => {
    const slot = slots[focusedIndex];
    if (!slot) return undefined;
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: viewerTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(slot.startsAt));
  }, [slots, focusedIndex, viewerTz]);

  if (days.length === 0) return null;

  return (
    <div className="density-strip" aria-label="Slot density by day">
      <div className="density-strip__bars">
        {days.map((day) => {
          const isCurrent = day.dateKey === focusedDayKey;
          const heightPct = Math.max(12, (day.count / maxCount) * 100);
          const label = formatDayLabel(day.date, viewerTz);
          return (
            <button
              key={day.dateKey}
              type="button"
              className={`density-strip__bar${isCurrent ? ' is-current' : ''}`}
              onClick={() => onJumpToSlot(day.firstIndex)}
              aria-label={`${label}: ${day.count} slot${day.count === 1 ? '' : 's'}`}
              aria-current={isCurrent ? 'true' : undefined}
            >
              <span
                className="density-strip__bar-fill"
                style={{ height: `${heightPct}%` }}
              />
              <span className="density-strip__bar-label mono">
                {label.split(' ').slice(1).join(' ')}
              </span>
              <span className="density-strip__bar-count mono tabular">{day.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
