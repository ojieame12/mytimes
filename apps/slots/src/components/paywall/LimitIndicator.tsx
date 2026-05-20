import type { ReactNode } from 'react';

export interface LimitIndicatorProps {
  /** Current usage. Omit when state === 'unlimited' or 'expired'. */
  count?: number;
  /** Cap. Omit when state === 'unlimited' or 'expired'. */
  max?: number;
  /** Short noun: "bookings", "slots", "boards". */
  unit: string;
  /** Three sizes:
   *  · sm — inline-card use (compact, body text)
   *  · md — default workhorse (admin board, my-boards card)
   *  · lg — hero/stat use (stacked, big mono numerals) */
  size?: 'sm' | 'md' | 'lg';
  /** inline (icon + count + bar in one stack) or stacked (count
   *  on top, bar below). lg always stacks. */
  layout?: 'inline' | 'stacked';
  /** Optional left icon (lucide, 12–18px depending on size). */
  icon?: ReactNode;
  /** Optional one-line note under the bar — e.g. "80% of free
   *  limit", "Free limit reached. Upgrade to keep accepting." */
  helperText?: ReactNode;
  /** Override the auto-derived state for non-numeric usage. */
  state?: 'unlimited' | 'expired';
  className?: string;
}

type ToneClass = '' | ' is-warming' | ' is-near' | ' is-at';

function toneFromRatio(count?: number, max?: number): ToneClass {
  if (typeof count !== 'number' || typeof max !== 'number' || max <= 0) return '';
  const ratio = count / max;
  if (ratio >= 0.95) return ' is-at';
  if (ratio >= 0.8) return ' is-near';
  if (ratio >= 0.6) return ' is-warming';
  return '';
}

export function LimitIndicator({
  count,
  max,
  unit,
  size = 'md',
  layout = 'inline',
  icon,
  helperText,
  state,
  className,
}: LimitIndicatorProps) {
  const effectiveLayout = size === 'lg' ? 'stacked' : layout;
  const tone =
    state === 'unlimited'
      ? ' is-unlimited'
      : state === 'expired'
        ? ' is-expired'
        : toneFromRatio(count, max);
  const ratio =
    state || typeof count !== 'number' || typeof max !== 'number' || max <= 0
      ? null
      : Math.min(1, count / max);

  const classes = [
    'limit-v2',
    `limit-v2--${size}`,
    `limit-v2--${effectiveLayout}`,
    tone.trim(),
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const ariaLabel =
    state === 'unlimited'
      ? `Unlimited ${unit}`
      : state === 'expired'
        ? `${unit} expired`
        : `${count} of ${max} ${unit}`;

  return (
    <span className={classes} aria-label={ariaLabel}>
      <span className="limit-v2__row">
        {icon ? <span className="limit-v2__icon" aria-hidden="true">{icon}</span> : null}
        <span className="limit-v2__count">
          {state === 'unlimited' ? (
            <>
              <span className="limit-v2__symbol">∞</span>
              <span className="limit-v2__unit">{unit}</span>
            </>
          ) : state === 'expired' ? (
            <span className="limit-v2__expired">Expired</span>
          ) : (
            <>
              <span className="limit-v2__current">{count}</span>
              <span className="limit-v2__sep">/</span>
              <span className="limit-v2__max">{max}</span>
              <span className="limit-v2__unit">{unit}</span>
            </>
          )}
        </span>
      </span>
      {ratio !== null ? (
        <span
          className="limit-v2__track"
          aria-hidden="true"
          style={{ ['--limit-v2-fill' as string]: `${ratio * 100}%` }}
        >
          <span className="limit-v2__fill" />
        </span>
      ) : state === 'expired' ? (
        <span className="limit-v2__track limit-v2__track--expired" aria-hidden="true">
          <span className="limit-v2__fill" />
        </span>
      ) : state === 'unlimited' ? (
        <span className="limit-v2__track limit-v2__track--unlimited" aria-hidden="true">
          <span className="limit-v2__fill" />
        </span>
      ) : null}
      {helperText ? <span className="limit-v2__helper">{helperText}</span> : null}
    </span>
  );
}
