import { TimeInput } from './Inputs';
import type { BlockedRangeDraft } from '../../lib/wizard';

/* ─── BlockedRangesField ──────────────────────────────
 * Optional list of HH:mm time ranges to carve out of the
 * daily window. Each row is start–end + remove. An empty
 * list shows a one-line placeholder. The "Add a break"
 * action appends a sensible default. */

export interface BlockedRangesFieldProps {
  value: BlockedRangeDraft[];
  onChange: (next: BlockedRangeDraft[]) => void;
  /** Map of "blockedRanges.{i}" -> error message. */
  errors?: Record<string, string>;
}

export function BlockedRangesField({ value, onChange, errors = {} }: BlockedRangesFieldProps) {
  const update = (i: number, patch: Partial<BlockedRangeDraft>) => {
    const next = value.map((row, idx) => (idx === i ? { ...row, ...patch } : row));
    onChange(next);
  };
  const remove = (i: number) => {
    onChange(value.filter((_, idx) => idx !== i));
  };
  const add = () => {
    onChange([...value, { start: '12:00', end: '13:00' }]);
  };

  return (
    <div className="blocked-ranges">
      {value.length === 0 && (
        <p className="blocked-ranges__empty">No breaks. Slots will cover the whole daily window.</p>
      )}
      {value.map((row, i) => {
        const rowError = errors[`blockedRanges.${i}`];
        return (
          <div key={i}>
            <div className="blocked-ranges__row">
              <TimeInput
                aria-label={`Break ${i + 1} start`}
                value={row.start}
                invalid={Boolean(rowError)}
                onChange={(e) => update(i, { start: e.target.value })}
              />
              <span className="blocked-ranges__dash" aria-hidden="true">→</span>
              <TimeInput
                aria-label={`Break ${i + 1} end`}
                value={row.end}
                invalid={Boolean(rowError)}
                onChange={(e) => update(i, { end: e.target.value })}
              />
              <button
                type="button"
                aria-label={`Remove break ${i + 1}`}
                className="blocked-ranges__remove"
                onClick={() => remove(i)}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path
                    d="M6 6 L18 18 M18 6 L6 18"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
              </button>
            </div>
            {rowError && (
              <span className="form-field__error" role="alert" style={{ marginTop: 4 }}>
                {rowError}
              </span>
            )}
          </div>
        );
      })}
      <button
        type="button"
        className="material-stamp-light is-sm blocked-ranges__add"
        onClick={add}
      >
        + Add a break
      </button>
    </div>
  );
}
