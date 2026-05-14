import { Avatar } from './Avatar';
import type { BookingEvent } from '../lib/types';

/* ─── BookingCompact ──────────────────────────────────────
 * Slim sticky bar that fades in once the full BookingHeaderCard
 * scrolls out of view. Acts as a presence indicator — you
 * always know whose calendar you're looking at and how many
 * slots remain, even as you scroll deep into the day list.
 *
 * Visual: peach surface with backdrop blur so day-rows visibly
 * scroll underneath. Position is `fixed; top: 0` and width
 * matches the page content max-width. */

export interface BookingCompactProps {
  event: BookingEvent;
  openSlotCount: number;
  visible: boolean;
}

export function BookingCompact({
  event,
  openSlotCount,
  visible,
}: BookingCompactProps) {
  return (
    <div
      className={`booking-compact${visible ? ' is-visible' : ''}`}
      aria-hidden={!visible}
    >
      <div className="booking-compact__inner">
        <Avatar
          seed={event.organizerEmail}
          style={event.avatarStyle ?? 'notionists'}
          size={28}
        />
        <span className="booking-compact__title">{event.title}</span>
        <span className="booking-compact__dot" aria-hidden="true">·</span>
        <span className="booking-compact__count">
          <span className="mono tabular">{openSlotCount}</span> open
        </span>
      </div>
    </div>
  );
}
