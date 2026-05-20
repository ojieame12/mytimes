import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Download } from 'lucide-react';
import {
  ApiClientError,
  cancelManagedBooking,
  manageCalendarURL,
  readManagedRescheduleOptions,
  readManageBooking,
  resendManagedBookingEmail,
  rescheduleManagedBooking,
  type ManageBookingResponse,
} from '../lib/api';
import { navigate } from '../lib/routing';
import { formatTimeInTz, formatTzAbbrev, formatUtcOffset, viewerTimezone } from '../lib/time';
import { FormField } from '../components/form/FormField';
import { Textarea } from '../components/form/Inputs';
import { Avatar } from '../components/Avatar';
import type { TimeSlot } from '../lib/types';

export interface ManageBookingPageProps {
  manageToken: string;
}

type ManageState =
  | { status: 'loading' }
  | { status: 'ready'; data: ManageBookingResponse }
  | { status: 'error'; message: string };

type RescheduleState =
  | { status: 'closed' }
  | { status: 'loading' }
  | { status: 'ready'; slots: TimeSlot[] }
  | { status: 'error'; message: string };

export function ManageBookingPage({ manageToken }: ManageBookingPageProps) {
  const [state, setState] = useState<ManageState>({ status: 'loading' });
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [rescheduleState, setRescheduleState] = useState<RescheduleState>({ status: 'closed' });
  const [reschedulingSlotId, setReschedulingSlotId] = useState<string | undefined>();
  const [actionMessage, setActionMessage] = useState<string | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();
  /* Track whether the participant cancelled in this session, so we
   * can swap to the calm success vignette afterwards. The "already
   * cancelled when we loaded" path still renders inline inside the
   * card, which feels less celebratory than a fresh cancellation. */
  const [justCancelled, setJustCancelled] = useState(false);
  const rescheduleIdempotencyKeyRef = useRef<string | undefined>();
  const reschedulingRef = useRef(false);
  const currentViewerTz = useMemo(() => viewerTimezone(), []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    setReason('');
    setActionMessage(undefined);
    setActionError(undefined);
    setJustCancelled(false);
    setRescheduleState({ status: 'closed' });
    setReschedulingSlotId(undefined);
    rescheduleIdempotencyKeyRef.current = undefined;
    reschedulingRef.current = false;

    readManageBooking(manageToken)
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data });
      })
      .catch((error) => {
        const message =
          error instanceof ApiClientError
            ? error.message
            : 'Could not load this booking.';
        if (!cancelled) setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, [manageToken]);

  const cancelBooking = async () => {
    if (submitting || state.status !== 'ready') return;
    setSubmitting(true);
    setActionMessage(undefined);
    setActionError(undefined);
    try {
      const data = await cancelManagedBooking(manageToken, {
        reason,
        reopenSlot: true,
      });
      setState({ status: 'ready', data });
      setJustCancelled(true);
      setActionMessage('Booking cancelled. The slot can be booked again if the board is still active.');
    } catch (error) {
      setActionError(
        error instanceof ApiClientError
          ? error.message
          : 'Could not cancel this booking.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const resendEmail = async () => {
    if (resending || state.status !== 'ready') return;
    setResending(true);
    setActionMessage(undefined);
    setActionError(undefined);
    try {
      const response = await resendManagedBookingEmail(manageToken);
      setState({
        status: 'ready',
        data: {
          event: response.event,
          slot: response.slot,
          booking: response.booking,
        },
      });
      const cancelled = response.booking.status === 'cancelled';
      setActionMessage(
        response.delivery.status === 'sent'
          ? cancelled
            ? 'Cancellation email resent.'
            : 'Booking email resent with the latest details.'
          : 'Email delivery failed. Download the calendar file or contact the organizer.',
      );
    } catch (error) {
      setActionError(
        error instanceof ApiClientError
          ? error.message
          : 'Could not resend this booking email.',
      );
    } finally {
      setResending(false);
    }
  };

  const loadRescheduleOptions = async () => {
    if (state.status !== 'ready') return;
    if (rescheduleState.status === 'ready') {
      setRescheduleState({ status: 'closed' });
      return;
    }
    setRescheduleState({ status: 'loading' });
    setActionMessage(undefined);
    setActionError(undefined);
    try {
      const response = await readManagedRescheduleOptions(manageToken);
      setState({
        status: 'ready',
        data: {
          event: response.event,
          slot: response.slot,
          booking: response.booking,
        },
      });
      setRescheduleState({ status: 'ready', slots: response.slots });
    } catch (error) {
      setRescheduleState({
        status: 'error',
        message:
          error instanceof ApiClientError
            ? error.message
            : 'Could not load open times for this booking.',
      });
    }
  };

  const moveBookingToSlot = async (nextSlot: TimeSlot) => {
    if (state.status !== 'ready' || reschedulingRef.current) return;
    reschedulingRef.current = true;
    setReschedulingSlotId(nextSlot.id);
    setActionMessage(undefined);
    setActionError(undefined);
    try {
      const idempotencyKey =
        rescheduleIdempotencyKeyRef.current ?? makeManageRescheduleIdempotencyKey(nextSlot.id);
      rescheduleIdempotencyKeyRef.current = idempotencyKey;
      const response = await rescheduleManagedBooking(
        manageToken,
        {
          slotId: nextSlot.id,
          notes: state.data.booking.notes,
          participantTimezone: currentViewerTz,
          participantLocale: navigator.language || undefined,
          participantOffsetAtBooking: formatUtcOffset(new Date(nextSlot.startsAt), currentViewerTz),
        },
        { idempotencyKey },
      );
      setState({
        status: 'ready',
        data: {
          event: response.event,
          slot: response.slot,
          booking: response.booking,
        },
      });
      setRescheduleState({ status: 'closed' });
      setActionMessage(
        `Booking moved to ${formatDisplayDate(new Date(response.slot.startsAt), currentViewerTz)} at ${formatTimeInTz(new Date(response.slot.startsAt), currentViewerTz)}.`,
      );
    } catch (error) {
      setActionError(
        error instanceof ApiClientError
          ? error.message
          : 'Could not move this booking. Try another time.',
      );
    } finally {
      rescheduleIdempotencyKeyRef.current = undefined;
      reschedulingRef.current = false;
      setReschedulingSlotId(undefined);
    }
  };

  if (state.status === 'loading') {
    return <ManagePlaceholder title="Loading booking" body="Fetching your booking details." />;
  }

  if (state.status === 'error') {
    return (
      <ManagePlaceholder
        title="This manage link is invalid or unavailable."
        body={state.message}
        actionLabel="Go home"
        onAction={() => navigate('/')}
      />
    );
  }

  const { event, slot, booking } = state.data;
  const bookedTz = booking.participantTimezone ?? currentViewerTz;
  const startDate = new Date(slot.startsAt);
  const isCancelled = booking.status === 'cancelled';
  const disabled = submitting || resending || Boolean(reschedulingSlotId);
  const reference = formatReference(booking.id);

  /* Display title is split into two typographic halves: a SF
   * Compact Rounded date phrase ("Tuesday, 18 May") and a Geist
   * Mono booked time ("10:00") — same dual-treatment we use for
   * dates/times across the product. */
  const titleDate = formatDisplayDate(startDate, bookedTz);
  const titleTime = formatTimeInTz(startDate, bookedTz);
  const bookedZoneShort = formatTzAbbrev(startDate, bookedTz);
  const organizerTime = formatTimeInTz(startDate, event.timezone);
  const organizerZoneShort = formatTzAbbrev(startDate, event.timezone);

  /* Body line meta: duration · video/in-person · with organizer.
   * The slot's location type isn't on the wire so we keep this
   * generic — "Video call" reads as the default booking surface. */
  const durationMin = event.durationMinutes;

  /* If the booking was already cancelled when we loaded the page,
   * show the inline cancelled-state card and skip the cancellation
   * form. If the participant just cancelled in this session, swap
   * to the celebratory success vignette below. */
  if (isCancelled && justCancelled) {
    return (
      <section className="manage-shell">
        <section className="manage-success" aria-live="polite">
          <img
            className="manage-success__vignette"
            src="/assets/bg/vignette-laptop-grass.webp"
            alt=""
          />
          <h1 className="manage-success__title">Booking cancelled.</h1>
          <p className="manage-success__body">
            We let {event.organizerName} know. The slot is open again if
            the board is still active. Use the original booking board link from the organizer
            if you want to choose a different time.
          </p>
        </section>
      </section>
    );
  }

  return (
    <section className="manage-shell">
      <section className="manage-card" aria-label="Your booking">
        <header className="manage-card__head">
          <p className="manage-card__eyebrow">
            Your booking · <span>{event.title}</span>
          </p>
          <h1 className="manage-card__title">
            {titleDate}
            <span className="manage-card__title-time"> · {titleTime}</span>
          </h1>
          <p className="manage-card__meta">
            <span className="manage-card__meta-num">{durationMin} min</span>
            <span className="manage-card__meta-dot" aria-hidden="true">·</span>
            <span>Video call</span>
            <span className="manage-card__meta-dot" aria-hidden="true">·</span>
            <span className="manage-card__meta-organizer">
              <Avatar
                seed={event.avatarSeed ?? event.organizerEmail}
                style={event.avatarStyle ?? 'notionists'}
                size={26}
              />
              <span>
                with <span className="manage-card__meta-organizer-name">{event.organizerName}</span>
              </span>
            </span>
          </p>
        </header>

        {/* Dual-time block — only renders when the participant tz
         *  differs from the organizer tz, matching the rest of the
         *  product's dual-time treatment. */}
        {bookedTz !== event.timezone && (
          <section className="manage-card__tz" aria-label="Time in both zones">
            <div className="manage-card__tz-row">
              <span className="manage-card__tz-label">Your time</span>
              <span className="manage-card__tz-time">
                {titleTime} <span className="manage-card__tz-zone">{bookedZoneShort}</span>
              </span>
              <span className="manage-card__tz-zone">{bookedTz}</span>
            </div>
            <div className="manage-card__tz-row">
              <span className="manage-card__tz-label">Organizer time</span>
              <span className="manage-card__tz-time">
                {organizerTime} <span className="manage-card__tz-zone">{organizerZoneShort}</span>
              </span>
              <span className="manage-card__tz-zone">{event.timezone}</span>
            </div>
          </section>
        )}

        {booking.notes && (
          <section className="manage-card__note" aria-label="Participant note">
            <span className="manage-card__note-label">Your note</span>
            <p>{booking.notes}</p>
          </section>
        )}

        <div className="manage-card__status-row">
          <span
            className={`manage-card__status-pill${
              isCancelled ? ' manage-card__status-pill--cancelled' : ''
            }`}
          >
            <span className="manage-card__status-dot" aria-hidden="true" />
            <span>{isCancelled ? 'Cancelled' : 'Confirmed'}</span>
          </span>
          <span>
            Reference <span className="mono">{reference}</span>
          </span>
        </div>

        {/* Calendar file download card — kept distinct from the
         *  manage actions so the .ics download isn't crowded by
         *  reschedule / cancel choices. */}
        <section className="manage-card__ics" aria-label="Calendar file">
          <div className="manage-card__ics-text">
            <span className="manage-card__ics-label">
              <Calendar size={14} strokeWidth={1.8} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />
              {isCancelled ? 'Cancellation .ics file' : 'Add to your calendar'}
            </span>
            <span className="manage-card__ics-body">
              {isCancelled
                ? 'Download the cancellation file so your calendar removes the slot.'
                : 'Download the .ics and open it in any calendar app.'}
            </span>
          </div>
          <a className="manage-card__ics-link" href={manageCalendarURL(manageToken)}>
            <Download size={13} strokeWidth={1.8} aria-hidden="true" />
            <span>Download .ics</span>
          </a>
        </section>

        {isCancelled ? (
          <section className="manage-card__cancelled-state" aria-live="polite">
            <h2>Booking cancelled.</h2>
            <p>
              This booking was cancelled
              {booking.cancelledBy ? ` by the ${booking.cancelledBy}` : ''}. The slot can be booked
              again if the board is still active. Use the original booking board link from the
              organizer if you want to choose a different time.
            </p>
          </section>
        ) : (
          <form
            className="manage-card__form"
            onSubmit={(event_) => {
              event_.preventDefault();
              void cancelBooking();
            }}
          >
            <FormField label="Cancellation reason" optional hint="Shared with the organizer record.">
              {({ id, describedBy, invalid }) => (
                <Textarea
                  id={id}
                  describedBy={describedBy}
                  invalid={invalid}
                  value={reason}
                  onChange={(event_) => setReason(event_.target.value)}
                  placeholder="I can no longer make this time."
                  maxLength={1000}
                  disabled={disabled}
                />
              )}
            </FormField>
            {rescheduleState.status !== 'closed' && (
              <section className="manage-card__reschedule" aria-live="polite">
                <div className="manage-card__reschedule-head">
                  <h2>Choose a new time</h2>
                  <p>{event.durationMinutes} min · shown in {formatTzAbbrev(new Date(), currentViewerTz)}</p>
                </div>
                {rescheduleState.status === 'loading' && (
                  <p className="manage-card__reschedule-note">Loading open times…</p>
                )}
                {rescheduleState.status === 'error' && (
                  <p className="manage-card__reschedule-error">{rescheduleState.message}</p>
                )}
                {rescheduleState.status === 'ready' && rescheduleState.slots.length === 0 && (
                  <p className="manage-card__reschedule-note">No other open times are available right now.</p>
                )}
                {rescheduleState.status === 'ready' && rescheduleState.slots.length > 0 && (
                  <div className="manage-card__reschedule-slots">
                    {rescheduleState.slots.map((candidate) => {
                      const candidateStart = new Date(candidate.startsAt);
                      const candidateEnd = new Date(candidate.endsAt);
                      const moving = reschedulingSlotId === candidate.id;
                      return (
                        <button
                          key={candidate.id}
                          type="button"
                          className="manage-card__reschedule-slot"
                          disabled={disabled}
                          onClick={() => void moveBookingToSlot(candidate)}
                        >
                          <span>{formatDisplayDate(candidateStart, currentViewerTz)}</span>
                          <span className="mono">
                            {formatTimeInTz(candidateStart, currentViewerTz)}–{formatTimeInTz(candidateEnd, currentViewerTz)}
                          </span>
                          <span>{moving ? 'Moving…' : 'Move booking'}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
            {/* Manage actions strip. Rescheduling stays on the manage
             *  token and never reconstructs a public booking URL. */}
            <div className="manage-card__actions" aria-label="Manage booking actions">
              <div className="manage-card__actions-left">
                <button
                  type="button"
                  className="manage-btn manage-btn--ghost"
                  disabled={disabled}
                  onClick={() => void resendEmail()}
                >
                  {resending ? 'Sending…' : 'Resend email'}
                </button>
              </div>
              <div className="manage-card__actions-right">
                <button
                  type="button"
                  className="manage-btn manage-btn--ghost"
                  disabled={disabled}
                  onClick={() => void loadRescheduleOptions()}
                >
                  {rescheduleState.status === 'ready' ? 'Hide times' : 'Change time'}
                </button>
                <button
                  type="submit"
                  className="manage-btn manage-btn--destructive"
                  disabled={disabled}
                >
                  {submitting ? 'Cancelling…' : 'Cancel booking'}
                </button>
              </div>
            </div>
          </form>
        )}

        {(actionMessage || actionError) && (
          <p
            className={`manage-card__feedback ${
              actionError ? 'manage-card__feedback--error' : 'manage-card__feedback--success'
            }`}
            aria-live="polite"
          >
            {actionError ?? actionMessage}
          </p>
        )}
      </section>
    </section>
  );
}

/* ─── Helpers ─────────────────────────────────────────── */

function ManagePlaceholder({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <section className="manage-shell">
      <section className="manage-placeholder" aria-live="polite">
        <h1 className="manage-placeholder__title">{title}</h1>
        <p className="manage-placeholder__body">{body}</p>
        {actionLabel && onAction && (
          <button
            type="button"
            className="manage-btn manage-btn--ghost"
            onClick={onAction}
          >
            {actionLabel}
          </button>
        )}
      </section>
    </section>
  );
}

/** "Tuesday, 18 May" — long weekday + day + month, scoped to a
 *  specific timezone so the participant always sees the date in
 *  the zone they booked in. Year is dropped intentionally — the
 *  manage page is always read close to the booked date. */
function formatDisplayDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: timezone,
  }).format(date);
}

/** "ABCD-EFGH-IJKL" — same reference code format as the booking
 *  card. The participant's confirmation email shows the same
 *  string, so reading off the manage page should match. */
function formatReference(id: string): string {
  const tail = id.replace(/[^a-z0-9]/gi, '').slice(-12).toUpperCase().padStart(12, '0');
  return `${tail.slice(0, 4)}-${tail.slice(4, 8)}-${tail.slice(8, 12)}`;
}

function makeManageRescheduleIdempotencyKey(slotId: string): string {
  if (globalThis.crypto?.randomUUID) {
    return `manage-reschedule:${slotId}:${globalThis.crypto.randomUUID()}`;
  }
  return `manage-reschedule:${slotId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 12)}`;
}
