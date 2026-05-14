/* ─── ChipGroup ───────────────────────────────────────
 * Wax-seal style radio chip group. Used for the meeting
 * duration picker (15 / 30 / 45 / 60 / 90 minutes). The
 * group exposes itself as role="radiogroup" + each chip as
 * role="radio" so screen readers announce it correctly. */

export interface ChipOption<T extends string | number> {
  value: T;
  /** Main label, e.g. "30". */
  primary: string;
  /** Sub label, e.g. "MIN". */
  secondary?: string;
}

export interface ChipGroupProps<T extends string | number> {
  ariaLabel: string;
  options: ChipOption<T>[];
  value: T;
  onChange: (next: T) => void;
}

export function ChipGroup<T extends string | number>({
  ariaLabel,
  options,
  value,
  onChange,
}: ChipGroupProps<T>) {
  return (
    <div className="chip-group" role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`chip-group__chip${selected ? ' is-selected' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            <span className="chip-group__chip-num">{opt.primary}</span>
            {opt.secondary && <span className="chip-group__chip-unit">{opt.secondary}</span>}
          </button>
        );
      })}
    </div>
  );
}
