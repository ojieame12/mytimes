import type { BookingEvent } from '../lib/types';
import '../styles/event-header.css';

/* ─── EventHeader ─────────────────────────────────────────
 * Title + description + organizer + timezone disclosure.
 * Reused on the public booking page and the admin dashboard
 * (with different `variant` framing). */

export interface EventHeaderProps {
  event: BookingEvent;
  viewerTz: string;
  variant?: 'public' | 'admin';
}

export function EventHeader({
  event,
  viewerTz,
  variant = 'public',
}: EventHeaderProps) {
  const showTzNote = viewerTz !== event.timezone;
  const firstName = event.organizerName.split(' ')[0] ?? 'organizer';
  const eyebrowLabel =
    variant === 'admin'
      ? 'ADMIN · ' + firstName.toUpperCase()
      : 'POSTMARK · ' + firstName.toUpperCase();

  return (
    <header className="event-header">
      <span className="event-header__eyebrow">
        <span className="brand-dot" aria-hidden="true" />
        {eyebrowLabel}
      </span>

      <h1 className="event-header__title">{event.title}</h1>

      {event.description && (
        <p className="event-header__description">{event.description}</p>
      )}

      <p className="event-header__meta">
        <span>{event.durationMinutes} min</span>
        <span aria-hidden="true">·</span>
        <span>{event.organizerName}</span>
        <span aria-hidden="true">·</span>
        <span>{event.timezone}</span>
      </p>

      {showTzNote && (
        <p className="event-header__tz-note">
          Times below are shown in your timezone (<code>{viewerTz}</code>).
        </p>
      )}
    </header>
  );
}
