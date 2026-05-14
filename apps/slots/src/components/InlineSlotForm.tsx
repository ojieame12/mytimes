import { useEffect, useMemo, useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import {
  ApiClientError,
  claimSlot,
  type ClaimSlotResponse,
  type EmailDeliveryResult,
} from '../lib/api';
import { participantClaimErrorMessage } from '../lib/errorMessages';
import type { TimeSlot } from '../lib/types';
import { formatTimeInTz, formatTzAbbrev, formatUtcOffset } from '../lib/time';
import { FormField } from './form/FormField';
import { TextInput, Textarea } from './form/Inputs';
import { LinkCard } from './create/LinkCard';

/* ─── InlineSlotForm ──────────────────────────────────
 * Mounts INSIDE an inverted (dark) day band when a slot
 * is selected. Replaces the modal flow entirely — the slot
 * doesn't navigate, it morphs into the booking experience.
 *
 * Three states it can be in:
 *   • form     — collecting name/email/notes
 *   • conflict — slot was taken between click and submit
 *   • claimed  — booking confirmed, shows manage link
 *
 * The dark-band styling is on the parent .day-band.is-selected;
 * this component is content-only (no chrome of its own). */

const CONFLICT_CODES = new Set([
  'slot_unavailable',
  'slot_taken',
  'slot_already_booked',
  'slot_not_open',
  'slot_closed',
  'conflict',
]);

export interface InlineSlotFormProps {
  publicToken: string;
  slot: TimeSlot;
  sourceTz: string;
  viewerTz: string;
  organizerTitle: string;
  meetingDurationMinutes: number;
  draft?: InlineSlotFormDraft;
  onDraftChange?: (draft: InlineSlotFormDraft) => void;
  onClose: () => void;
  onClaimed?: (response: ClaimSlotResponse) => void;
  onConflict?: () => void;
  demoMode?: boolean;
}

export type InlineSlotFormDraft = {
  participantName: string;
  participantEmail: string;
  notes: string;
  showNotes: boolean;
};

export const EMPTY_INLINE_SLOT_FORM_DRAFT: InlineSlotFormDraft = {
  participantName: '',
  participantEmail: '',
  notes: '',
  showNotes: false,
};

export function InlineSlotForm({
  publicToken,
  slot,
  sourceTz,
  viewerTz,
  organizerTitle,
  meetingDurationMinutes,
  draft = EMPTY_INLINE_SLOT_FORM_DRAFT,
  onDraftChange,
  onClose,
  onClaimed,
  onConflict,
  demoMode = false,
}: InlineSlotFormProps) {
  const [participantName, setParticipantName] = useState(draft.participantName);
  const [participantEmail, setParticipantEmail] = useState(draft.participantEmail);
  const [notes, setNotes] = useState(draft.notes);
  const [showNotes, setShowNotes] = useState(draft.showNotes || Boolean(draft.notes));
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [conflict, setConflict] = useState(false);
  const [claimed, setClaimed] = useState<ClaimSlotResponse | undefined>();

  const startsAt = useMemo(() => new Date(slot.startsAt), [slot.startsAt]);
  const endsAt = useMemo(() => new Date(slot.endsAt), [slot.endsAt]);
  const localTimeRange = `${formatTimeInTz(startsAt, viewerTz)}–${formatTimeInTz(endsAt, viewerTz)}`;
  const sourceTimeRange = `${formatTimeInTz(startsAt, sourceTz)}–${formatTimeInTz(endsAt, sourceTz)}`;
  const localTzAbbr = formatTzAbbrev(startsAt, viewerTz);
  const showSourceLine = viewerTz !== sourceTz;

  const errors = {
    participantName: participantName.trim() ? undefined : 'Add your name.',
    participantEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(participantEmail.trim())
      ? undefined
      : 'Use a valid email like name@company.com.',
  };
  const hasErrors = Boolean(errors.participantName || errors.participantEmail);

  const updateDraft = (patch: Partial<InlineSlotFormDraft>) => {
    onDraftChange?.({
      participantName,
      participantEmail,
      notes,
      showNotes,
      ...patch,
    });
  };

  /* Focus first field when the form mounts inside the band. */
  useEffect(() => {
    const first = document.querySelector<HTMLInputElement>(
      '.day-band.is-selected input[name="participantName"]',
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
    if (demoMode) {
      setSubmitError('This is a demo board. Create your own board to accept real bookings.');
      return;
    }
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
      onDraftChange?.(EMPTY_INLINE_SLOT_FORM_DRAFT);
      onClaimed?.(response);
    } catch (error) {
      if (error instanceof ApiClientError && CONFLICT_CODES.has(error.code)) {
        setConflict(true);
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
    <div className="inline-slot-form" role="region" aria-label="Booking form">
      <header className="inline-slot-form__head">
        <span className="inline-slot-form__eyebrow">Booking</span>
        <div className="inline-slot-form__time-block">
          <span className="inline-slot-form__time mono tabular">{localTimeRange}</span>
          <span className="inline-slot-form__time-tag">
            your time · {localTzAbbr} · {meetingDurationMinutes} min
          </span>
        </div>
        {showSourceLine && (
          <span className="inline-slot-form__source mono">
            {sourceTimeRange}
          </span>
        )}
        {/* Notes toggle lives where Close used to be. The band itself
            is closed by clicking another row or anywhere outside. */}
        {!claimed && !conflict && !showNotes && (
          <button
            type="button"
            className="inline-slot-form__notes-toggle"
            onClick={() => {
              setShowNotes(true);
              updateDraft({ showNotes: true });
            }}
            disabled={submitting}
          >
            <MessageSquarePlus size={14} strokeWidth={1.6} aria-hidden="true" />
            <span>Add a note</span>
          </button>
        )}
      </header>

      {claimed ? (
        <SuccessState
          claimed={claimed}
          eventTitle={organizerTitle}
          localTimeRange={localTimeRange}
          sourceTimeRange={sourceTimeRange}
          viewerTz={viewerTz}
          sourceTz={sourceTz}
          showSourceLine={showSourceLine}
          onDone={onClose}
        />
      ) : conflict ? (
        <ConflictState
          onChooseAnother={() => {
            onConflict?.();
            onClose();
          }}
        />
      ) : (
        <form
          className="inline-slot-form__form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          noValidate
        >
          <div className="form-row">
            <FormField
              label="Your name"
              error={submitAttempted ? errors.participantName : undefined}
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
                  onChange={(e) => {
                    setParticipantName(e.target.value);
                    updateDraft({ participantName: e.target.value });
                  }}
                />
              )}
            </FormField>
            <FormField
              label="Your email"
              hint="Used for confirmation details and your private manage link."
              error={submitAttempted ? errors.participantEmail : undefined}
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
                  onChange={(e) => {
                    setParticipantEmail(e.target.value);
                    updateDraft({ participantEmail: e.target.value });
                  }}
                />
              )}
            </FormField>
          </div>

          {/* Notes — expands below name/email when the header toggle
              is clicked. Hidden by default to keep the form compact. */}
          {showNotes && (
            <FormField label="Notes" optional>
              {({ id, describedBy }) => (
                <Textarea
                  id={id}
                  name="notes"
                  describedBy={describedBy}
                  maxLength={2000}
                  rows={2}
                  placeholder="Anything the organizer should know."
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    updateDraft({ notes: e.target.value, showNotes: true });
                  }}
                  autoFocus
                />
              )}
            </FormField>
          )}

          {submitError && (
            <p className="inline-slot-form__error" role="alert">
              {submitError}
            </p>
          )}

          <div className="inline-slot-form__actions">
            <button
              type="button"
              className="inline-slot-form__cancel"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-slot-form__submit"
              disabled={submitting}
            >
              {demoMode
                ? 'Preview only'
                : submitting
                  ? 'Confirming…'
                  : `Book ${localTimeRange.split('–')[0]} →`}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ─── ConflictState ─── */
function ConflictState({ onChooseAnother }: { onChooseAnother: () => void }) {
  return (
    <div className="inline-slot-form__conflict" role="alert" aria-live="assertive">
      <h4 className="inline-slot-form__conflict-title">That slot was just booked.</h4>
      <p className="inline-slot-form__conflict-body">
        Someone confirmed this time before your booking went through. We kept your
        name, email, and notes. Pick another open time and we'll fill them back in.
      </p>
      <div className="inline-slot-form__actions">
        <button
          type="button"
          className="inline-slot-form__submit"
          onClick={onChooseAnother}
        >
          Choose another time
        </button>
      </div>
    </div>
  );
}

/* ─── SuccessState ─── */
function SuccessState({
  claimed,
  eventTitle,
  localTimeRange,
  sourceTimeRange,
  viewerTz,
  sourceTz,
  showSourceLine,
  onDone,
}: {
  claimed: ClaimSlotResponse;
  eventTitle: string;
  localTimeRange: string;
  sourceTimeRange: string;
  viewerTz: string;
  sourceTz: string;
  showSourceLine: boolean;
  onDone: () => void;
}) {
  const delivery = claimed.email?.participantConfirmation;

  return (
    <div className="inline-slot-form__success">
      <p className="inline-slot-form__success-body">
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
      <div className="inline-slot-form__actions">
        <button type="button" className="inline-slot-form__submit" onClick={onDone}>
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
  if (delivery.provider === 'console') {
    return 'Your booking is saved. Email delivery is not configured here, so keep the manage link below.';
  }
  return "We've sent a confirmation email with a calendar invite.";
}
