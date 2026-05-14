import { useState } from 'react';
import { Check } from 'lucide-react';
import { ApiClientError, recoverAdminLinks } from '../lib/api';
import { navigate } from '../lib/routing';
import { FormField } from '../components/form/FormField';
import { TextInput } from '../components/form/Inputs';

/* ─── RecoverAdminPage ────────────────────────────────────
 * Lighter than AuthPage — the user lost something, doesn't
 * need a brand pitch. Single column on a calm warm surface
 * with a pixel-art reading-nook vignette as the brand mark.
 * The vignette evokes "cozy place where the lost thing is"
 * which fits the recovery moment. */

export function RecoverAdminPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'sent'>('idle');
  const [error, setError] = useState<string | undefined>();

  const submit = async () => {
    if (status === 'submitting') return;
    setStatus('submitting');
    setError(undefined);
    try {
      await recoverAdminLinks(email);
      setStatus('sent');
    } catch (error_) {
      setStatus('idle');
      setError(
        error_ instanceof ApiClientError
          ? error_.message
          : 'Could not start admin link recovery.',
      );
    }
  };

  if (status === 'sent') {
    return (
      <section className="recover-shell" aria-live="polite">
        <img
          className="recover-shell__vignette"
          src="/assets/bg/vignette-trio-mug-books.png"
          alt=""
        />
        <p className="recover-shell__eyebrow">
          <span>Recovery</span> sent
        </p>
        <h1 className="recover-shell__title">Check your inbox.</h1>
        <p className="recover-shell__body">
          If active boards exist for that email, we just queued every admin link tied
          to that address.
        </p>
        <div className="recover-shell__sent-row">
          <Check size={14} strokeWidth={2} aria-hidden="true" />
          <span className="mono">{email}</span>
        </div>
        <div className="recover-shell__actions">
          <button
            type="button"
            className="auth-split__alt"
            onClick={() => navigate('/signin')}
          >
            Sign in instead
          </button>
          <button
            type="button"
            className="auth-split__submit"
            onClick={() => navigate('/')}
          >
            Go home →
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="recover-shell">
      <img
        className="recover-shell__vignette"
        src="/assets/bg/vignette-reading-nook.png"
        alt=""
      />
      <p className="recover-shell__eyebrow">
        <span>Recover</span> admin link
      </p>
      <h1 className="recover-shell__title">Lost the link?</h1>
      <p className="recover-shell__body">
        Enter the email you used when the board was created. We’ll resend every
        admin link tied to that address.
      </p>

      <form
        className="recover-shell__form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FormField label="Organizer email">
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              type="email"
              describedBy={describedBy}
              invalid={invalid}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="organizer@example.com"
              disabled={status === 'submitting'}
              required
            />
          )}
        </FormField>

        {error && (
          <p className="recover-shell__error" aria-live="polite">
            {error}
          </p>
        )}

        <div className="recover-shell__actions">
          <button
            type="button"
            className="auth-split__alt"
            onClick={() => navigate('/')}
            disabled={status === 'submitting'}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="auth-split__submit"
            disabled={status === 'submitting'}
          >
            {status === 'submitting' ? 'Sending…' : 'Send recovery email →'}
          </button>
        </div>
      </form>
    </section>
  );
}
