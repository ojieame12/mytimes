import { useState, useMemo } from 'react';
import { generateAvailabilitySlots } from '@fresh-feel/slotboard-core/dist/slots.js';
import type { AvailabilityInput, GeneratedSlot } from '@fresh-feel/slotboard-core/dist/types.js';
import { CreateFlowShell } from '../../components/create/CreateFlowShell';
import { SlotPreviewSummary } from '../../components/create/SlotPreviewSummary';
import { FormField } from '../../components/form/FormField';
import { DateInput, TimeInput } from '../../components/form/Inputs';
import { ChipGroup } from '../../components/form/ChipGroup';
import { WeekdayToggle } from '../../components/form/WeekdayToggle';
import { BlockedRangesField } from '../../components/form/BlockedRangesField';
import {
  LimitBanner,
  LimitIndicator,
  PLAN_LIMITS,
  UpgradePrompt,
} from '../../components/paywall';
import { navigate } from '../../lib/routing';
import {
  ALLOWED_INTERVALS,
  useWizardDraft,
  validateAvailability,
  validateDetails,
} from '../../lib/wizard';

/* ─── Step 2 — /new/availability ───────────────────────
 * Date range, weekday toggle, daily window, optional
 * breaks. Live slot preview on the right rail. If the
 * user lands here without finishing step 1, bounce them
 * back. */

export function AvailabilityStep() {
  const { draft, update } = useWizardDraft();
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  /* If they skipped step 1, redirect back. */
  const detailsErrors = useMemo(() => validateDetails(draft), [draft]);
  if (Object.keys(detailsErrors).length > 0 && draft.title.trim().length === 0) {
    /* First visit — let them stay on this step; we'll only enforce on Next. */
  }

  const errors = useMemo(() => validateAvailability(draft), [draft]);
  const showErrors = submitAttempted;
  const err = (k: string): string | undefined => (showErrors ? errors[k] : undefined);

  const baseAvailabilityInput = useMemo<AvailabilityInput>(
    () => ({
      startDate: draft.startDate as `${number}-${number}-${number}`,
      endDate: draft.endDate as `${number}-${number}-${number}`,
      weekdays: draft.weekdays,
      dailyStart: draft.dailyStart as `${number}:${number}`,
      dailyEnd: draft.dailyEnd as `${number}:${number}`,
      durationMinutes: draft.durationMinutes,
      intervalMinutes: draft.intervalMinutes,
      timezone: draft.timezone,
      blockedRanges: draft.blockedRanges.map((r) => ({
        start: r.start as `${number}:${number}`,
        end: r.end as `${number}:${number}`,
      })),
    }),
    [draft],
  );

  const availabilityInput = useMemo<AvailabilityInput>(
    () => ({
      ...baseAvailabilityInput,
      excludedSlotStarts: draft.excludedSlotStarts,
    }),
    [baseAvailabilityInput, draft.excludedSlotStarts],
  );

  const viewerTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? draft.timezone;
    } catch {
      return draft.timezone;
    }
  }, [draft.timezone]);

  const baseSlots = useMemo(() => {
    try {
      return generateAvailabilitySlots(baseAvailabilityInput);
    } catch {
      return [];
    }
  }, [baseAvailabilityInput]);

  const generatedSlotCount = useMemo(() => {
    try {
      return generateAvailabilitySlots(availabilityInput).length;
    } catch {
      return 0;
    }
  }, [availabilityInput]);

  const exceedsFreeSlots = generatedSlotCount > PLAN_LIMITS.free.slots;

  const toggleExcludedSlot = (startsAt: string) => {
    const excluded = new Set(draft.excludedSlotStarts);
    if (excluded.has(startsAt)) {
      excluded.delete(startsAt);
    } else {
      excluded.add(startsAt);
    }
    update({ excludedSlotStarts: Array.from(excluded).sort() });
  };

  const restoreRemovedSlots = () => {
    update({ excludedSlotStarts: [] });
  };

  const onNext = () => {
    setSubmitAttempted(true);
    if (Object.keys(errors).length > 0) return;
    if (exceedsFreeSlots) {
      setUpgradeOpen(true);
      return;
    }
    navigate('/new/review');
  };

  return (
    <CreateFlowShell
      step="availability"
      eyebrow="AVAILABILITY"
      title="When are you available?"
      body="Set a date range, pick the days that work, and define a daily window. We'll generate slots automatically."
    >
      <div className="availability-layout">
        <form
          className="create-step"
          onSubmit={(e) => {
            e.preventDefault();
            onNext();
          }}
          noValidate
        >
          <section className="create-step__section">
            <header className="create-step__section-head">
              <h2 className="create-step__section-title">Date range</h2>
              <span className="create-step__section-meta create-step__section-meta--limits">
                <span>Free slots</span>
                <LimitIndicator
                  count={generatedSlotCount}
                  max={PLAN_LIMITS.free.slots}
                  unit="slots"
                />
              </span>
            </header>
            <div className="form-row">
              <FormField label="Start date" error={err('startDate')}>
                {({ id, describedBy, invalid }) => (
                  <DateInput
                    id={id}
                    name="startDate"
                    describedBy={describedBy}
                    invalid={invalid}
                    value={draft.startDate}
                    onChange={(e) => update({ startDate: e.target.value })}
                  />
                )}
              </FormField>
              <FormField label="End date" error={err('endDate')}>
                {({ id, describedBy, invalid }) => (
                  <DateInput
                    id={id}
                    name="endDate"
                    describedBy={describedBy}
                    invalid={invalid}
                    value={draft.endDate}
                    min={draft.startDate}
                    onChange={(e) => update({ endDate: e.target.value })}
                  />
                )}
              </FormField>
            </div>
          </section>

          <section className="create-step__section">
            <header className="create-step__section-head">
              <h2 className="create-step__section-title">Days of the week</h2>
              <span className="create-step__section-meta">Tap to toggle</span>
            </header>
            <FormField label="Available days" error={err('weekdays')}>
              {() => (
                <WeekdayToggle
                  value={draft.weekdays}
                  onChange={(v) => update({ weekdays: v })}
                />
              )}
            </FormField>
          </section>

          <section className="create-step__section">
            <header className="create-step__section-head">
              <h2 className="create-step__section-title">Daily window</h2>
              <span className="create-step__section-meta">
                In {draft.timezone}
              </span>
            </header>
            <div className="form-row">
              <FormField label="From" error={err('dailyStart')}>
                {({ id, describedBy, invalid }) => (
                  <TimeInput
                    id={id}
                    name="dailyStart"
                    describedBy={describedBy}
                    invalid={invalid}
                    value={draft.dailyStart}
                    onChange={(e) => update({ dailyStart: e.target.value })}
                  />
                )}
              </FormField>
              <FormField label="To" error={err('dailyEnd')}>
                {({ id, describedBy, invalid }) => (
                  <TimeInput
                    id={id}
                    name="dailyEnd"
                    describedBy={describedBy}
                    invalid={invalid}
                    value={draft.dailyEnd}
                    onChange={(e) => update({ dailyEnd: e.target.value })}
                  />
                )}
              </FormField>
            </div>
          </section>

          <section className="create-step__section">
            <header className="create-step__section-head">
              <h2 className="create-step__section-title">Start cadence</h2>
              <span className="create-step__section-meta">
                {draft.intervalMinutes < draft.durationMinutes
                  ? 'Overlaps are blocked after booking'
                  : 'Non-overlapping starts'}
              </span>
            </header>
            <FormField
              label="Starts every"
              hint="Use 30 minutes for the spreadsheet-style 60-minute slots that start on the half hour."
              error={err('intervalMinutes')}
            >
              {() => (
                <ChipGroup
                  ariaLabel="Slot start cadence in minutes"
                  value={draft.intervalMinutes}
                  onChange={(v) => update({ intervalMinutes: v })}
                  options={ALLOWED_INTERVALS.map((m) => ({
                    value: m,
                    primary: String(m),
                    secondary: 'MIN',
                  }))}
                />
              )}
            </FormField>
          </section>

          <section className="create-step__section">
            <header className="create-step__section-head">
              <h2 className="create-step__section-title">Breaks</h2>
              <span className="create-step__section-meta">Optional carve-outs</span>
            </header>
            <FormField
              label="Time ranges to skip each day"
              optional
              hint="E.g. block 12:00–13:00 for lunch. We won't generate slots that overlap a break."
            >
              {() => (
                <BlockedRangesField
                  value={draft.blockedRanges}
                  onChange={(v) => update({ blockedRanges: v })}
                  errors={showErrors ? errors : {}}
                />
              )}
            </FormField>
          </section>
        </form>

        <aside className="create-step__preview-rail" aria-label="Slot preview">
          {exceedsFreeSlots && (
            <LimitBanner
              count={generatedSlotCount}
              max={PLAN_LIMITS.free.slots}
              unit="slots"
              onUpgrade={() => setUpgradeOpen(true)}
            />
          )}
          <SlotPreviewSummary input={availabilityInput} viewerTimezone={viewerTz} />
          <SlotExceptionEditor
            slots={baseSlots}
            excludedSlotStarts={draft.excludedSlotStarts}
            timezone={draft.timezone}
            onToggle={toggleExcludedSlot}
            onRestoreAll={restoreRemovedSlots}
          />
        </aside>
      </div>

      {upgradeOpen && (
        <UpgradePrompt
          title={
            <>
              This setup creates{' '}
              <span className="mono">{generatedSlotCount}</span> slots.
            </>
          }
          body={
            <>
              Free boards include {PLAN_LIMITS.free.slots} generated slots. You
              can reduce the range now, or continue to review and unlock this
              specific board from its admin link after posting.
            </>
          }
          current={generatedSlotCount}
          max={PLAN_LIMITS.free.slots}
          unit="slots"
          primaryLabel="Continue to review"
          primaryPrice="$19 later"
          secondaryLabel="Open pricing"
          onPrimary={() => {
            setUpgradeOpen(false);
            navigate('/new/review');
          }}
          onClose={() => setUpgradeOpen(false)}
          onSecondary={() => navigate('/pricing')}
        />
      )}

      <div className="create-step__nav">
        <button
          type="button"
          className="create-step__nav-back"
          onClick={() => navigate('/new')}
        >
          ← Back
        </button>
        <span
          className={`create-step__nav-summary${showErrors && Object.keys(errors).length > 0 ? ' is-error' : ''}`}
        >
          {showErrors && Object.keys(errors).length > 0
            ? `Please fix ${Object.keys(errors).length} field${Object.keys(errors).length === 1 ? '' : 's'} above before continuing.`
            : <>Step <span className="mono">2</span> of <span className="mono">4</span> · Availability</>}
        </span>
        <button type="button" className="create-step__nav-next" onClick={onNext}>
          Next: review →
        </button>
      </div>
    </CreateFlowShell>
  );
}

interface SlotExceptionEditorProps {
  slots: GeneratedSlot[];
  excludedSlotStarts: string[];
  timezone: string;
  onToggle: (startsAt: string) => void;
  onRestoreAll: () => void;
}

function SlotExceptionEditor({
  slots,
  excludedSlotStarts,
  timezone,
  onToggle,
  onRestoreAll,
}: SlotExceptionEditorProps) {
  const excluded = new Set(excludedSlotStarts);
  const dayGroups = groupBySourceDate(slots);

  return (
    <section className="slot-exceptions material-panel-mini" aria-label="Manual slot edits">
      <header className="slot-exceptions__head">
        <div>
          <span className="slot-preview__eyebrow">Manual edits</span>
          <h3>Remove one-off starts</h3>
        </div>
        {excludedSlotStarts.length > 0 && (
          <button type="button" className="slot-exceptions__restore" onClick={onRestoreAll}>
            Restore all
          </button>
        )}
      </header>

      <p className="slot-exceptions__copy">
        Use this for exceptions after the rules have generated the grid. Removed starts stay out of the booking link.
      </p>

      {slots.length === 0 ? (
        <p className="slot-exceptions__empty">No generated starts to edit yet.</p>
      ) : (
        <div className="slot-exceptions__days">
          {dayGroups.map((group) => (
            <div className="slot-exceptions__day" key={group.sourceDate}>
              <h4>{formatSourceDate(group.sourceDate, timezone)}</h4>
              <div className="slot-exceptions__chips">
                {group.slots.map((slot) => {
                  const removed = excluded.has(slot.startsAt);
                  return (
                    <button
                      type="button"
                      key={slot.startsAt}
                      className={`slot-exceptions__chip${removed ? ' is-removed' : ''}`}
                      aria-pressed={removed}
                      onClick={() => onToggle(slot.startsAt)}
                    >
                      <span>{slot.sourceStartTime}</span>
                      {removed && <small>Removed</small>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function groupBySourceDate(slots: GeneratedSlot[]): Array<{ sourceDate: string; slots: GeneratedSlot[] }> {
  const groups = new Map<string, GeneratedSlot[]>();
  for (const slot of slots) {
    const existing = groups.get(slot.sourceDate) ?? [];
    existing.push(slot);
    groups.set(slot.sourceDate, existing);
  }
  return Array.from(groups, ([sourceDate, groupSlots]) => ({ sourceDate, slots: groupSlots }));
}

function formatSourceDate(sourceDate: string, _timezone: string): string {
  try {
    const [year, month, day] = sourceDate.split('-').map(Number);
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  } catch {
    return sourceDate;
  }
}
