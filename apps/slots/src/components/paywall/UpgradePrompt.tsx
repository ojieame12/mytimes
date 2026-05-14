import { useEffect, type ReactNode } from 'react';
import {
  ArrowRight,
  CalendarCheck,
  FileDown,
  ShieldCheck,
  X,
} from 'lucide-react';
import { PLAN_LIMITS } from './limits';

export interface UpgradePromptProps {
  title: ReactNode;
  body: ReactNode;
  current?: number;
  max?: number;
  unit?: string;
  primaryLabel: string;
  primaryPrice?: string;
  ghostLabel?: string;
  secondaryLabel?: string;
  onPrimary: () => void;
  onClose: () => void;
  onSecondary?: () => void;
}

export function UpgradePrompt({
  title,
  body,
  current,
  max,
  unit,
  primaryLabel,
  primaryPrice = '$19',
  ghostLabel = 'Keep editing',
  secondaryLabel,
  onPrimary,
  onClose,
  onSecondary,
}: UpgradePromptProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="upgrade-prompt" role="presentation" onMouseDown={onClose}>
      <section
        className="upgrade-prompt__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-prompt-title"
        aria-describedby="upgrade-prompt-body"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="upgrade-prompt__close"
          onClick={onClose}
          aria-label="Close upgrade prompt"
        >
          <X size={15} strokeWidth={1.8} aria-hidden="true" />
        </button>

        <header className="upgrade-prompt__head">
          <p className="upgrade-prompt__eyebrow">
            <span className="upgrade-prompt__eyebrow-dot" aria-hidden="true" />
            Board unlock
          </p>
          <h2 className="upgrade-prompt__title" id="upgrade-prompt-title">
            {title}
          </h2>
          <p className="upgrade-prompt__body" id="upgrade-prompt-body">
            {body}
          </p>
        </header>

        <div className="upgrade-prompt__strip" aria-label="Board unlock includes">
          {typeof current === 'number' && typeof max === 'number' && unit && (
            <span className="upgrade-prompt__strip-item">
              <CalendarCheck size={13} strokeWidth={1.8} aria-hidden="true" />
              <span>
                <span className="mono">{current}</span> of <span className="mono">{max}</span> free {unit}
              </span>
            </span>
          )}
          <span className="upgrade-prompt__strip-item">
            <ShieldCheck size={13} strokeWidth={1.8} aria-hidden="true" />
            <span>
              <span className="mono">{PLAN_LIMITS.eventPass.bookings}</span> bookings
            </span>
          </span>
          <span className="upgrade-prompt__strip-item">
            <FileDown size={13} strokeWidth={1.8} aria-hidden="true" />
            <span>
              <span className="mono">{PLAN_LIMITS.eventPass.retentionDays}</span>-day window
            </span>
          </span>
        </div>

        <div className="upgrade-prompt__actions">
          <button type="button" className="upgrade-prompt__primary" onClick={onPrimary}>
            <span>{primaryLabel}</span>
            <span className="upgrade-prompt__primary-price">{primaryPrice}</span>
            <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
          </button>
          <button type="button" className="upgrade-prompt__ghost" onClick={onClose}>
            {ghostLabel}
          </button>
          {secondaryLabel && onSecondary && (
            <button
              type="button"
              className="upgrade-prompt__secondary"
              onClick={onSecondary}
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
