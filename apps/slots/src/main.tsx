import { StrictMode } from 'react';
import * as Sentry from '@sentry/react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { App } from './App';
import { initObservability } from './lib/observability';
import './styles.css';
import './styles/effects.css';
import './styles/app-shell.css';
import './styles/landing.css';
import './styles/pricing.css';
import './styles/legal.css';
import './styles/my-boards.css';
import './styles/checkout-return.css';
import './styles/manage-booking.css';
import './styles/info-panel.css';
import './styles/slot-chip.css';
import './styles/slot-grid.css';
import './styles/carousel.css';
import './styles/date-dial.css';
import './styles/timezone-picker.css';
import './styles/avatar.css';
import './styles/event-header.css';
import './styles/booking-page.css';
import './styles/account.css';
import './styles/form.css';
import './styles/create-flow.css';
import './styles/management.css';
import './styles/typography-overrides.css';

initObservability();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <Sentry.ErrorBoundary
        fallback={
          <main className="shell app-shell" role="alert">
            <h1>mytimes hit a problem.</h1>
            <p>Refresh the page. If it keeps happening, use the link from your email again.</p>
          </main>
        }
      >
        <App />
      </Sentry.ErrorBoundary>
    </HelmetProvider>
  </StrictMode>,
);
