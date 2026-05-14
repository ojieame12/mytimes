import { useMemo } from 'react';
import { generateAvailabilitySlots } from '@fresh-feel/slotboard-core/dist/slots.js';
import type { AvailabilityInput, GeneratedSlot } from '@fresh-feel/slotboard-core/dist/types.js';

/* ─── SlotPreviewSummary ─────────────────────────────
 * Lives in the right-rail of the availability step.
 * Calls generateAvailabilitySlots live with the current
 * draft and renders: count plates (slots / days / per day)
 * + a preview of the first day's chips. If generation
 * throws (bad config), shows the error inline. */

export interface SlotPreviewSummaryProps {
  input: AvailabilityInput;
  viewerTimezone: string;
  /** Limit how many chips we render for the day-1 preview. */
  maxChips?: number;
}

export function SlotPreviewSummary({
  input,
  viewerTimezone,
  maxChips = 12,
}: SlotPreviewSummaryProps) {
  const result = useMemo(() => {
    try {
      const slots = generateAvailabilitySlots(input);
      return { ok: true as const, slots };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : 'Invalid availability' };
    }
  }, [input]);

  if (!result.ok) {
    return (
      <section className="slot-preview material-panel-mini" aria-live="polite">
        <span className="slot-preview__eyebrow">PREVIEW</span>
        <p className="slot-preview__error">Can't generate yet. {result.error}</p>
      </section>
    );
  }

  const { slots } = result;
  const uniqueDays = countUniqueDays(slots);
  const perDay = slots.length === 0 || uniqueDays === 0 ? 0 : Math.round(slots.length / uniqueDays);
  const firstDaySlots = filterFirstDay(slots);

  return (
    <section className="slot-preview material-panel-mini" aria-live="polite">
      <span className="slot-preview__eyebrow">Live preview</span>

      <div className="slot-preview__counts">
        <div className="slot-preview__count slot-preview__count--accent">
          <span className="slot-preview__count-num">{String(slots.length).padStart(2, '0')}</span>
          <span className="slot-preview__count-label">Slots</span>
        </div>
        <div className="slot-preview__count">
          <span className="slot-preview__count-num">{String(uniqueDays).padStart(2, '0')}</span>
          <span className="slot-preview__count-label">Days</span>
        </div>
        <div className="slot-preview__count">
          <span className="slot-preview__count-num">~{perDay}</span>
          <span className="slot-preview__count-label">Per day</span>
        </div>
      </div>

      {slots.length > 0 && (
        <p className="slot-preview__capacity">
          Enough for up to <strong>{slots.length} participant{slots.length === 1 ? '' : 's'}</strong>{' '}
          to book one slot each.
        </p>
      )}

      {slots.length === 0 ? (
        <p className="slot-preview__empty">
          No slots generated yet. Pick days, set a daily window, and we'll show them here.
        </p>
      ) : (
        <>
          <h4 className="slot-preview__day-title">
            First day · {formatDayHeading(slots[0], viewerTimezone)}
          </h4>
          <div className="slot-preview__chips">
            {firstDaySlots.slice(0, maxChips).map((slot) => (
              <span key={slot.startsAt} className="slot-preview__chip">
                {formatTime(slot.startsAt, viewerTimezone)}
              </span>
            ))}
          </div>
          {firstDaySlots.length > maxChips && (
            <p className="slot-preview__chips-overflow">
              +{firstDaySlots.length - maxChips} more on this day
            </p>
          )}
        </>
      )}
    </section>
  );
}

function countUniqueDays(slots: GeneratedSlot[]): number {
  const days = new Set<string>();
  for (const s of slots) days.add(s.sourceDate);
  return days.size;
}

function filterFirstDay(slots: GeneratedSlot[]): GeneratedSlot[] {
  if (slots.length === 0) return [];
  const firstDate = slots[0].sourceDate;
  return slots.filter((s) => s.sourceDate === firstDate);
}

function formatTime(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone,
    }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

function formatDayHeading(slot: GeneratedSlot, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      timeZone: timezone,
    }).format(new Date(slot.startsAt));
  } catch {
    return slot.sourceDate;
  }
}
