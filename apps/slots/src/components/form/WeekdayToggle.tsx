/* ─── WeekdayToggle ──────────────────────────────────
 * Seven-button day picker. Values are 0..6 matching
 * Date.getUTCDay() (0 = Sunday). We display Mon-first
 * because that's the more common business-week reading
 * order — the value list is sorted ascending for storage. */

const ORDER: { value: number; short: string; letter: string; full: string }[] = [
  { value: 1, short: 'Mon', letter: 'M', full: 'Monday' },
  { value: 2, short: 'Tue', letter: 'T', full: 'Tuesday' },
  { value: 3, short: 'Wed', letter: 'W', full: 'Wednesday' },
  { value: 4, short: 'Thu', letter: 'T', full: 'Thursday' },
  { value: 5, short: 'Fri', letter: 'F', full: 'Friday' },
  { value: 6, short: 'Sat', letter: 'S', full: 'Saturday' },
  { value: 0, short: 'Sun', letter: 'S', full: 'Sunday' },
];

export interface WeekdayToggleProps {
  value: number[];
  onChange: (next: number[]) => void;
  ariaLabel?: string;
}

export function WeekdayToggle({ value, onChange, ariaLabel = 'Days of the week' }: WeekdayToggleProps) {
  const selected = new Set(value);

  const toggle = (day: number) => {
    const next = new Set(selected);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    onChange(Array.from(next).sort((a, b) => a - b));
  };

  return (
    <div className="weekday-toggle" role="group" aria-label={ariaLabel}>
      {ORDER.map((day) => {
        const isSelected = selected.has(day.value);
        return (
          <button
            key={day.value}
            type="button"
            aria-pressed={isSelected}
            aria-label={day.full}
            className={`weekday-toggle__day${isSelected ? ' is-selected' : ''}`}
            onClick={() => toggle(day.value)}
          >
            <span className="weekday-toggle__day-short">{day.short}</span>
            <span className="weekday-toggle__day-letter">{day.letter}</span>
          </button>
        );
      })}
    </div>
  );
}
