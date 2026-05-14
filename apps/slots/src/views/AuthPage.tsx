import { useEffect, useState } from 'react';
import { FormField } from '../components/form/FormField';
import { TextInput } from '../components/form/Inputs';
import {
  ApiClientError,
  getOrganizerSession,
  signInOrganizer,
  signUpOrganizer,
} from '../lib/api';
import { navigate } from '../lib/routing';

type AuthMode = 'signin' | 'signup';

/* ─── AuthPage ────────────────────────────────────────────
 * Two-column. Left half is a full-bleed pixel-art landscape
 * (sunset cabin for signin, meadow picnic for signup) with
 * brand title overlay. Right half holds the form on a calm
 * surface. The image carries the mood; the form carries the
 * job. Anti-AI-slop direction. */

export function AuthPage({ mode }: { mode: AuthMode }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    getOrganizerSession()
      .then((session) => {
        if (!cancelled && session) {
          navigate('/account');
        }
      })
      .catch(() => {
        /* Keep the auth form usable if session lookup fails. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      if (mode === 'signup') {
        await signUpOrganizer({ name: name.trim(), email: email.trim(), password });
      } else {
        await signInOrganizer({ email: email.trim(), password });
      }
      navigate('/account');
    } catch (error_) {
      setError(error_ instanceof ApiClientError ? error_.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  const isSignUp = mode === 'signup';
  const bgImage = isSignUp
    ? '/assets/bg/landscape-meadow-picnic.png'
    : '/assets/bg/landscape-sunset-cabin.png';

  return (
    <section className="auth-split" data-mode={mode}>
      {/* Centered account form */}
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
              {isSignUp ? 'Create your account' : 'Welcome back'}
            </h1>
            <p className="auth-split__body">
              {isSignUp
                ? 'Sign up to start organizing your interviews.'
                : 'Enter your details to access your boards.'}
            </p>
          </header>

          <div className="auth-split__fields">
            {isSignUp && (
              <FormField label="Your name">
                {({ id, describedBy, invalid }) => (
                  <TextInput
                    id={id}
                    describedBy={describedBy}
                    invalid={invalid}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    maxLength={160}
                    placeholder="Jane Doe"
                    required
                  />
                )}
              </FormField>
            )}

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

            <FormField label="Password">
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  type="password"
                  describedBy={describedBy}
                  invalid={invalid}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  minLength={8}
                  placeholder={isSignUp ? 'At least 8 characters' : 'Your password'}
                  required
                />
              )}
            </FormField>
          </div>

          {error && (
            <p className="auth-split__error" aria-live="polite">
              {error}
            </p>
          )}

          <div className="auth-split__actions">
            <button
              type="submit"
              className="auth-split__submit"
              disabled={busy}
            >
              {busy ? 'Working…' : isSignUp ? 'Create account →' : 'Sign in →'}
            </button>
            <button
              type="button"
              className="auth-split__alt"
              onClick={() => navigate(isSignUp ? '/signin' : '/signup')}
            >
              {isSignUp ? 'I already have an account' : 'Create a new account'}
            </button>
          </div>

          {!isSignUp && (
            <p className="auth-split__recover">
              Lost an admin link?{' '}
              <button
                type="button"
                className="auth-split__recover-link"
                onClick={() => navigate('/recover')}
              >
                Recover it →
              </button>
            </p>
          )}
        </form>
      </main>
    </section>
  );
}
