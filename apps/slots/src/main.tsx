import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { App } from './App';
import './styles.css';
import './styles/effects.css';
import './styles/app-shell.css';
import './styles/landing.css';
import './styles/pricing.css';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </StrictMode>,
);
