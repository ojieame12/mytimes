import { useEffect, useMemo, useState } from 'react';
import { Calendar, Clock, X } from 'lucide-react';
import {
  ApiClientError,
  claimSlot,
  type ClaimSlotResponse,
  type EmailDeliveryResult,
} from '../lib/api';
import { participantClaimErrorMessage } from '../lib/errorMessages';
import type { BookingEvent, TimeSlot } from '../lib/types';
import { formatTimeInTz, formatTzAbbrev, formatUtcOffset, viewerTimezone } from '../lib/time';
import { FormField } from '../components/form/FormField';
import { TextInput, Textarea } from '../components/form/Inputs';
import { LinkCard } from '../components/create/LinkCard';

export interface ClaimSlotModalProps {
  publicToken: string;
  event: BookingEvent;
  slot: TimeSlot;
  onClose: () => void;
  onClaimed: (response: ClaimSlotResponse) => void;
  /** Called when the chosen slot is no longer bookable. Parent should
   *  re-fetch the public board so the user can pick a fresh slot. */
  onConflict?: () => void;
}

/* API error codes the backend returns when a slot is no longer
 * claimable. We treat all of them as "slot just got taken" so the
 * modal stays open with the user's typed details preserved. */
const CONFLICT_CODES = new Set([
  'slot_unavailable',
  'slot_taken',
  'slot_already_booked',
  'slot_not_open',
  'slot_closed',
  'conflict',
]);

export function ClaimSlotModal({
  publicToken,
  event,
  slot,
  onClose,
  onClaimed,
  onConflict,
}: ClaimSlotModalProps) {
  const [participantName, setParticipantName] = useState('');
  const [participantEmail, setParticipantEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [conflict, setConflict] = useState(false);
  const [claimed, setClaimed] = useState<ClaimSlotResponse | undefined>();

  const viewerTz = useMemo(() => viewerTimezone(), []);
  const startsAt = useMemo(() => new Date(slot.startsAt), [slot.startsAt]);
  const endsAt = useMemo(() => new Date(slot.endsAt), [slot.endsAt]);

  const localTimeRange = `${formatTimeInTz(startsAt, viewerTz)}–${formatTimeInTz(endsAt, viewerTz)}`;
  const sourceTimeRange = `${formatTimeInTz(startsAt, event.timezone)}–${formatTimeInTz(endsAt, event.timezone)}`;
  const localTzAbbr = formatTzAbbrev(startsAt, viewerTz);
  const dateLabel = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: viewerTz,
  }).format(startsAt);

  const errors = {
    participantName: participantName.trim() ? undefined : 'Add your name.',
    participantEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(participantEmail.trim())
      ? undefined
      : 'Use a valid email like name@company.com.',
  };
  const showErrors = submitAttempted;
  const hasErrors = Boolean(errors.participantName || errors.participantEmail);
  const blocked = hasErrors || submitting || conflict;

  /* Focus first field on mount + ESC to close. */
  useEffect(() => {
    const first = document.querySelector<HTMLInputElement>(
      'input[name="participantName"]',
    );
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const submit = async () => {
    setSubmitAttempted(true);
    if (hasErrors) return;
    setSubmitting(true);
    setSubmitError(undefined);
    setConflict(false);
    try {
      const response = await claimSlot(publicToken, {
        slotId: slot.id,
        participantName: participantName.trim(),
        participantEmail: participantEmail.trim(),
        participantTimezone: viewerTz,
        participantLocale: navigator.language || undefined,
        participantOffsetAtBooking: formatUtcOffset(startsAt, viewerTz),
        notes: notes.trim(),
      });
      setClaimed(response);
      onClaimed(response);
    } catch (error) {
      if (error instanceof ApiClientError && CONFLICT_CODES.has(error.code)) {
        /* Slot just got taken — keep the modal open, preserve form values,
           tell the parent to refresh so when the user picks again they
           land on a still-open slot. */
        setConflict(true);
        onConflict?.();
      } else {
        setSubmitError(
          error instanceof ApiClientError
            ? participantClaimErrorMessage(error)
            : 'Could not claim this slot. Try again, or pick another time.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="claim-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="claim-modal-title"
    >
      <div className="claim-modal__scrim" onClick={submitting ? undefined : onClose} />
      <section className="claim-modal__panel">
        <header className="claim-modal__head">
          <div className="claim-modal__head-text">
            <span className="claim-modal__eyebrow">
              <span className="claim-modal__eyebrow-dot" aria-hidden="true" />
              {claimed ? "You're booked" : 'Confirm your booking'}
            </span>
            <h2 id="claim-modal-title" className="claim-modal__title">
              {event.title}
            </h2>
          </div>
          <button
            type="button"
            className="claim-modal__close"
            onClick={onClose}
            aria-label="Close"
            disabled={submitting}
          >
            <X size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </header>

        {/* Slot summary — date, local time, source time. Always visible. */}
        <div className="claim-modal__slot">
          <div className="claim-modal__slot-row">
            <Calendar size={14} strokeWidth={1.6} aria-hidden="true" />
            <span className="claim-modal__slot-date">{dateLabel}</span>
          </div>
          <div className="claim-modal__slot-row">
            <Clock size={14} strokeWidth={1.6} aria-hidden="true" />
            <span className="claim-modal__slot-times">
              <span className="claim-modal__slot-times-primary mono tabular">
                {localTimeRange}
              </span>
              <span className="claim-modal__slot-times-tag">your time · {localTzAbbr}</span>
            </span>
          </div>
          {event.timezone !== viewerTz && (
            <div className="claim-modal__slot-row claim-modal__slot-row--secondary">
              <span className="claim-modal__slot-times">
                <span className="mono tabular">{sourceTimeRange}</span>
                <span className="claim-modal__slot-times-tag">
                  organizer · {event.timezone}
                </span>
              </span>
            </div>
          )}
        </div>

        {claimed ? (
          <SuccessState
            claimed={claimed}
            eventTitle={event.title}
            localTimeRange={localTimeRange}
            sourceTimeRange={sourceTimeRange}
            viewerTz={viewerTz}
            sourceTz={event.timezone}
            showSourceLine={event.timezone !== viewerTz}
            onClose={onClose}
          />
        ) : conflict ? (
          <ConflictState
            onClose={onClose}
            onChooseAnother={() => {
              setConflict(false);
              onClose();
            }}
          />
        ) : (
          <form
            className="claim-modal__form"
            onSubmit={(event_) => {
              event_.preventDefault();
              void submit();
            }}
            noValidate
          >
            <div className="form-row">
              <FormField
                label="Your name"
                error={showErrors ? errors.participantName : undefined}
              >
                {({ id, describedBy, invalid }) => (
                  <TextInput
                    id={id}
                    name="participantName"
                    describedBy={describedBy}
                    invalid={invalid}
                    autoComplete="name"
                    maxLength={160}
                    value={participantName}
                    onChange={(event_) => setParticipantName(event_.target.value)}
                  />
                )}
              </FormField>
              <FormField
                label="Your email"
                hint="Used for confirmation details and your private manage link."
                error={showErrors ? errors.participantEmail : undefined}
              >
                {({ id, describedBy, invalid }) => (
                  <TextInput
                    id={id}
                    name="participantEmail"
                    type="email"
                    describedBy={describedBy}
                    invalid={invalid}
                    autoComplete="email"
                    value={participantEmail}
                    onChange={(event_) => setParticipantEmail(event_.target.value)}
                  />
                )}
              </FormField>
            </div>

            <FormField
              label="Notes"
              optional
              hint="Anything the organizer should know before the meeting."
            >
              {({ id, describedBy }) => (
                <Textarea
                  id={id}
                  name="notes"
                  describedBy={describedBy}
                  maxLength={2000}
                  rows={3}
                  placeholder="Optional: context, preferences, links to share, etc."
                  value={notes}
                  onChange={(event_) => setNotes(event_.target.value)}
                />
              )}
            </FormField>

            {submitError && (
              <p className="claim-modal__error" role="alert">
                {submitError}
              </p>
            )}

            <div className="claim-modal__actions">
              <button
                type="button"
                className="material-stamp-light is-md"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="material-stamp-dark is-md"
                disabled={blocked}
                aria-disabled={blocked}
              >
                {submitting ? 'Confirming…' : 'Confirm booking'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

/* ─── ConflictState — "slot just got taken" ──────────────
 * The doc-critical defensive state. Form values are preserved
 * in parent state above. Parent refreshes the slot list. */

function ConflictState({
  onClose,
  onChooseAnother,
}: {
  onClose: () => void;
  onChooseAnother: () => void;
}) {
  return (
    <div className="claim-modal__conflict" role="alert" aria-live="assertive">
      <div className="claim-modal__conflict-badge" aria-hidden="true">!</div>
      <h3 className="claim-modal__conflict-title">That slot was just booked.</h3>
      <p className="claim-modal__conflict-body">
        Someone confirmed this time before your booking went through.
        We kept your name, email, and notes. Pick another open time and
        we'll fill them back in.
      </p>
      <div className="claim-modal__actions">
        <button type="button" className="material-stamp-light is-md" onClick={onClose}>
          Close
        </button>
        <button
          type="button"
          className="material-stamp-dark is-md"
          onClick={onChooseAnother}
        >
          Choose another time
        </button>
      </div>
    </div>
  );
}

/* ─── SuccessState — booking confirmed ─────────────────── */

function SuccessState({
  claimed,
  eventTitle,
  localTimeRange,
  sourceTimeRange,
  viewerTz,
  sourceTz,
  showSourceLine,
  onClose,
}: {
  claimed: ClaimSlotResponse;
  eventTitle: string;
  localTimeRange: string;
  sourceTimeRange: string;
  viewerTz: string;
  sourceTz: string;
  showSourceLine: boolean;
  onClose: () => void;
}) {
  const delivery = claimed.email?.participantConfirmation;

  return (
    <div className="claim-modal__success">
      <p className="claim-modal__success-body">
        You're booked for <strong>{eventTitle}</strong> at{' '}
        <strong>{localTimeRange} {viewerTz}</strong>
        {showSourceLine ? ` (${sourceTimeRange} ${sourceTz} for the organizer)` : ''}.{' '}
        {confirmationDeliveryCopy(delivery)}
      </p>
      <LinkCard
        variant="secret"
        eyebrow="MANAGE LINK · keep private"
        url={claimed.links.manage}
        openLabel="Open"
        warning="This link controls only your booking. Keep it with your confirmation details."
      />
      <div className="claim-modal__actions">
        <button type="button" className="material-stamp-dark is-md" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

function confirmationDeliveryCopy(delivery?: EmailDeliveryResult): string {
  if (!delivery) {
    return 'Keep the manage link below with your booking details.';
  }
  if (delivery.status === 'failed') {
    return 'Your booking is saved, but email delivery failed. Keep the manage link below.';
  }
  if (delivery.status === 'suppressed') {
    return 'Your booking is saved. Keep the manage link below.';
  }
  if (delivery.provider === 'console') {
    return 'Your booking is saved. Email delivery is not configured here, so keep the manage link below.';
  }
  return "We've sent a confirmation email with calendar buttons and an .ics file.";
}
