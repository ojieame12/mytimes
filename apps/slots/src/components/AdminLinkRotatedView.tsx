import { useState } from 'react';
import { KeyRound } from 'lucide-react';

/* ─── AdminLinkRotatedView ──────────────────────────────
 * Letterpress receipt. Replaces the dashboard entirely
 * after a successful rotation. No celebratory seal — this
 * is a security receipt, not a milestone. The metadata
 * block does the work of confirming what happened, where
 * it went, and what state the previous URL is in.
 *
 * The resend action re-hits the rotate endpoint (each
 * call rotates again, so only the newest email is valid).
 * Rate limits live on the backend. */

function formatRotatedAt(ms: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toString();
  }
}

export interface AdminLinkRotatedViewProps {
  organizerEmail: string;
  eventTitle: string;
  onResend: () => Promise<void>;
}

export function AdminLinkRotatedView({
  organizerEmail,
  eventTitle,
  onResend,
}: AdminLinkRotatedViewProps) {
  /* Captured once on mount so re-renders during resend
     don't shift the "rotated at" reading. */
  const [rotatedAt] = useState(() => Date.now());
  const [resentAt, setResentAt] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);
  const [resentFlash, setResentFlash] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const resend = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await onResend();
      const now = Date.now();
      setResentAt(now);
      setResentFlash(true);
      window.setTimeout(() => setResentFlash(false), 2400);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Could not resend. Wait a minute and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const lastSentAt = resentAt ?? rotatedAt;

  return (
    <article className="admin-rotated material-panel">
      <header className="admin-rotated__head">
        <span className="admin-rotated__eyebrow">
          <KeyRound size={11} strokeWidth={2} aria-hidden="true" />
          Admin URL rotated
        </span>
        <h1 className="admin-rotated__title">
          New admin URL is in your inbox.
        </h1>
        <p className="admin-rotated__subhead">
          Open the email on whichever device you want to keep{' '}
          <em>{eventTitle}</em> on. The URL in this tab no longer works.
        </p>
      </header>

      <dl className="admin-rotated__receipt">
        <div className="admin-rotated__row">
          <dt>Rotated at</dt>
          <dd className="mono tabular">{formatRotatedAt(rotatedAt)}</dd>
        </div>
        <div className="admin-rotated__row">
          <dt>Sent to</dt>
          <dd className="mono">{organizerEmail}</dd>
        </div>
        <div className="admin-rotated__row">
          <dt>Previous URL</dt>
          <dd className="admin-rotated__row-strike">Invalidated</dd>
        </div>
        {resentAt ? (
          <div className="admin-rotated__row admin-rotated__row--update">
            <dt>Resent at</dt>
            <dd className="mono tabular">{formatRotatedAt(lastSentAt)}</dd>
          </div>
        ) : null}
      </dl>

      <p className="admin-rotated__note">
        Usually arrives within 30 seconds. Check spam if not. Each resend
        creates a newer admin URL, and only the latest email will work. The
        subject starts with &ldquo;Admin link recovery.&rdquo;
      </p>

      {error ? (
        <p className="admin-rotated__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="admin-rotated__actions">
        <button
          type="button"
          className="admin-rotated__resend"
          onClick={() => void resend()}
          disabled={busy}
        >
          {resentFlash
            ? 'Newer URL sent'
            : busy
              ? 'Sending newer URL.'
              : 'Rotate and send again'}
        </button>
      </div>
    </article>
  );
}
