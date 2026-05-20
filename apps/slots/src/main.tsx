import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { App } from './App';
import { captureBoundaryError, initObservability } from './lib/observability';
import './styles.css';
import './styles/effects.css';
import './styles/app-shell.css';
import './styles/landing.css';
import './styles/slot-chip.css';
import './styles/slot-grid.css';
import './styles/carousel.css';
import './styles/date-dial.css';
import './styles/timezone-picker.css';
import './styles/avatar.css';
import './styles/event-header.css';
import './styles/booking-page.css';
import './styles/typography-overrides.css';

class RuntimeErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    captureBoundaryError(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="shell app-shell" role="alert">
          <h1>mytimes hit a problem.</h1>
          <p>Refresh the page. If it keeps happening, use the link from your email again.</p>
        </main>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <RuntimeErrorBoundary>
        <App />
      </RuntimeErrorBoundary>
    </HelmetProvider>
  </StrictMode>,
);

initObservability();
