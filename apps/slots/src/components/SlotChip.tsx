import type { SlotState } from '../lib/types';
import { formatTimeInTz, formatTzAbbrev } from '../lib/time';

/* ─── SlotChip — the wax-disc time chip ───────────────────
 * The central primitive of the app. Renders a single time
 * slot as a small letterpressed plate. State variants:
 *
 *   open           cream wax · clickable · hover warms
 *   booked         warm wax · initials below · admin only
 *                  (public view excludes booked slots entirely)
 *   closed         hatched grey · struck-through · not clickable
 *   blocked        computed unavailable because it overlaps a booking
 *   just-claimed   warm wax + checkmark · your own confirmation
 *   cancelled      historical, ghosted; shown only in admin filter
 *
 * Admin-only metadata (initials, bounce badge) renders only when
 * mode='admin' AND the relevant fields are present. */

export interface SlotChipProps {
  startsAt: Date;
  state: SlotState;
  viewerTz: string;
  sourceTz: string;
  mode?: 'public' | 'admin';
  initials?: string;
  emailBounced?: boolean;
  onClick?: () => void;
}

export function SlotChip({
  startsAt,
  state,
  viewerTz,
  sourceTz,
  mode = 'public',
  initials,
  emailBounced,
  onClick,
}: SlotChipProps) {
  const localTime = formatTimeInTz(startsAt, viewerTz);
  const localTz = formatTzAbbrev(startsAt, viewerTz);
  const sourceTime = formatTimeInTz(startsAt, sourceTz);
  const sourceTzLabel = formatTzAbbrev(startsAt, sourceTz);
  const showSource = viewerTz !== sourceTz;

  const interactive =
    onClick && (state === 'open' || (mode === 'admin' && state !== 'cancelled'));

  const classNames = [
    'slot-chip',
    `slot-chip--${state}`,
    mode === 'admin' ? 'slot-chip--admin' : 'slot-chip--public',
    interactive ? 'is-interactive' : '',
    emailBounced && mode === 'admin' ? 'has-bounce' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const aria = `${localTime} ${localTz}, ${state}${
    showSource ? `, source time ${sourceTime} ${sourceTzLabel}` : ''
  }`;

  const body = (
    <>
      <span className="slot-chip__time">{localTime}</span>
      <span className="slot-chip__tz">{localTz}</span>
      {mode === 'admin' && state === 'booked' && initials && (
        <span className="slot-chip__initials">{initials}</span>
      )}
      {(state === 'closed' || state === 'blocked') && (
        <span className="slot-chip__strike" aria-hidden="true" />
      )}
      {emailBounced && mode === 'admin' && (
        <span className="slot-chip__badge slot-chip__badge--bounce" aria-hidden="true">
          !
        </span>
      )}
      {state === 'just-claimed' && (
        <span className="slot-chip__badge slot-chip__badge--check" aria-hidden="true">
          ✓
        </span>
      )}
    </>
  );

  if (!interactive) {
    return (
      <span className={classNames} aria-label={aria} role="presentation">
        {body}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={classNames}
      aria-label={aria}
      onClick={onClick}
    >
      {body}
    </button>
  );
}
