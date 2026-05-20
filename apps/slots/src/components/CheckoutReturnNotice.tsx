import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  CreditCard,
  RefreshCw,
  X,
} from 'lucide-react';
import '../styles/checkout-return.css';

export type CheckoutReturnTone = 'success' | 'pending' | 'warning' | 'danger';

type CheckoutReturnNoticeProps = {
  tone: CheckoutReturnTone;
  eyebrow: string;
  title: string;
  body: string;
  actionLabel?: string;
  actionKind?: 'refresh' | 'checkout';
  busy?: boolean;
  onAction?: () => void;
  onDismiss?: () => void;
};

export function CheckoutReturnNotice({
  tone,
  eyebrow,
  title,
  body,
  actionLabel,
  actionKind = 'refresh',
  busy = false,
  onAction,
  onDismiss,
}: CheckoutReturnNoticeProps) {
  const Icon = tone === 'success'
    ? CheckCircle2
    : tone === 'pending'
      ? Clock3
      : AlertTriangle;
  const ActionIcon = actionKind === 'checkout' ? CreditCard : RefreshCw;

  return (
    <section className={`checkout-return checkout-return--${tone}`} aria-live="polite">
      <span className="checkout-return__mark" aria-hidden="true">
        <Icon size={18} strokeWidth={1.9} />
      </span>
      <div className="checkout-return__copy">
        <span className="checkout-return__eyebrow">{eyebrow}</span>
        <h2 className="checkout-return__title">{title}</h2>
        <p className="checkout-return__body">{body}</p>
      </div>
      <div className="checkout-return__actions">
        {actionLabel && onAction && (
          <button
            type="button"
            className="checkout-return__action"
            onClick={onAction}
            disabled={busy}
          >
            <ActionIcon size={14} strokeWidth={1.8} aria-hidden="true" />
            <span>{busy ? 'Working.' : actionLabel}</span>
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            className="checkout-return__dismiss"
            onClick={onDismiss}
            aria-label="Dismiss checkout notice"
          >
            <X size={15} strokeWidth={1.8} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}
