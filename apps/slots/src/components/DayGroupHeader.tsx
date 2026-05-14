import { formatDayLabel } from '../lib/time';

/* ─── DayGroupHeader ──────────────────────────────────────
 * "MON 12 MAY ────────────── 4 OPEN" — mono-styled date,
 * hairline rule, count chip. When openCount is zero we
 * switch the right-side label to "ALL SLOTS BOOKED". */

export interface DayGroupHeaderProps {
  date: Date;
  viewerTz: string;
  openCount: number;
  totalCount: number;
  mode?: 'public' | 'admin';
}

export function DayGroupHeader({
  date,
  viewerTz,
  openCount,
  totalCount,
  mode = 'public',
}: DayGroupHeaderProps) {
  const fullyBooked = openCount === 0 && totalCount > 0;
  const countLabel =
    mode === 'admin'
      ? `${totalCount - openCount}/${totalCount} BOOKED`
      : fullyBooked
      ? 'ALL SLOTS BOOKED'
      : `${openCount} OPEN`;

  return (
    <div className="day-group-header">
      <span className="day-group-header__date">
        {formatDayLabel(date, viewerTz)}
      </span>
      <span className="day-group-header__rule" aria-hidden="true" />
      <span
        className={`day-group-header__count${
          fullyBooked ? ' is-full' : ''
        }`}
      >
        {countLabel}
      </span>
    </div>
  );
}
