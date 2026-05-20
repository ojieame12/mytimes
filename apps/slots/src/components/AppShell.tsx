import { useEffect, useState, type ReactNode } from 'react';
import { navigate } from '../lib/routing';
import { getOrganizerSession, type OrganizerSessionResponse } from '../lib/api';
import {
  prefetchAccountArea,
  prefetchAuthPage,
  prefetchBookingPage,
  prefetchCreateFlow,
} from '../lib/prefetch';

/* ─── AppShell ────────────────────────────────────────────
 * Letterpress page chrome. Provides the top bar (brand mark,
 * inline nav slot), the wrapping canvas with hatched grain
 * already on body, and the footer. View content renders in
 * the `children` slot, free to use its own grid layout. */

export interface AppShellProps {
  children: ReactNode;
  /** Pass a node to override the right-side top-bar slot
   *  (e.g. organizer actions on admin pages). */
  topBarRight?: ReactNode;
  /** When true, the canvas under the children gets the
   *  warm postmark-corner accents. Default true. */
  postmark?: boolean;
  /** Hide global mytimes footer for paid/white-label booking surfaces. */
  hideFooter?: boolean;
  /** Resolve organizer session for account-owned surfaces. */
  resolveSession?: boolean;
}

export function AppShell({
  children,
  topBarRight,
  postmark = true,
  hideFooter = false,
  resolveSession = false,
}: AppShellProps) {
  /* Session resolves async. Default to the logged-out treatment
   * and swap once the request returns — no loading flicker.   */
  const [session, setSession] = useState<OrganizerSessionResponse | undefined>(undefined);

  useEffect(() => {
    if (!resolveSession) {
      setSession(undefined);
      return;
    }
    let cancelled = false;
    getOrganizerSession()
      .then((value) => {
        if (!cancelled) setSession(value);
      })
      .catch(() => {
        /* A failed session lookup leaves us on the logged-out nav.
         * No surfacing here — surface errors at the action layer. */
      });
    return () => {
      cancelled = true;
    };
  }, [resolveSession]);

  const isAuthed = Boolean(session);

  return (
    <div className={`app-shell${postmark ? ' app-shell--postmarked' : ''}`}>
      <header className="app-bar">
        <button
          type="button"
          className="app-bar__brand"
          onClick={() => navigate('/')}
          aria-label="mytimes home"
        >
          <img
            src="/assets/brand/wordmark-dark.svg"
            alt="mytimes"
            style={{ height: '24px', width: 'auto', display: 'block' }}
          />
        </button>

        <div className="app-bar__actions">
          {topBarRight ?? (isAuthed ? <AuthedNav /> : <GuestNav />)}
        </div>
      </header>

      <main className="app-shell__main">{children}</main>

      {!hideFooter && (
        <footer className="app-footer">
          <span className="app-footer__brand">
            <img
              src="/assets/brand/wordmark-dark.svg"
              alt="mytimes"
              style={{ height: '16px', width: 'auto', display: 'block', opacity: 0.7 }}
            />
          </span>
          <span className="app-footer__rule" aria-hidden="true" />
          <span className="app-footer__year">© {new Date().getFullYear()}</span>
          <FooterRouteLink href="/privacy">Privacy</FooterRouteLink>
          <FooterRouteLink href="/terms">Terms</FooterRouteLink>
          <FooterRouteLink href="/contact">Contact</FooterRouteLink>
          <FooterRouteLink href="/my-boards/request">My boards</FooterRouteLink>
          <span className="app-footer__hairline" aria-hidden="true">·</span>
          <span className="app-footer__credit">mytimes booking boards</span>
        </footer>
      )}
    </div>
  );
}

function FooterRouteLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="app-footer__link"
      onClick={(event) => {
        event.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}

/* ─── Guest nav ───────────────────────────────────────────
 * Pricing · Demo · Sign in   [Create board →]
 * The CTA carries the only chromatic weight in the bar so
 * a scrolled visitor always has a path back to action.  */
function GuestNav() {
  return (
    <>
      <nav className="app-bar__links" aria-label="Primary">
        <button type="button" className="app-bar__link" onClick={() => navigate('/pricing')}>
          Pricing
        </button>
        <button type="button" className="app-bar__link" onClick={() => navigate('/enterprise')}>
          Enterprise
        </button>
        <button
          type="button"
          className="app-bar__link"
          onPointerEnter={prefetchAccountArea}
          onFocus={prefetchAccountArea}
          onClick={() => navigate('/my-boards/request')}
        >
          My boards
        </button>
        <button
          type="button"
          className="app-bar__link"
          onPointerEnter={prefetchBookingPage}
          onFocus={prefetchBookingPage}
          onClick={() => navigate('/b/preview')}
        >
          Demo
        </button>
        <button
          type="button"
          className="app-bar__link"
          onPointerEnter={prefetchAuthPage}
          onFocus={prefetchAuthPage}
          onClick={() => navigate('/signin')}
        >
          Sign in
        </button>
      </nav>
      <button
        type="button"
        className="app-bar__cta"
        onPointerEnter={prefetchCreateFlow}
        onFocus={prefetchCreateFlow}
        onClick={() => navigate('/new')}
      >
        Create board
        <span className="app-bar__cta-arrow" aria-hidden="true">→</span>
      </button>
    </>
  );
}

/* ─── Authed nav ──────────────────────────────────────────
 * Pricing · My boards   [Account ▾]
 * Account currently navigates straight to /account. The
 * chevron telegraphs that a menu will land here later — we
 * keep the affordance, skip the popover for now.          */
function AuthedNav() {
  return (
    <>
      <nav className="app-bar__links" aria-label="Primary">
        <button type="button" className="app-bar__link" onClick={() => navigate('/pricing')}>
          Pricing
        </button>
        <button type="button" className="app-bar__link" onClick={() => navigate('/enterprise')}>
          Enterprise
        </button>
        <button
          type="button"
          className="app-bar__link"
          onPointerEnter={prefetchAccountArea}
          onFocus={prefetchAccountArea}
          onClick={() => navigate('/my-boards')}
        >
          My boards
        </button>
      </nav>
      <button
        type="button"
        className="app-bar__account"
        onPointerEnter={prefetchAccountArea}
        onFocus={prefetchAccountArea}
        onClick={() => navigate('/account')}
        aria-haspopup="menu"
      >
        Account
        <span className="app-bar__account-chevron" aria-hidden="true">▾</span>
      </button>
    </>
  );
}
