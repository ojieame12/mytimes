import { useMemo, useState } from 'react';
import { FormField } from '../components/form/FormField';
import { TextInput } from '../components/form/Inputs';
import {
  ApiClientError,
  requestOrganizerPasswordReset,
  resetOrganizerPassword,
} from '../lib/api';
import { navigate } from '../lib/routing';

type SubmitState = 'idle' | 'submitting' | 'sent' | 'done';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<SubmitState>('idle');
  const [error, setError] = useState<string | undefined>();

  const submit = async () => {
    if (state === 'submitting') return;
    setState('submitting');
    setError(undefined);
    try {
      await requestOrganizerPasswordReset(email.trim());
      setState('sent');
    } catch (error_) {
      setState('idle');
      setError(error_ instanceof ApiClientError ? error_.message : 'Could not send reset link.');
    }
  };

  return (
    <section className="auth-split">
      <main className="auth-split__form">
        <form
          className="auth-split__inner"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <header className="auth-split__head">
            <img
              src="/assets/brand/wordmark-dark.svg"
              alt="mytimes"
              style={{ height: '28px', width: 'auto', marginBottom: '4px' }}
            />
            <h1 className="auth-split__title">Reset your password</h1>
            <p className="auth-split__body">
              Enter your organizer email and we'll send a private reset link if an account exists.
            </p>
          </header>

          {state === 'sent' ? (
            <p className="auth-split__body" aria-live="polite">
              If an account exists for that email, a reset link is on its way. The link expires in one hour.
            </p>
          ) : (
            <div className="auth-split__fields">
              <FormField label="Email">
                {({ id, describedBy, invalid }) => (
                  <TextInput
                    id={id}
                    type="email"
                    describedBy={describedBy}
                    invalid={invalid}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    placeholder="jane@company.com"
                    required
                  />
                )}
              </FormField>
            </div>
          )}

          {error && (
            <p className="auth-split__error" aria-live="polite">
              {error}
            </p>
          )}

          <div className="auth-split__actions">
            {state !== 'sent' && (
              <button
                type="submit"
                className="auth-split__submit"
                disabled={state === 'submitting'}
              >
                {state === 'submitting' ? 'Sending…' : 'Send reset link →'}
              </button>
            )}
            <button
              type="button"
              className="auth-split__alt"
              onClick={() => navigate('/signin')}
            >
              Back to sign in
            </button>
          </div>
        </form>
      </main>
    </section>
  );
}

export function ResetPasswordPage() {
  const token = useMemo(() => resetTokenFromURL(), []);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [state, setState] = useState<SubmitState>('idle');
  const [error, setError] = useState<string | undefined>();

  const submit = async () => {
    if (state === 'submitting') return;
    if (!token) {
      setError('This reset link is missing a token. Request a fresh link.');
      return;
    }
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setState('submitting');
    setError(undefined);
    try {
      await resetOrganizerPassword({ token, newPassword: password });
      setState('done');
    } catch (error_) {
      setState('idle');
      setError(error_ instanceof ApiClientError ? error_.message : 'Could not reset password.');
    }
  };

  return (
    <section className="auth-split">
      <main className="auth-split__form">
        <form
          className="auth-split__inner"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <header className="auth-split__head">
            <img
              src="/assets/brand/wordmark-dark.svg"
              alt="mytimes"
              style={{ height: '28px', width: 'auto', marginBottom: '4px' }}
            />
            <h1 className="auth-split__title">
              {state === 'done' ? 'Password updated' : 'Choose a new password'}
            </h1>
            <p className="auth-split__body">
              {state === 'done'
                ? 'Your password has been changed. You can now sign in with the new password.'
                : 'Use the private reset link from your email to update your organizer account password.'}
            </p>
          </header>

          {state !== 'done' && (
            <div className="auth-split__fields">
              <FormField
                label="New password"
                hint="Use at least 8 characters."
              >
                {({ id, describedBy, invalid }) => (
                  <TextInput
                    id={id}
                    type="password"
                    describedBy={describedBy}
                    invalid={invalid}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                )}
              </FormField>

              <FormField label="Confirm password">
                {({ id, describedBy, invalid }) => (
                  <TextInput
                    id={id}
                    type="password"
                    describedBy={describedBy}
                    invalid={invalid}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                )}
              </FormField>
            </div>
          )}

          {error && (
            <p className="auth-split__error" aria-live="polite">
              {error}
            </p>
          )}

          <div className="auth-split__actions">
            {state !== 'done' && (
              <button
                type="submit"
                className="auth-split__submit"
                disabled={state === 'submitting'}
              >
                {state === 'submitting' ? 'Updating…' : 'Update password →'}
              </button>
            )}
            <button
              type="button"
              className="auth-split__alt"
              onClick={() => navigate(state === 'done' ? '/signin' : '/forgot-password')}
            >
              {state === 'done' ? 'Sign in' : 'Request a fresh link'}
            </button>
          </div>
        </form>
      </main>
    </section>
  );
}

function resetTokenFromURL(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('token') ?? '';
}
