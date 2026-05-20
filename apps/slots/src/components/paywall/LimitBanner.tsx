import { AlertTriangle, ArrowRight } from 'lucide-react';

export interface LimitBannerProps {
  count: number;
  max: number;
  unit: string;
  onUpgrade: () => void;
}

export function LimitBanner({ count, max, unit, onUpgrade }: LimitBannerProps) {
  const verb = unit === 'days' ? 'spans' : 'creates';
  return (
    <section className="limit-banner" aria-live="polite">
      <span className="limit-banner__head">
        <AlertTriangle size={14} strokeWidth={1.8} aria-hidden="true" />
        Free limit exceeded
      </span>
      <p className="limit-banner__body">
        This setup {verb} <strong className="mono">{count}</strong> {unit}.
        Free boards include <strong className="mono">{max}</strong> {unit}. Keep
        the setup and upgrade from the admin link after posting.
      </p>
      <button type="button" className="limit-banner__cta" onClick={onUpgrade}>
        See capacity upgrade <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />
      </button>
    </section>
  );
}
