import { useState } from 'react';
import { Check } from 'lucide-react';
import { navigate } from '../lib/routing';
import { FormField } from '../components/form/FormField';
import { TextInput } from '../components/form/Inputs';
import { ApiClientError, requestMyBoardsLink } from '../lib/api';

/* ─── RequestBoardsLinkPage ───────────────────────────────
 * Magic-link gate for the /my-boards cross-event surface.
 * Lower-friction sibling of RecoverAdminPage: organizers
 * who do not have a full Company account land here,
 * type their email, and get a link to a page listing every
 * board they've created with that email.
 *
 * Two states:
 *  - idle  : single peach card, eyebrow + display title +
 *            body + one email field + submit
 *  - sent  : same card material, swap the form for a green
 *            success row + Resend ghost link
 *
 * Pixel-art vignette (trio-mug-books) sits above the title
 * as a brand mark — same vocabulary as RecoverAdminPage. */

export function RequestBoardsLinkPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'sent'>('idle');
  const [error, setError] = useState<string | undefined>();

  const submit = async () => {
    if (status === 'submitting') return;
    setStatus('submitting');
    setError(undefined);
    try {
      await requestMyBoardsLink(email);
      setStatus('sent');
    } catch (error_) {
      setStatus('idle');
      setError(
        error_ instanceof ApiClientError || error_ instanceof Error
          ? error_.message
          : 'Could not send the link. Try again.',
      );
    }
  };

  const resend = async () => {
    setStatus('submitting');
    try {
      await requestMyBoardsLink(email);
      setStatus('sent');
    } catch {
      setStatus('sent');
    }
  };

  if (status === 'sent') {
    return (
      <section className="my-boards-request" aria-live="polite">
        <img
          className="my-boards-request__vignette"
          src="/assets/bg/vignette-trio-mug-books.webp"
          alt=""
          width="96"
          height="96"
          decoding="async"
        />
        <p className="my-boards-request__eyebrow">
          <span>Check</span> your inbox
        </p>
        <h1 className="my-boards-request__title">Link on its way.</h1>
        <p className="my-boards-request__body">
          If any mytimes boards exist for that email, we just sent a link to a page
          listing every one, free and paid.
        </p>
        <div className="my-boards-request__sent-row">
          <Check size={14} strokeWidth={2} aria-hidden="true" />
          <span className="mono">{email}</span>
        </div>
        <button
          type="button"
          className="my-boards-request__resend"
          onClick={() => void resend()}
        >
          Resend the link
        </button>
        <div className="my-boards-request__actions">
          <button
            type="button"
            className="auth-split__alt"
            onClick={() => navigate('/')}
          >
            Go home
          </button>
          <button
            type="button"
            className="auth-split__submit"
            onClick={() => navigate('/signin')}
          >
            Sign in instead →
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="my-boards-request">
      <img
        className="my-boards-request__vignette"
        src="/assets/bg/vignette-trio-mug-books.webp"
        alt=""
        width="96"
        height="96"
        decoding="async"
      />
      <p className="my-boards-request__eyebrow">
        <span>Find</span> my boards
      </p>
      <h1 className="my-boards-request__title">Enter your email.</h1>
      <p className="my-boards-request__body">
        We’ll email you a link to a page listing every mytimes board you’ve created.
        No password, no signup.
      </p>

      <form
        className="my-boards-request__form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FormField label="Email">
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              type="email"
              describedBy={describedBy}
              invalid={invalid}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              disabled={status === 'submitting'}
              required
            />
          )}
        </FormField>

        {error && (
          <p className="my-boards-request__error" aria-live="polite">
            {error}
          </p>
        )}

        <div className="my-boards-request__actions">
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
            disabled={status === 'submitting' || !email}
          >
            {status === 'submitting' ? 'Sending…' : 'Send me the link →'}
          </button>
        </div>
      </form>
    </section>
  );
}
