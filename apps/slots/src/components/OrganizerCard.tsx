import type { BookingEvent } from '../lib/types';

/* ─── OrganizerCard ───────────────────────────────────────
 * Compact wax-disc avatar + name + role. Rendered inside an
 * InfoPanel. Mock role for now; v2 will let organizers fill
 * a one-line bio. */

export interface OrganizerCardProps {
  event: BookingEvent;
  /** Optional one-line role/title under the name. */
  role?: string;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function OrganizerCard({
  event,
  role = 'Solutions consultant',
}: OrganizerCardProps) {
  return (
    <div className="organizer-card">
      <span className="organizer-card__avatar" aria-hidden="true">
        <span className="organizer-card__initials">{initialsOf(event.organizerName)}</span>
      </span>
      <div className="organizer-card__body">
        <span className="organizer-card__name">{event.organizerName}</span>
        <span className="organizer-card__role">{role}</span>
        <a className="organizer-card__email" href={`mailto:${event.organizerEmail}`}>
          {event.organizerEmail}
        </a>
      </div>
    </div>
  );
}
