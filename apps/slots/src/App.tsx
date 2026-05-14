import { useEffect, useState } from 'react';
import { useRoute, navigate } from './lib/routing';
import { AppShell } from './components/AppShell';
import { BookingPage } from './views/BookingPage';
import { DetailsStep } from './views/create/DetailsStep';
import { AvailabilityStep } from './views/create/AvailabilityStep';
import { ReviewStep } from './views/create/ReviewStep';
import { DoneStep } from './views/create/DoneStep';
import { ManageBookingPage } from './views/ManageBookingPage';
import { AdminDashboardPage } from './views/AdminDashboardPage';
import { RecoverAdminPage } from './views/RecoverAdminPage';
import { AccountEventsPage } from './views/AccountEventsPage';
import { AuthPage } from './views/AuthPage';
import { LandingPage } from './views/LandingPage';
import { MyBoardsPage } from './views/MyBoardsPage';
import { ForgotPasswordPage, ResetPasswordPage } from './views/PasswordResetPage';
import { PricingPage } from './views/PricingPage';
import { RequestBoardsLinkPage } from './views/RequestBoardsLinkPage';
import { ApiClientError, readPublicBoard, type ClaimSlotResponse, type PublicBoardResponse } from './lib/api';
import { MOCK_EVENT, MOCK_SLOTS } from './lib/mockData';

export function App() {
  const route = useRoute();

  if (route.type === 'booking') {
    // Demo/QA tokens render local preview boards. They are explicitly
    // read-only so public mock data never behaves like a real board.
    if (route.publicToken === 'full') {
      return (
        <AppShell>
          <BookingPage
            publicToken={route.publicToken}
            slots={MOCK_SLOTS.map((s) => ({ ...s, state: s.state === 'open' ? 'booked' : s.state }))}
          />
        </AppShell>
      );
    }
    if (route.publicToken === 'archived') {
      return (
        <AppShell>
          <BookingPage
            publicToken={route.publicToken}
            event={{ ...MOCK_EVENT, status: 'archived' }}
          />
        </AppShell>
      );
    }
    if (route.publicToken === 'preview') {
      return (
        <AppShell>
          <BookingPage publicToken={route.publicToken} demoMode />
        </AppShell>
      );
    }
    return (
      <AppShell>
        <PublicBookingRoute publicToken={route.publicToken} />
      </AppShell>
    );
  }

  // Create flow — each step manages its own CreateFlowShell wrapper.
  if (route.type === 'new-basics') return <DetailsStep />;
  if (route.type === 'new-availability') return <AvailabilityStep />;
  if (route.type === 'new-review') return <ReviewStep />;
  if (route.type === 'new-done') return <DoneStep />;

  if (route.type === 'manage') {
    return (
      <AppShell>
        <ManageBookingPage manageToken={route.manageToken} />
      </AppShell>
    );
  }

  if (route.type === 'admin') {
    return (
      <AppShell>
        <AdminDashboardPage adminToken={route.adminToken} />
      </AppShell>
    );
  }

  if (route.type === 'recover') {
    return (
      <AppShell>
        <RecoverAdminPage />
      </AppShell>
    );
  }

  if (route.type === 'pricing') {
    return (
      <AppShell>
        <PricingPage />
      </AppShell>
    );
  }

  if (route.type === 'signin') {
    return (
      <AppShell>
        <AuthPage mode="signin" />
      </AppShell>
    );
  }

  if (route.type === 'signup') {
    return (
      <AppShell>
        <AuthPage mode="signup" />
      </AppShell>
    );
  }

  if (route.type === 'forgot-password') {
    return (
      <AppShell>
        <ForgotPasswordPage />
      </AppShell>
    );
  }

  if (route.type === 'reset-password') {
    return (
      <AppShell>
        <ResetPasswordPage />
      </AppShell>
    );
  }

  if (route.type === 'account') {
    return (
      <AppShell>
        <AccountEventsPage />
      </AppShell>
    );
  }

  if (route.type === 'account-event') {
    return (
      <AppShell>
        <AdminDashboardPage accountEventId={route.eventId} />
      </AppShell>
    );
  }

  if (route.type === 'my-boards') {
    return (
      <AppShell>
        <MyBoardsPage />
      </AppShell>
    );
  }

  if (route.type === 'my-boards-request') {
    return (
      <AppShell>
        <RequestBoardsLinkPage />
      </AppShell>
    );
  }

  // Preview gallery for design QA — same route table as production
  // but with `archived` / `fully-booked` query overrides handled here.
  if (route.type === 'landing') {
    return (
      <AppShell>
        <LandingPage />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <NotFoundPage />
    </AppShell>
  );
}

function PublicBookingRoute({ publicToken }: { publicToken: string }) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; board: PublicBoardResponse }
    | { status: 'error'; message: string }
  >({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    readPublicBoard(publicToken)
      .then((board) => {
        if (!cancelled) {
          setState({ status: 'ready', board });
        }
      })
      .catch((error) => {
        const message =
          error instanceof ApiClientError
            ? error.message
            : 'Could not load this booking board.';
        if (!cancelled) setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, [publicToken]);

  if (state.status === 'loading') {
    return (
      <section className="account-shell">
        <section className="account-placeholder" aria-live="polite">
          <h1 className="account-placeholder__title">Loading booking board</h1>
          <p className="account-placeholder__body">Fetching the latest open slots.</p>
        </section>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className="account-shell">
        <section className="account-placeholder" aria-live="polite">
          <h1 className="account-placeholder__title">This link is invalid or unavailable</h1>
          <p className="account-placeholder__body">{state.message}</p>
          <div className="account-placeholder__actions">
            <button
              type="button"
              className="material-stamp-dark is-md"
              onClick={() => navigate('/')}
            >
              Go home →
            </button>
          </div>
        </section>
      </section>
    );
  }

  const onClaimed = (response: ClaimSlotResponse) => {
    setState((current) => {
      if (current.status !== 'ready') return current;
      return {
        status: 'ready',
        board: {
          ...current.board,
          slots: current.board.slots.filter((slot) => slot.id !== response.slot.id),
        },
      };
    });
  };

  /* Slot-just-taken — re-fetch after the user acknowledges the
     conflict so the next visible slot list is current. */
  const onConflict = () => {
    readPublicBoard(publicToken)
      .then((board) => {
        setState((current) =>
          current.status === 'ready' ? { status: 'ready', board } : current,
        );
      })
      .catch(() => {
        /* Swallow — the inline form already shows the conflict UI. */
      });
  };

  return (
    <BookingPage
      publicToken={publicToken}
      event={state.board.event}
      slots={state.board.slots}
      onClaimed={onClaimed}
      onConflict={onConflict}
    />
  );
}



function groupCount(slots: { startsAt: string }[]): number {
  const dates = new Set(slots.map((s) => s.startsAt.slice(0, 10)));
  return dates.size;
}

/* ─── 404 ─────────────────────────────────────────────── */

function NotFoundPage() {
  return (
    <section className="account-shell">
      <section className="account-placeholder">
        <img
          src="/assets/bg/vignette-bicycle-bag.png"
          alt=""
          style={{
            width: '140px',
            height: '140px',
            marginBottom: '8px',
            imageRendering: 'pixelated',
          }}
        />
        <h1 className="account-placeholder__title">This link has expired</h1>
        <p className="account-placeholder__body">
          If you were trying to manage an existing booking, use the link from
          your confirmation email. If you're an organizer, you can recover your
          admin link.
        </p>
        <div className="account-placeholder__actions">
          <button
            type="button"
            className="material-stamp-dark is-md"
            onClick={() => navigate('/recover')}
          >
            Recover admin link →
          </button>
          <button
            type="button"
            className="material-stamp-light is-md"
            onClick={() => navigate('/')}
          >
            Go home
          </button>
        </div>
      </section>
    </section>
  );
}
