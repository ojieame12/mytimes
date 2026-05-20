import { useMemo } from 'react';
import type { TimeSlot } from '../lib/types';
import { groupSlotsByDay } from '../lib/time';
import { DayGroupHeader } from './DayGroupHeader';
import { SlotChip } from './SlotChip';
import '../styles/slot-grid.css';

/* ─── SlotGrid ────────────────────────────────────────────
 * Composes SlotChips into day buckets. Two modes:
 *
 *   public  hides booked + closed slots entirely. Fully-booked
 *           days collapse to "ALL SLOTS BOOKED" line.
 *   admin   renders every slot with its state-coloured chip
 *           plus initials/bounce metadata when present. */

export interface SlotGridProps {
  slots: TimeSlot[];
  viewerTz: string;
  sourceTz: string;
  mode?: 'public' | 'admin';
  onSlotClick?: (slot: TimeSlot) => void;
  /** When true (admin filter), include cancelled slots in the grid. */
  includeCancelled?: boolean;
}

export function SlotGrid({
  slots,
  viewerTz,
  sourceTz,
  mode = 'public',
  onSlotClick,
  includeCancelled = false,
}: SlotGridProps) {
  const groups = useMemo(() => groupSlotsByDay(slots, viewerTz), [slots, viewerTz]);

  return (
    <div className="slot-grid">
      {groups.map((group) => {
        const totalCount = group.slots.length;
        const visibleSlots =
          mode === 'public'
            ? group.slots.filter((s) => s.state === 'open')
            : group.slots.filter(
                (s) => includeCancelled || s.state !== 'cancelled',
              );
        const openCount = group.slots.filter((s) => s.state === 'open').length;
        const fullyBooked = mode === 'public' && openCount === 0 && totalCount > 0;

        return (
          <section key={group.dateKey} className="slot-grid__day">
            <DayGroupHeader
              date={group.date}
              viewerTz={viewerTz}
              openCount={openCount}
              totalCount={totalCount}
              mode={mode}
            />
            {fullyBooked ? null /* count chip already says ALL SLOTS BOOKED */ : (
              <div className="slot-grid__chips">
                {visibleSlots.map((slot) => (
                  <SlotChip
                    key={slot.id}
                    startsAt={new Date(slot.startsAt)}
                    state={slot.state}
                    viewerTz={viewerTz}
                    sourceTz={sourceTz}
                    mode={mode}
                    initials={slot.bookedInitials}
                    emailBounced={slot.emailBounced}
                    onClick={onSlotClick ? () => onSlotClick(slot) : undefined}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
