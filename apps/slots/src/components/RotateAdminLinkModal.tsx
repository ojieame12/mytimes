import { useEffect, useState } from 'react';
import { KeyRound, X } from 'lucide-react';

/* ─── RotateAdminLinkModal ──────────────────────────────
 * Editorial security card for self-service rotation of the
 * admin URL. The dialog shows the artifact being rotated
 * (truncated current URL → destination email) so the action
 * reads as a tangible transaction, not a generic SaaS
 * "are you sure?" confirm.
 *
 * Parent owns the success view — this dialog only confirms
 * intent and reports the outcome up via onRotated. */

export interface RotateAdminLinkModalProps {
  eventTitle: string;
  organizerEmail: string;
  /** Pre-formatted display of the current admin URL, e.g.
   *  "mytimes.co/a/…4Tn8". Parent computes from window.location. */
  currentUrlDisplay: string;
  onCancel: () => void;
  onRotated: () => void;
  rotate: () => Promise<void>;
}

export function RotateAdminLinkModal({
  eventTitle,
  organizerEmail,
  currentUrlDisplay,
  onCancel,
  onRotated,
  rotate,
}: RotateAdminLinkModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, submitting]);

  const submit = async () => {
    setSubmitting(true);
    setError(undefined);
    try {
      await rotate();
      onRotated();
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Could not rotate the admin URL. Try again in a moment.',
      );
      setSubmitting(false);
    }
  };

  return (
    <div
      className="rotate-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rotate-modal-title"
    >
      <div
        className="rotate-modal__scrim"
        onClick={submitting ? undefined : onCancel}
      />
      <section className="rotate-modal__panel">
        <header className="rotate-modal__head">
          <div className="rotate-modal__head-text">
            <span className="rotate-modal__eyebrow">
              <KeyRound size={11} strokeWidth={2} aria-hidden="true" />
              Admin URL rotation
            </span>
            <h2 id="rotate-modal-title" className="rotate-modal__title">
              Send a new admin URL.
            </h2>
          </div>
          <button
            type="button"
            className="rotate-modal__close"
            onClick={onCancel}
            disabled={submitting}
            aria-label="Cancel"
          >
            <X size={15} strokeWidth={1.8} />
          </button>
        </header>

        <dl className="rotate-modal__meta">
          <div className="rotate-modal__meta-row">
            <dt>Current</dt>
            <dd className="mono rotate-modal__meta-strike">
              {currentUrlDisplay}
            </dd>
          </div>
          <div className="rotate-modal__meta-row">
            <dt>New URL</dt>
            <dd className="rotate-modal__meta-dest">
              Arrives at <strong>{organizerEmail}</strong>
            </dd>
          </div>
        </dl>

        <p className="rotate-modal__body">
          The URL in this tab stops working immediately. Participants and the
          public booking link are not affected. Open the new email next time
          you need to manage <em>{eventTitle}</em>.
        </p>

        <label className="rotate-modal__ack">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            disabled={submitting}
          />
          <span>I understand the current admin URL will stop working.</span>
        </label>

        {error ? (
          <p className="rotate-modal__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="rotate-modal__actions">
          <button
            type="button"
            className="rotate-modal__cancel"
            onClick={onCancel}
            disabled={submitting}
          >
            Keep current URL
          </button>
          <button
            type="button"
            className="material-stamp-dark is-md rotate-modal__send"
            onClick={() => void submit()}
            disabled={submitting || !acknowledged}
          >
            {submitting ? <>Sending&hellip;</> : <>Send new URL</>}
          </button>
        </div>
      </section>
    </div>
  );
}
