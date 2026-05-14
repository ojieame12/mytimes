import { useEffect, useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import {
  accountCsvURL,
  adminCsvURL,
  ApiClientError,
  archiveAccountEvent,
  archiveAdminEvent,
  cancelBookingByAccount,
  cancelBookingByAdmin,
  createAccountEventPassCheckout,
  createAdminEventPassCheckout,
  deleteAccountEvent,
  deleteAdminEvent,
  readAccountDashboard,
  readAdminDashboard,
  readBillingReadiness,
  resendBookingEmailByAccount,
  resendBookingEmailByAdmin,
  rotateAccountPublicLink,
  rotateAdminPublicLink,
  setAccountSlotStatus,
  setAdminSlotStatus,
  updateAccountEvent,
  updateAdminEvent,
  type AdminDashboardResponse,
  type AdminEventPatch,
} from '../lib/api';
import type { TimeSlot } from '../lib/types';
import { viewerTimezone, formatTimeInTz, formatTzAbbrev } from '../lib/time';
import { navigate } from '../lib/routing';
import {
  clearCheckoutReturnParams,
  readCheckoutReturn,
  type CheckoutReturn,
} from '../lib/checkoutReturn';
import { SlotGrid } from '../components/SlotGrid';
import { StatusChip, type StatusChipKind } from '../components/StatusChip';
import { FormField } from '../components/form/FormField';
import { TextInput, Textarea } from '../components/form/Inputs';
import {
  CheckoutReturnNotice,
  type CheckoutReturnTone,
} from '../components/CheckoutReturnNotice';

export type AdminDashboardPageProps =
  | { adminToken: string; accountEventId?: never }
  | { accountEventId: string; adminToken?: never };

type AdminState =
  | { status: 'loading' }
  | { status: 'ready'; dashboard: AdminDashboardResponse }
  | { status: 'error'; message: string };

type EventForm = {
  title: string;
  description: string;
  organizerName: string;
  organizerEmail: string;
};

export function AdminDashboardPage(props: AdminDashboardPageProps) {
  const accountEventId = 'accountEventId' in props ? props.accountEventId : undefined;
  const adminToken = 'adminToken' in props ? props.adminToken : undefined;
  const isAccountMode = Boolean(accountEventId);
  const routeKey = accountEventId ?? adminToken ?? '';
  const [state, setState] = useState<AdminState>({ status: 'loading' });
  const [form, setForm] = useState<EventForm>({
    title: '',
    description: '',
    organizerName: '',
    organizerEmail: '',
  });
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | undefined>();
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();
  const [freshPublicLink, setFreshPublicLink] = useState<string | undefined>();
  const [freshShareMessage, setFreshShareMessage] = useState<string | undefined>();
  const [freshLinkCopied, setFreshLinkCopied] = useState(false);
  const [billingReady, setBillingReady] = useState<boolean | undefined>();
  const [checkoutReturn, setCheckoutReturn] = useState<CheckoutReturn | undefined>(() =>
    readCheckoutReturn(),
  );
  const viewerTz = viewerTimezone();

  useEffect(() => {
    let cancelled = false;
    readBillingReadiness()
      .then((response) => {
        if (!cancelled) setBillingReady(response.billing.productionReady);
      })
      .catch(() => {
        if (!cancelled) setBillingReady(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCheckoutReturn(readCheckoutReturn());
    setState({ status: 'loading' });
    setSelectedSlot(undefined);
    setActionMessage(undefined);
    setActionError(undefined);
    setFreshPublicLink(undefined);
    setFreshShareMessage(undefined);
    setFreshLinkCopied(false);

    readDashboard()
      .then((dashboard) => {
        if (cancelled) return;
        setState({ status: 'ready', dashboard });
        setForm(formFromEvent(dashboard));
      })
      .catch((error) => {
        const message =
          error instanceof ApiClientError
            ? error.message
            : 'Could not load the organizer dashboard.';
        if (!cancelled) setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, [routeKey]);

  const stats =
    state.status === 'ready'
      ? dashboardStats(state.dashboard.slots)
      : { open: 0, booked: 0, closed: 0, total: 0 };

  const refreshDashboard = async (slotToKeep?: string) => {
    const dashboard = await readDashboard();
    setState({ status: 'ready', dashboard });
    setForm(formFromEvent(dashboard));
    setSelectedSlot(slotToKeep ? dashboard.slots.find((slot) => slot.id === slotToKeep) : undefined);
    return dashboard;
  };

  const readDashboard = () => {
    if (accountEventId) return readAccountDashboard(accountEventId);
    return readAdminDashboard(adminToken ?? '');
  };

  const csvHref = accountEventId ? accountCsvURL(accountEventId) : adminCsvURL(adminToken ?? '');

  const refreshCheckoutStatus = async () => {
    if (busy) return;
    setBusy(true);
    setActionMessage(undefined);
    setActionError(undefined);
    try {
      await refreshDashboard(selectedSlot?.id);
    } catch (error) {
      setActionError(
        error instanceof ApiClientError ? error.message : 'Could not refresh payment status.',
      );
    } finally {
      setBusy(false);
    }
  };

  const dismissCheckoutReturn = () => {
    clearCheckoutReturnParams();
    setCheckoutReturn(undefined);
  };

  const saveEventDetails = async () => {
    if (busy || state.status !== 'ready') return;
    const patch = buildEventPatch(form, state.dashboard);
    if (Object.keys(patch).length === 0) {
      setActionMessage('No event details changed.');
      setActionError(undefined);
      return;
    }

    setBusy(true);
    setActionMessage(undefined);
    setActionError(undefined);
    try {
      const response = accountEventId
        ? await updateAccountEvent(accountEventId, patch)
        : await updateAdminEvent(adminToken ?? '', patch);
      setState({
        status: 'ready',
        dashboard: { ...state.dashboard, event: response.event },
      });
      setForm({
        title: response.event.title,
        description: response.event.description ?? '',
        organizerName: response.event.organizerName,
        organizerEmail: response.event.organizerEmail,
      });
      setActionMessage('Event details saved.');
    } catch (error) {
      setActionError(
        error instanceof ApiClientError ? error.message : 'Could not save event details.',
      );
    } finally {
      setBusy(false);
    }
  };

  const changeSlotStatus = async (slot: TimeSlot, status: 'open' | 'closed') => {
    if (busy || state.status !== 'ready') return;
    setBusy(true);
    setActionMessage(undefined);
    setActionError(undefined);
    try {
      const response = accountEventId
        ? await setAccountSlotStatus(accountEventId, slot.id, status)
        : await setAdminSlotStatus(adminToken ?? '', slot.id, status);
      setState({
        status: 'ready',
        dashboard: {
          ...state.dashboard,
          event: response.event,
          slots: state.dashboard.slots.map((current) =>
            current.id === response.slot.id ? response.slot : current,
          ),
        },
      });
      setSelectedSlot(response.slot);
      setActionMessage(status === 'closed' ? 'Slot closed.' : 'Slot reopened.');
    } catch (error) {
      setActionError(
        error instanceof ApiClientError ? error.message : 'Could not update this slot.',
      );
    } finally {
      setBusy(false);
    }
  };

  const cancelBooking = async (slot: TimeSlot, reopenSlot: boolean) => {
    if (busy || !slot.bookingId) return;
    setBusy(true);
    setActionMessage(undefined);
    setActionError(undefined);
    try {
      if (accountEventId) {
        await cancelBookingByAccount(accountEventId, slot.bookingId, {
          reason: cancelReason,
          reopenSlot,
        });
      } else {
        await cancelBookingByAdmin(adminToken ?? '', slot.bookingId, {
          reason: cancelReason,
          reopenSlot,
        });
      }
      await refreshDashboard(slot.id);
      setCancelReason('');
      setActionMessage(
        reopenSlot
          ? 'Booking cancelled. The slot is open again for others.'
          : 'Booking cancelled. The slot is kept closed.',
      );
    } catch (error) {
      setActionError(
        error instanceof ApiClientError ? error.message : 'Could not cancel this booking.',
      );
    } finally {
      setBusy(false);
    }
  };

  const resendBookingEmail = async (slot: TimeSlot) => {
    if (busy || !slot.bookingId) return;
    setBusy(true);
    setActionMessage(undefined);
    setActionError(undefined);
    try {
      const response = accountEventId
        ? await resendBookingEmailByAccount(accountEventId, slot.bookingId)
        : await resendBookingEmailByAdmin(adminToken ?? '', slot.bookingId);
      await refreshDashboard(slot.id);
      setActionMessage(
        response.delivery.status === 'sent'
          ? 'Booking email resent with a fresh manage link.'
          : 'Booking email resend failed. Check email delivery configuration.',
      );
    } catch (error) {
      setActionError(
        error instanceof ApiClientError
          ? error.message
          : 'Could not resend this booking email.',
      );
    } finally {
      setBusy(false);
    }
  };

  const changeEventLifecycle = async (action: 'archive' | 'delete') => {
    if (busy || state.status !== 'ready') return;
    if (action === 'archive' && state.dashboard.event.status !== 'active') return;
    if (action === 'delete' && state.dashboard.event.status === 'deleted') return;

    const confirmed = window.confirm(
      action === 'archive'
        ? 'Archive this board? Public booking will close, but this admin dashboard remains readable.'
        : 'Delete this board? Public and admin links will stop working after this page is closed.',
    );
    if (!confirmed) return;

    setBusy(true);
    setActionMessage(undefined);
    setActionError(undefined);
    try {
      const response =
        action === 'archive'
          ? accountEventId
            ? await archiveAccountEvent(accountEventId)
            : await archiveAdminEvent(adminToken ?? '')
          : accountEventId
            ? await deleteAccountEvent(accountEventId)
            : await deleteAdminEvent(adminToken ?? '');
      setState({
        status: 'ready',
        dashboard: { ...state.dashboard, event: response.event },
      });
      setSelectedSlot(undefined);
      setActionMessage(
        action === 'archive'
          ? 'Board archived. Public booking is closed.'
          : 'Board deleted. This link will no longer work after refresh.',
      );
    } catch (error) {
      setActionError(
        error instanceof ApiClientError
          ? error.message
          : action === 'archive'
            ? 'Could not archive this board.'
            : 'Could not delete this board.',
      );
    } finally {
      setBusy(false);
    }
  };

  const startEventPassCheckout = async () => {
    if (busy || state.status !== 'ready') return;
    if (billingReady === false) {
      setActionError('Payments are not active yet. Add the Stripe secret and webhook secret on Railway first.');
      setActionMessage(undefined);
      return;
    }
    if (hasActivePaidFeatures(state.dashboard.event)) {
      setActionMessage('This board is already unlocked.');
      setActionError(undefined);
      return;
    }

    setBusy(true);
    setActionMessage(undefined);
    setActionError(undefined);
    try {
      const checkout = accountEventId
        ? await createAccountEventPassCheckout(accountEventId)
        : await createAdminEventPassCheckout(adminToken ?? '');
      window.location.assign(checkout.url);
    } catch (error) {
      setActionError(
        error instanceof ApiClientError
          ? billingErrorMessage(error)
          : 'Could not start checkout.',
      );
    } finally {
      setBusy(false);
    }
  };

  const createFreshBookingLink = async () => {
    if (busy || state.status !== 'ready') return;
    const confirmed = window.confirm(
      'Create a fresh booking link? The old public booking link will stop working.',
    );
    if (!confirmed) return;

    setBusy(true);
    setActionMessage(undefined);
    setActionError(undefined);
    setFreshLinkCopied(false);
    try {
      const response = accountEventId
        ? await rotateAccountPublicLink(accountEventId)
        : await rotateAdminPublicLink(adminToken ?? '');
      setState({
        status: 'ready',
        dashboard: { ...state.dashboard, event: response.event },
      });
      setFreshPublicLink(response.links.public);
      setFreshShareMessage(response.shareMessage);
      const copied = await copyText(response.links.public);
      setFreshLinkCopied(copied);
      if (copied) {
        window.setTimeout(() => setFreshLinkCopied(false), 1400);
      }
      setActionMessage(
        copied
          ? 'Fresh booking link copied. Old public links no longer work.'
          : 'Fresh booking link created. Copy it from the Booking link panel.',
      );
    } catch (error) {
      setActionError(
        error instanceof ApiClientError ? error.message : 'Could not create a fresh booking link.',
      );
    } finally {
      setBusy(false);
    }
  };

  const copyFreshBookingLink = async () => {
    if (!freshPublicLink) return;
    const copied = await copyText(freshPublicLink);
    setFreshLinkCopied(copied);
    if (copied) {
      window.setTimeout(() => setFreshLinkCopied(false), 1400);
    }
  };

  if (state.status === 'loading') {
    return <AdminPlaceholder title="Loading admin dashboard." body="Fetching board controls." />;
  }

  if (state.status === 'error') {
    return (
      <AdminPlaceholder
        title={isAccountMode ? 'This account board is unavailable.' : 'This admin link is invalid or unavailable.'}
        body={state.message}
        actionLabel={isAccountMode ? 'Back to account' : 'Go home'}
        onAction={() => navigate(isAccountMode ? '/account' : '/')}
      />
    );
  }

  const { event, slots } = state.dashboard;
  const isDeleted = event.status === 'deleted';
  const canExportCsv = true;
  const checkoutNotice = checkoutReturn
    ? adminCheckoutNotice(event, checkoutReturn)
    : undefined;

  return (
    <section className="management-layout management-layout--wide">
      {checkoutNotice && (
        <CheckoutReturnNotice
          tone={checkoutNotice.tone}
          eyebrow={checkoutNotice.eyebrow}
          title={checkoutNotice.title}
          body={checkoutNotice.body}
          actionLabel={checkoutNotice.actionLabel}
          actionKind={checkoutNotice.actionKind}
          busy={busy}
          onAction={
            checkoutNotice.actionKind === 'checkout'
              ? () => void startEventPassCheckout()
              : () => void refreshCheckoutStatus()
          }
          onDismiss={dismissCheckoutReturn}
        />
      )}
      <div className="management-panel material-panel">
        <header className="management-head management-head--admin">
          <div>
            <span className="management-eyebrow">
              <span className="brand-dot" aria-hidden="true" />
              {isAccountMode ? 'Account dashboard' : 'Organizer dashboard'}
            </span>
            <h1>{event.title}</h1>
            <p>{event.description || `Board owned by ${event.organizerName}.`}</p>
          </div>
          <div className="admin-head-actions">
            <StatusChip kind={event.status as StatusChipKind} size="md" />
            <a
              className={`${canExportCsv ? 'material-stamp-light' : 'material-stamp-dark'} is-md`}
              href={canExportCsv && !isDeleted ? csvHref : undefined}
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: 'none' }}
              aria-disabled={isDeleted}
              title={
                canExportCsv
                  ? 'Export bookings as CSV'
                  : 'Export bookings as CSV'
              }
              onClick={(event_) => {
                if (isDeleted) {
                  event_.preventDefault();
                  return;
                }
              }}
            >
              Export CSV
            </a>
            <button
              type="button"
              className="material-stamp-light is-md"
              disabled={busy || event.status !== 'active'}
              onClick={() => void changeEventLifecycle('archive')}
            >
              {event.status === 'archived' ? 'Archived' : 'Archive'}
            </button>
            <button
              type="button"
              className="material-stamp-light is-md admin-head-actions__danger"
              disabled={busy || isDeleted}
              onClick={() => void changeEventLifecycle('delete')}
            >
              {isDeleted ? 'Deleted' : 'Delete'}
            </button>
          </div>
        </header>

        <div className="management-summary-grid management-summary-grid--stats">
          <SummaryTile label="Open" value={String(stats.open)} kind="open" />
          <SummaryTile label="Booked" value={String(stats.booked)} kind="booked" />
          <SummaryTile label="Closed" value={String(stats.closed)} kind="closed" />
          <SummaryTile label="Total" value={String(stats.total)} />
        </div>

        {/* Recent activity — last 5 bookings, derived from slot.bookedAt.
            Gives the admin a sense of "what just happened" without
            having to inspect every cell. */}
        <RecentActivity slots={slots} timezone={event.timezone} viewerTz={viewerTz} />

        <div className="admin-workspace">
          <section className="admin-board material-panel-mini">
            <header className="admin-section-head">
              <span>Slots</span>
              <strong>{event.timezone}</strong>
            </header>
            <SlotGrid
              slots={slots}
              viewerTz={viewerTz}
              sourceTz={event.timezone}
              mode="admin"
              onSlotClick={(slot) => {
                if (isDeleted) return;
                setSelectedSlot(slot);
                setCancelReason('');
                setActionMessage(undefined);
                setActionError(undefined);
              }}
            />
          </section>

          <aside className="admin-side">
            <EventPassPanel
              event={event}
              busy={busy || isDeleted}
              billingReady={billingReady}
              onUpgrade={() => void startEventPassCheckout()}
            />

            <BookingLinkPanel
              eventStatus={event.status}
              busy={busy || isDeleted}
              publicLink={freshPublicLink}
              shareMessage={freshShareMessage}
              copied={freshLinkCopied}
              onCreateFreshLink={() => void createFreshBookingLink()}
              onCopyFreshLink={() => void copyFreshBookingLink()}
            />

            <form
              className="admin-settings material-panel-mini"
              onSubmit={(event_) => {
                event_.preventDefault();
                void saveEventDetails();
              }}
            >
              <header className="admin-section-head">
                <span>Event details</span>
                <strong>Editable</strong>
              </header>

              <FormField label="Title">
                {({ id, describedBy, invalid }) => (
                  <TextInput
                    id={id}
                    describedBy={describedBy}
                    invalid={invalid}
                    value={form.title}
                    onChange={(event_) => setForm({ ...form, title: event_.target.value })}
                    maxLength={160}
                    disabled={busy || isDeleted}
                  />
                )}
              </FormField>
              <FormField label="Description" optional>
                {({ id, describedBy, invalid }) => (
                  <Textarea
                    id={id}
                    describedBy={describedBy}
                    invalid={invalid}
                    value={form.description}
                    onChange={(event_) => setForm({ ...form, description: event_.target.value })}
                    maxLength={5000}
                    disabled={busy || isDeleted}
                  />
                )}
              </FormField>
              <FormField label="Organizer name">
                {({ id, describedBy, invalid }) => (
                  <TextInput
                    id={id}
                    describedBy={describedBy}
                    invalid={invalid}
                    value={form.organizerName}
                    onChange={(event_) => setForm({ ...form, organizerName: event_.target.value })}
                    maxLength={160}
                    disabled={busy || isDeleted}
                  />
                )}
              </FormField>
              <FormField label="Organizer email">
                {({ id, describedBy, invalid }) => (
                  <TextInput
                    id={id}
                    type="email"
                    describedBy={describedBy}
                    invalid={invalid}
                    value={form.organizerEmail}
                    onChange={(event_) => setForm({ ...form, organizerEmail: event_.target.value })}
                    disabled={busy || isDeleted}
                  />
                )}
              </FormField>

              <button type="submit" className="material-stamp-dark is-md" disabled={busy || isDeleted}>
                {busy ? 'Working.' : 'Save details'}
              </button>
            </form>

            <SlotActionPanel
              slot={selectedSlot}
              timezone={event.timezone}
              cancelReason={cancelReason}
              busy={busy || isDeleted}
              onCancelReason={setCancelReason}
              onCloseSlot={(slot) => void changeSlotStatus(slot, 'closed')}
              onReopenSlot={(slot) => void changeSlotStatus(slot, 'open')}
              onResendBookingEmail={(slot) => void resendBookingEmail(slot)}
              onCancelAndReopen={(slot) => void cancelBooking(slot, true)}
              onCancelAndKeepClosed={(slot) => void cancelBooking(slot, false)}
            />
          </aside>
        </div>

        {(actionMessage || actionError) && (
          <p className={actionError ? 'management-error' : 'management-success'} aria-live="polite">
            {actionError ?? actionMessage}
          </p>
        )}
      </div>
    </section>
  );
}

function EventPassPanel({
  event,
  busy,
  billingReady,
  onUpgrade,
}: {
  event: AdminDashboardResponse['event'];
  busy: boolean;
  billingReady: boolean | undefined;
  onUpgrade: () => void;
}) {
  const isPaid = hasActivePaidFeatures(event);
  const isPending = event.paymentStatus === 'pending';

  return (
    <section className="admin-billing material-panel-mini">
      <header className="admin-section-head">
        <span>Board unlock</span>
        <strong>{isPaid ? 'Active' : isPending ? 'Pending' : '$19 once'}</strong>
      </header>
      <p className="admin-billing__body">
        {billingReady === false && !isPaid
          ? 'Stripe checkout is not configured on the API service yet.'
          : isPaid
            ? `Unlocked capacity is active: ${event.bookingLimit ?? 75} bookings, ${event.slotLimit ?? 200} generated slots, and the longer active window for this board.`
            : isPending
              ? 'Checkout has started. Refresh after payment completes, or use the Stripe return link.'
              : 'Unlock this board for one larger interview round: 75 bookings, 200 generated slots, 180-day activity, and no mytimes footer on the booking page.'}
      </p>
      {event.expiresAt && (
        <p className="admin-billing__meta mono">
          Active until {formatBillingDate(event.expiresAt)}
        </p>
      )}
      {!isPaid && (
        <button
          type="button"
          className="material-stamp-dark is-md"
          disabled={busy || billingReady === false}
          onClick={onUpgrade}
        >
          {busy
            ? 'Opening Checkout.'
            : billingReady === false
              ? 'Payments inactive'
              : isPending
                ? 'Resume Checkout'
                : 'Unlock: $19'}
        </button>
      )}
    </section>
  );
}

function BookingLinkPanel({
  eventStatus,
  busy,
  publicLink,
  shareMessage,
  copied,
  onCreateFreshLink,
  onCopyFreshLink,
}: {
  eventStatus: AdminDashboardResponse['event']['status'];
  busy: boolean;
  publicLink?: string;
  shareMessage?: string;
  copied: boolean;
  onCreateFreshLink: () => void;
  onCopyFreshLink: () => void;
}) {
  const disabled = busy || eventStatus !== 'active';
  return (
    <section className="admin-link-panel material-panel-mini">
      <header className="admin-section-head">
        <span>Booking link</span>
        <strong>{publicLink ? 'Fresh' : 'Private token'}</strong>
      </header>
      <p className="admin-link-panel__body">
        Public links are not stored in readable form. Create a fresh one when you
        need to share the board again; the previous public link stops working.
      </p>
      {publicLink && (
        <div className="admin-link-panel__result">
          <code>{publicLink}</code>
          <button
            type="button"
            className="material-stamp-light is-md"
            onClick={onCopyFreshLink}
            disabled={busy}
          >
            <Copy size={13} strokeWidth={1.8} aria-hidden="true" />
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      )}
      {shareMessage && (
        <textarea
          className="admin-link-panel__message"
          value={shareMessage}
          readOnly
          rows={5}
          aria-label="Suggested invitation message"
        />
      )}
      <button
        type="button"
        className="material-stamp-dark is-md"
        onClick={onCreateFreshLink}
        disabled={disabled}
      >
        <RefreshCw size={13} strokeWidth={1.8} aria-hidden="true" />
        {busy ? 'Creating link.' : publicLink ? 'Create another link' : 'Create fresh link'}
      </button>
    </section>
  );
}

function billingErrorMessage(error: ApiClientError): string {
  if (error.code === 'billing_not_configured') {
    return 'Payments are not configured yet. Add the Stripe secret and webhook secret on Railway before taking money.';
  }
  if (error.code === 'event_already_paid') {
    return 'This board is already unlocked.';
  }
  return error.message;
}

function adminCheckoutNotice(
  event: AdminDashboardResponse['event'],
  checkoutReturn: CheckoutReturn,
): {
  tone: CheckoutReturnTone;
  eyebrow: string;
  title: string;
  body: string;
  actionLabel?: string;
  actionKind?: 'refresh' | 'checkout';
} | undefined {
  const isPaid = hasActivePaidFeatures(event);

  if (checkoutReturn.product === 'cancelled') {
    if (isPaid) {
      return {
        tone: 'warning',
        eyebrow: 'Checkout canceled',
        title: 'No new payment was taken.',
        body: 'This board is already unlocked, so the existing paid features remain active.',
      };
    }

    return {
      tone: 'warning',
      eyebrow: 'Checkout canceled',
      title: 'This board is still on Free.',
      body: 'No payment was taken. You can resume checkout when this interview round needs the paid capacity.',
      actionLabel: 'Resume checkout',
      actionKind: 'checkout',
    };
  }

  if (checkoutReturn.product !== 'event_pass') return undefined;

  if (isPaid) {
    return {
      tone: 'success',
      eyebrow: 'Board unlock active',
      title: 'Paid capacity is ready for this board.',
      body: `This round now has ${event.bookingLimit ?? 75} bookings, ${event.slotLimit ?? 200} generated slots, and the longer active window.`,
    };
  }

  if (event.paymentStatus === 'failed') {
    return {
      tone: 'danger',
      eyebrow: 'Payment failed',
      title: 'Stripe could not complete the board unlock.',
      body: 'The board is still usable on Free. Restart checkout to unlock paid capacity for this round.',
      actionLabel: 'Restart checkout',
      actionKind: 'checkout',
    };
  }

  return {
    tone: 'pending',
    eyebrow: 'Checkout returned',
    title: 'Payment status is still pending.',
      body: 'Stripe sent you back to mytimes. The webhook may still be finishing, so refresh this board in a moment before sharing the unlocked board.',
    actionLabel: 'Refresh status',
    actionKind: 'refresh',
  };
}

function hasActivePaidFeatures(event: AdminDashboardResponse['event']): boolean {
  if (event.paymentStatus !== 'paid') return false;
  if (event.planKey !== 'event_pass' && event.planKey !== 'company_standby') return false;
  if (!event.expiresAt) return true;
  return Date.parse(event.expiresAt) > Date.now();
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function SlotActionPanel({
  slot,
  timezone,
  cancelReason,
  busy,
  onCancelReason,
  onCloseSlot,
  onReopenSlot,
  onResendBookingEmail,
  onCancelAndReopen,
  onCancelAndKeepClosed,
}: {
  slot: TimeSlot | undefined;
  timezone: string;
  cancelReason: string;
  busy: boolean;
  onCancelReason: (reason: string) => void;
  onCloseSlot: (slot: TimeSlot) => void;
  onReopenSlot: (slot: TimeSlot) => void;
  onResendBookingEmail: (slot: TimeSlot) => void;
  /** Cancel the booking AND reopen the slot for others to book. */
  onCancelAndReopen: (slot: TimeSlot) => void;
  /** Cancel the booking but keep the slot unavailable (no rebooking). */
  onCancelAndKeepClosed: (slot: TimeSlot) => void;
}) {
  if (!slot) {
    return (
      <section className="admin-slot-panel material-panel-mini">
        <header className="admin-section-head">
          <span>Slot action</span>
          <strong>None selected</strong>
        </header>
        <p className="admin-slot-panel__empty">Select a slot to manage its availability.</p>
      </section>
    );
  }

  const slotLabel = formatSlotWindow(slot.startsAt, slot.endsAt, timezone);

  return (
    <section className="admin-slot-panel material-panel-mini">
      <header className="admin-section-head">
        <span>Slot action</span>
        <StatusChip kind={slot.state as StatusChipKind} />
      </header>
      <div className="admin-slot-panel__summary">
        <span>{slotLabel}</span>
        {slot.bookedName && <strong>{slot.bookedName}</strong>}
        {slot.bookedEmail && <code>{slot.bookedEmail}</code>}
      </div>

      {slot.bookedNotes && (
        <p className="admin-slot-panel__note">{slot.bookedNotes}</p>
      )}

      {slot.state === 'open' && (
        <button
          type="button"
          className="material-stamp-light is-md"
          disabled={busy}
          onClick={() => onCloseSlot(slot)}
        >
          Close slot
        </button>
      )}

      {slot.state === 'closed' && (
        <button
          type="button"
          className="material-stamp-dark is-md"
          disabled={busy}
          onClick={() => onReopenSlot(slot)}
        >
          Reopen slot
        </button>
      )}

      {slot.state === 'booked' && (
        <div className="admin-slot-panel__cancel">
          <div className="admin-slot-panel__email">
            {slot.emailBounced && (
              <p className="admin-slot-panel__email-warning">
                Previous email delivery bounced for this participant.
              </p>
            )}
            <p className="admin-slot-panel__email-hint">
              Sends the participant the latest booking details and a fresh manage link.
            </p>
            <button
              type="button"
              className="material-stamp-light is-md"
              disabled={busy || !slot.bookingId}
              onClick={() => onResendBookingEmail(slot)}
            >
              Resend booking email
            </button>
          </div>
          <FormField label="Cancellation reason" optional hint="Shared with the participant in the cancellation email.">
            {({ id, describedBy, invalid }) => (
              <Textarea
                id={id}
                describedBy={describedBy}
                invalid={invalid}
                value={cancelReason}
                onChange={(event) => onCancelReason(event.target.value)}
                placeholder="Optional, e.g. 'Rescheduling. I'll send a new link.'"
                maxLength={1000}
                disabled={busy}
              />
            )}
          </FormField>
          <p className="admin-slot-panel__cancel-hint">
            Pick how the slot should behave after cancelling:
          </p>
          <div className="admin-slot-panel__cancel-actions">
            <button
              type="button"
              className="material-stamp-dark is-md"
              disabled={busy || !slot.bookingId}
              onClick={() => onCancelAndReopen(slot)}
            >
              Cancel & reopen slot
            </button>
            <button
              type="button"
              className="material-stamp-light is-md"
              disabled={busy || !slot.bookingId}
              onClick={() => onCancelAndKeepClosed(slot)}
            >
              Cancel & keep closed
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function AdminPlaceholder({
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
    <section className="material-panel placeholder-panel" aria-live="polite">
      <h1>{title}</h1>
      <p>{body}</p>
      {actionLabel && onAction && (
        <div className="placeholder-actions">
          <button type="button" className="material-stamp-light is-md" onClick={onAction}>
            {actionLabel}
          </button>
        </div>
      )}
    </section>
  );
}

function SummaryTile({
  label,
  value,
  kind,
}: {
  label: string;
  value: string;
  kind?: StatusChipKind;
}) {
  return (
    <div
      className={`management-summary-tile material-panel-mini${kind ? ` management-summary-tile--${kind}` : ''}`}
    >
      <span>
        {kind && <span className={`summary-dot summary-dot--${kind}`} aria-hidden="true" />}
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

/* ─── RecentActivity ──────────────────────────────────────
 * Derived from slot.bookedAt — surfaces the last few bookings
 * so the admin doesn't have to scan the grid to feel progress. */

function RecentActivity({
  slots,
  timezone,
  viewerTz,
}: {
  slots: TimeSlot[];
  timezone: string;
  viewerTz: string;
}) {
  const recent = slots
    .filter((s) => s.state === 'booked' && s.bookedAt)
    .sort((a, b) => (b.bookedAt ?? '').localeCompare(a.bookedAt ?? ''))
    .slice(0, 5);

  if (recent.length === 0) {
    return (
      <section className="admin-activity material-panel-mini">
        <header className="admin-section-head">
          <span>Recent activity</span>
          <strong>Empty</strong>
        </header>
        <p className="admin-activity__empty">
          No bookings yet. Share the public link to start receiving slot claims.
        </p>
      </section>
    );
  }

  return (
    <section className="admin-activity material-panel-mini">
      <header className="admin-section-head">
        <span>Recent activity</span>
        <strong>{recent.length} latest</strong>
      </header>
      <ol className="admin-activity__list">
        {recent.map((slot) => (
          <li key={slot.id} className="admin-activity__row">
            <span className="admin-activity__dot" aria-hidden="true" />
            <div className="admin-activity__body">
              <strong className="admin-activity__who">{slot.bookedName ?? 'Participant'}</strong>
              <span className="admin-activity__what">
                booked{' '}
                <span className="mono tabular">
                  {formatActivitySlot(slot.startsAt, timezone, viewerTz)}
                </span>
              </span>
            </div>
            <time className="admin-activity__when mono">
              {slot.bookedAt ? relativeTime(slot.bookedAt) : ''}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}

function formatActivitySlot(startsAt: string, sourceTz: string, viewerTz: string): string {
  const d = new Date(startsAt);
  const date = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: viewerTz,
  }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: viewerTz,
  }).format(d);
  return `${date} · ${time}`;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso));
}

function dashboardStats(slots: TimeSlot[]) {
  return slots.reduce(
    (acc, slot) => {
      acc.total += 1;
      if (slot.state === 'open') acc.open += 1;
      if (slot.state === 'booked') acc.booked += 1;
      if (slot.state === 'closed') acc.closed += 1;
      return acc;
    },
    { open: 0, booked: 0, closed: 0, total: 0 },
  );
}

function statusLabel(status: AdminDashboardResponse['event']['status']): string {
  if (status === 'active') return 'Active';
  if (status === 'archived') return 'Archived';
  return 'Deleted';
}

function formFromEvent(dashboard: AdminDashboardResponse): EventForm {
  return {
    title: dashboard.event.title,
    description: dashboard.event.description ?? '',
    organizerName: dashboard.event.organizerName,
    organizerEmail: dashboard.event.organizerEmail,
  };
}

function buildEventPatch(form: EventForm, dashboard: AdminDashboardResponse): AdminEventPatch {
  const patch: AdminEventPatch = {};
  const title = form.title.trim();
  const description = form.description.trim();
  const organizerName = form.organizerName.trim();
  const organizerEmail = form.organizerEmail.trim();

  if (title !== dashboard.event.title) patch.title = title;
  if (description !== (dashboard.event.description ?? '')) patch.description = description;
  if (organizerName !== dashboard.event.organizerName) patch.organizerName = organizerName;
  if (organizerEmail !== dashboard.event.organizerEmail) patch.organizerEmail = organizerEmail;
  return patch;
}

function formatBillingDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function formatSlotWindow(startsAt: string, endsAt: string, timezone: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const date = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: timezone,
  }).format(start);
  return `${date} · ${formatTimeInTz(start, timezone)}-${formatTimeInTz(end, timezone)} ${formatTzAbbrev(start, timezone)}`;
}
