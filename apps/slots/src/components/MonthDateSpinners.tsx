import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import type { TimeSlot } from '../lib/types';
import '../styles/date-dial.css';

/* ─── MonthDateSpinners ───────────────────────────────────
 * Two compact pills at the top of the picker — one for month,
 * one for date — each with chevron-up / chevron-down steppers
 * above and below. Tap a chevron to step through values; the
 * date band scrolls into view automatically.
 *
 * No popover, no confirm — direct interaction. */

export interface MonthDateSpinnersProps {
  slots: TimeSlot[];
  viewerTz: string;
  /** Currently-visible day-band's dateKey from the page scroll.
   *  The spinners reflect this when the user scrolls externally. */
  currentDateKey?: string;
  onSelectDate?: (dateKey: string) => void;
}

type Day = {
  dateKey: string;
  date: Date;
  dayShort: string;
  dayNum: string;
  monthKey: string;
  monthShort: string;
};

type Month = {
  monthKey: string;
  monthShort: string;
  dateKeys: string[];
};

export function MonthDateSpinners({
  slots,
  viewerTz,
  currentDateKey,
  onSelectDate,
}: MonthDateSpinnersProps) {
  const days = useMemo<Day[]>(() => {
    const map = new Map<string, Day>();
    slots.forEach((slot) => {
      const d = new Date(slot.startsAt);
      const dateKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: viewerTz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
      if (map.has(dateKey)) return;
      map.set(dateKey, {
        dateKey,
        date: d,
        dayShort: new Intl.DateTimeFormat('en-GB', {
          weekday: 'short',
          timeZone: viewerTz,
        }).format(d),
        dayNum: new Intl.DateTimeFormat('en-GB', {
          day: '2-digit',
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
    });
    return Array.from(map.values()).sort((a, b) =>
      a.dateKey.localeCompare(b.dateKey),
    );
  }, [slots, viewerTz]);

  const months = useMemo<Month[]>(() => {
    const map = new Map<string, Month>();
    days.forEach((d) => {
      const existing = map.get(d.monthKey);
      if (existing) {
        existing.dateKeys.push(d.dateKey);
      } else {
        map.set(d.monthKey, {
          monthKey: d.monthKey,
          monthShort: d.monthShort,
          dateKeys: [d.dateKey],
        });
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.monthKey.localeCompare(b.monthKey),
    );
  }, [days]);

  /* Resolve the active month/date from currentDateKey when it
     comes in from outside (page scroll). Fall back to the first
     available date. */
  const externalActive = useMemo(() => {
    const key = currentDateKey ?? days[0]?.dateKey;
    const day = days.find((d) => d.dateKey === key) ?? days[0];
    if (!day) return null;
    const monthIdx = months.findIndex((m) => m.monthKey === day.monthKey);
    const dateIdx = months[monthIdx]?.dateKeys.indexOf(day.dateKey) ?? 0;
    return { monthIdx, dateIdx };
  }, [currentDateKey, days, months]);

  const [monthIdx, setMonthIdx] = useState(externalActive?.monthIdx ?? 0);
  const [dateIdx, setDateIdx] = useState(externalActive?.dateIdx ?? 0);

  /* Tracks whether the latest change came from us (so we don't
     loop on external sync). */
  const ownChangeRef = useRef(false);

  /* Sync from external when the user scrolls the page. */
  useEffect(() => {
    if (!externalActive) return;
    if (ownChangeRef.current) {
      ownChangeRef.current = false;
      return;
    }
    setMonthIdx(externalActive.monthIdx);
    setDateIdx(externalActive.dateIdx);
  }, [externalActive]);

  const month = months[monthIdx];
  const monthDays = useMemo(
    () => (month ? days.filter((d) => d.monthKey === month.monthKey) : []),
    [days, month],
  );
  const day = monthDays[dateIdx];

  /* Fire onSelectDate whenever the active date changes from a
     user interaction. */
  const lastFiredRef = useRef<string | undefined>(day?.dateKey);
  useEffect(() => {
    if (!day) return;
    if (!ownChangeRef.current) return;
    if (day.dateKey === lastFiredRef.current) return;
    lastFiredRef.current = day.dateKey;
    onSelectDate?.(day.dateKey);
  }, [day, onSelectDate]);

  const stepMonth = (dir: -1 | 1) => {
    const next = monthIdx + dir;
    if (next < 0 || next >= months.length) return;
    ownChangeRef.current = true;
    setMonthIdx(next);
    setDateIdx(0);
  };

  const stepDate = (dir: -1 | 1) => {
    const next = dateIdx + dir;
    if (next < 0 || next >= monthDays.length) return;
    ownChangeRef.current = true;
    setDateIdx(next);
  };

  if (!month || !day) return null;

  const onPickMonth = (i: number) => {
    ownChangeRef.current = true;
    setMonthIdx(i);
    setDateIdx(0);
  };
  const onPickDate = (i: number) => {
    ownChangeRef.current = true;
    setDateIdx(i);
  };

  return (
    <div className="month-date" role="group" aria-label="Pick a date">
      <SpinPill
        ariaLabel="Month"
        prevLabel="Previous month"
        nextLabel="Next month"
        canPrev={monthIdx > 0}
        canNext={monthIdx < months.length - 1}
        onPrev={() => stepMonth(-1)}
        onNext={() => stepMonth(1)}
        items={months}
        activeIndex={monthIdx}
        onPick={onPickMonth}
        renderItem={(m) => <span>{m.monthShort}</span>}
        getItemKey={(m) => m.monthKey}
      >
        <span className="month-date__month">{month.monthShort}</span>
      </SpinPill>
      <SpinPill
        ariaLabel="Date"
        prevLabel="Previous date"
        nextLabel="Next date"
        canPrev={dateIdx > 0}
        canNext={dateIdx < monthDays.length - 1}
        onPrev={() => stepDate(-1)}
        onNext={() => stepDate(1)}
        items={monthDays}
        activeIndex={dateIdx}
        onPick={onPickDate}
        renderItem={(d) => (
          <>
            <span className="spin-pill__pop-weekday">{d.dayShort}</span>
            <span className="spin-pill__pop-num mono tabular">{d.dayNum}</span>
          </>
        )}
        getItemKey={(d) => d.dateKey}
      >
        <span className="month-date__weekday">{day.dayShort}</span>
        <span className="month-date__num mono tabular">{day.dayNum}</span>
      </SpinPill>
    </div>
  );
}

/* ─── SpinPill ────────────────────────────────────────────
 * A value pill with up/down chevron steppers, plus a small
 * popout list that opens when you click the pill itself. The
 * popout is for "jump to any value fast"; the chevrons are for
 * "nudge by one". Two affordances, same primitive. */
function SpinPill<T>({
  children,
  ariaLabel,
  prevLabel,
  nextLabel,
  canPrev,
  canNext,
  onPrev,
  onNext,
  items,
  activeIndex,
  onPick,
  renderItem,
  getItemKey,
}: {
  children: ReactNode;
  ariaLabel: string;
  prevLabel: string;
  nextLabel: string;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  items: T[];
  activeIndex: number;
  onPick: (i: number) => void;
  renderItem: (item: T, index: number) => ReactNode;
  getItemKey: (item: T, index: number) => string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  /* Click-outside + Esc dismissal. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (wrapRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /* When the popout opens, scroll the active item into view. */
  useEffect(() => {
    if (!open) return;
    const active = popRef.current?.querySelector<HTMLElement>(
      '.spin-pill__pop-item.is-active',
    );
    active?.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
  }, [open]);

  return (
    <div className="spin-pill" role="group" aria-label={ariaLabel} ref={wrapRef}>
      <button
        type="button"
        className="spin-pill__chev spin-pill__chev--up"
        onClick={onPrev}
        disabled={!canPrev}
        aria-label={prevLabel}
      >
        <ChevronUp size={14} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`spin-pill__value${open ? ' is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {children}
      </button>
      <button
        type="button"
        className="spin-pill__chev spin-pill__chev--down"
        onClick={onNext}
        disabled={!canNext}
        aria-label={nextLabel}
      >
        <ChevronDown size={14} strokeWidth={1.8} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={popRef}
          className="spin-pill__pop"
          role="listbox"
          aria-label={ariaLabel}
        >
          {items.map((item, i) => {
            const isActive = i === activeIndex;
            return (
              <button
                key={getItemKey(item, i)}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`spin-pill__pop-item${isActive ? ' is-active' : ''}`}
                onClick={() => {
                  onPick(i);
                  setOpen(false);
                }}
              >
                {renderItem(item, i)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
