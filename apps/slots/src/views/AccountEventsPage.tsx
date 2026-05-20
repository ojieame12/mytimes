import { useEffect, useState } from 'react';
import { Check, ChevronRight, Copy, ExternalLink, Plus, LogOut, Globe2, RefreshCw } from 'lucide-react';
import {
  ApiClientError,
  createCompanyStandbyCheckout,
  createCustomerPortalSession,
  getOrganizerSession,
  readAccountEvents,
  readAccountBilling,
  readAccountCustomDomain,
  readBillingReadiness,
  requestAccountCustomDomain,
  signOutOrganizer,
  verifyAccountCustomDomain,
  type AccountBillingResponse,
  type AccountEventsResponse,
  type CustomDomainSettingsResponse,
  type OrganizerSessionResponse,
} from '../lib/api';
import { navigate } from '../lib/routing';
import {
  clearCheckoutReturnParams,
  readCheckoutReturn,
  type CheckoutReturn,
} from '../lib/checkoutReturn';
import { StatusChip, type StatusChipKind } from '../components/StatusChip';
import { Avatar } from '../components/Avatar';
import {
  CheckoutReturnNotice,
  type CheckoutReturnTone,
} from '../components/CheckoutReturnNotice';

type AccountState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | {
      status: 'ready';
      session: OrganizerSessionResponse;
      events: AccountEventsResponse['events'];
      billing: AccountBillingResponse;
      customDomain: CustomDomainSettingsResponse;
    }
  | { status: 'error'; message: string };

export function AccountEventsPage() {
  const [state, setState] = useState<AccountState>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | undefined>();
  const [domainInput, setDomainInput] = useState('');
  const [domainBusy, setDomainBusy] = useState(false);
  const [domainError, setDomainError] = useState<string | undefined>();
  const [billingReady, setBillingReady] = useState<boolean | undefined>();
  const [checkoutReturn, setCheckoutReturn] = useState<CheckoutReturn | undefined>(() =>
    readCheckoutReturn(),
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const session = await getOrganizerSession();
        if (!session) {
          if (!cancelled) setState({ status: 'signed-out' });
          return;
        }
        const [response, billing, customDomain] = await Promise.all([
          readAccountEvents(),
          readAccountBilling(),
          readAccountCustomDomain(),
        ]);
        if (!cancelled) {
          setState({ status: 'ready', session, events: response.events, billing, customDomain });
        }
      } catch (error) {
        const message =
          error instanceof ApiClientError ? error.message : 'Could not load your account.';
        if (!cancelled) setState({ status: 'error', message });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signOutOrganizer();
      setState({ status: 'signed-out' });
    } finally {
      setBusy(false);
    }
  };

  const startCompanyStandbyCheckout = async (billingInterval: 'month' | 'year' = 'year') => {
    if (busy) return;
    setBusy(true);
    setCheckoutError(undefined);
    try {
      const checkout = await createCompanyStandbyCheckout(billingInterval);
      window.location.assign(checkout.url);
    } catch (error) {
      setCheckoutError(
        error instanceof ApiClientError
          ? billingErrorMessage(error)
          : 'Could not start company checkout.',
      );
    } finally {
      setBusy(false);
    }
  };

  const openBillingPortal = async () => {
    if (busy) return;
    if (billingReady === false) {
      setCheckoutError('Payments are not active yet. Add the Stripe secret and webhook secret on Railway first.');
      return;
    }
    setBusy(true);
    setCheckoutError(undefined);
    try {
      const portal = await createCustomerPortalSession();
      window.location.assign(portal.url);
    } catch (error) {
      setCheckoutError(
        error instanceof ApiClientError
          ? billingErrorMessage(error)
          : 'Could not open billing management.',
      );
    } finally {
      setBusy(false);
    }
  };

  const refreshAccountStatus = async () => {
    if (busy) return;
    setBusy(true);
    setCheckoutError(undefined);
    try {
      const session = await getOrganizerSession();
      if (!session) {
        setState({ status: 'signed-out' });
        return;
      }
      const [response, billing, customDomain] = await Promise.all([
        readAccountEvents(),
        readAccountBilling(),
        readAccountCustomDomain(),
      ]);
      setState({ status: 'ready', session, events: response.events, billing, customDomain });
    } catch (error) {
      setCheckoutError(
        error instanceof ApiClientError ? error.message : 'Could not refresh account billing.',
      );
    } finally {
      setBusy(false);
    }
  };

  const dismissCheckoutReturn = () => {
    clearCheckoutReturnParams();
    setCheckoutReturn(undefined);
  };

  const submitCustomDomain = async () => {
    if (domainBusy) return;
    setDomainBusy(true);
    setDomainError(undefined);
    try {
      const response = await requestAccountCustomDomain(domainInput);
      setState((current) =>
        current.status === 'ready'
          ? { ...current, customDomain: response }
          : current,
      );
      setDomainInput('');
    } catch (error) {
      setDomainError(
        error instanceof ApiClientError
          ? customDomainErrorMessage(error)
          : 'Could not request this custom domain.',
      );
    } finally {
      setDomainBusy(false);
    }
  };

  const checkCustomDomainDns = async () => {
    if (domainBusy) return;
    setDomainBusy(true);
    setDomainError(undefined);
    try {
      const response = await verifyAccountCustomDomain();
      setState((current) =>
        current.status === 'ready'
          ? { ...current, customDomain: response }
          : current,
      );
    } catch (error) {
      setDomainError(
        error instanceof ApiClientError
          ? customDomainErrorMessage(error)
          : 'Could not check DNS for this custom domain.',
      );
    } finally {
      setDomainBusy(false);
    }
  };

  if (state.status === 'loading') {
    return <AccountPlaceholder title="Loading account" body="Fetching your boards." />;
  }

  if (state.status === 'signed-out') {
    return (
      <AccountPlaceholder
        title="Sign in to view your boards"
        body="An organizer account collects every board you create, so you can find them in one place later."
        primaryLabel="Sign in"
        onPrimary={() => navigate('/signin')}
        secondaryLabel="Create account"
        onSecondary={() => navigate('/signup')}
      />
    );
  }

  if (state.status === 'error') {
    return (
      <AccountPlaceholder
        title="Account unavailable"
        body={state.message}
        primaryLabel="Try again"
        onPrimary={() => window.location.reload()}
        secondaryLabel="Sign in"
        onSecondary={() => navigate('/signin')}
      />
    );
  }

  const { session, events, billing, customDomain } = state;
  const firstName = session.user.name?.split(' ')[0] ?? 'there';
  const subscription = billing.subscription;
  const hasActiveStandby = Boolean(subscription?.active);
  const checkoutNotice = checkoutReturn
    ? accountCheckoutNotice(hasActiveStandby, checkoutReturn)
    : undefined;

  return (
    <section className="account-shell">
      {/* Identity header — same peach card vocabulary as the
       *  booking page header. Avatar right-anchored, sign-out
       *  lives in the bottom strip. */}
      <section className="account-card" aria-label="Account">
        <header className="account-card__main">
          <div className="account-card__text">
            <p className="account-card__eyebrow">
              <span>{session.user.name}</span> organizer account
            </p>
            <h1 className="account-card__title">Hello, {firstName}.</h1>
            <p className="account-card__meta mono">{session.user.email}</p>
          </div>
          <Avatar
            seed={session.user.email}
            style="notionists"
            size={44}
          />
        </header>
        <div className="account-card__strip">
          <div className="account-card__strip-left">
            <span className="account-card__strip-stat">
              <span className="account-card__strip-num mono tabular">{events.length}</span>
              <span className="account-card__strip-label">
                {events.length === 1 ? 'board' : 'boards'}
              </span>
            </span>
            <span className="account-card__strip-sep" aria-hidden="true" />
            <button
              type="button"
              className="account-card__sign-out"
              onClick={() => void signOut()}
              disabled={busy}
            >
              <LogOut size={12} strokeWidth={1.8} aria-hidden="true" />
              <span>{busy ? 'Signing out…' : 'Sign out'}</span>
            </button>
          </div>
          <button
            type="button"
            className="account-card__new"
            onClick={() => navigate('/new')}
          >
            <Plus size={14} strokeWidth={1.8} aria-hidden="true" />
            <span>New board</span>
          </button>
        </div>
      </section>

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
              ? () => void startCompanyStandbyCheckout()
              : () => void refreshAccountStatus()
          }
          onDismiss={dismissCheckoutReturn}
        />
      )}

      <section className="account-billing-card" aria-label="Company">
        <div className="account-billing-card__copy">
          <span className="account-billing-card__eyebrow">Company</span>
          <h2 className="account-billing-card__title">Keep mytimes ready for every interview round.</h2>
          <p className="account-billing-card__body">
            {hasActiveStandby
              ? standbySummary(subscription)
              : 'Start the founding Company workspace when your company wants central billing and no per-event checkout decisions. Annual is $480; monthly is $49.'}
          </p>
          {subscription && (
            <p className="account-billing-card__meta mono">
              {subscription.status}
              {subscription.currentPeriodEnd ? ` · renews ${formatBillingDate(subscription.currentPeriodEnd)}` : ''}
              {subscription.cancelAtPeriodEnd ? ' · cancellation scheduled' : ''}
            </p>
          )}
          {checkoutError && (
            <p className="account-billing-card__error" aria-live="polite">
              {checkoutError}
            </p>
          )}
          {!checkoutError && billingReady === false && (
            <p className="account-billing-card__error" aria-live="polite">
              Stripe checkout is not configured on the API service yet.
            </p>
          )}
        </div>
        <div className="account-billing-card__actions">
          <button
            type="button"
            className="account-billing-card__button"
            onClick={() => void (hasActiveStandby || billing.customer.exists ? openBillingPortal() : startCompanyStandbyCheckout('year'))}
            disabled={busy || billingReady === false || ((hasActiveStandby || billing.customer.exists) && !billing.canOpenPortal)}
          >
            {busy
              ? hasActiveStandby || billing.customer.exists
                ? 'Opening billing.'
                : 'Opening Checkout.'
              : billingReady === false
                ? 'Payments inactive'
                : hasActiveStandby || billing.customer.exists
                  ? 'Manage billing'
                  : 'Start annual: $480'}
          </button>
          {!hasActiveStandby && !billing.customer.exists && (
            <button
              type="button"
              className="account-billing-card__button account-billing-card__button--quiet"
              onClick={() => void startCompanyStandbyCheckout('month')}
              disabled={busy || billingReady === false}
            >
              Monthly: $49
            </button>
          )}
        </div>
      </section>

      <CustomDomainCard
        settings={customDomain}
        hostname={domainInput}
        busy={domainBusy}
        error={domainError}
        onHostnameChange={setDomainInput}
        onSubmit={() => void submitCustomDomain()}
        onVerify={() => void checkCustomDomainDns()}
      />

      {/* Boards list — day-band-family rows. Click a row to open
       *  its admin view. Empty state has the same calm peach
       *  panel treatment. */}
      {events.length === 0 ? (
        <section className="account-empty" aria-live="polite">
          <img
            className="account-empty__vignette"
            src="/assets/bg/vignette-laptop-only.webp"
            alt=""
            width="140"
            height="140"
            decoding="async"
          />
          <h2 className="account-empty__title">No boards yet</h2>
          <p className="account-empty__body">
            Boards you create while signed in show up here. Make your first one to
            get started. Five minutes from idea to shareable link.
          </p>
          <button
            type="button"
            className="account-card__new"
            onClick={() => navigate('/new')}
          >
            <Plus size={14} strokeWidth={1.8} aria-hidden="true" />
            <span>Create a board</span>
          </button>
        </section>
      ) : (
        <div className="account-rows" role="list">
          {events.map(({ event, slotCount, activeBookingCount }) => {
            const openSlots = Math.max(0, slotCount - activeBookingCount);
            return (
              <button
                key={event.id}
                type="button"
                role="listitem"
                className="account-row"
                onClick={() => navigate(`/account/events/${event.id}`)}
                aria-label={`Manage board: ${event.title}, ${openSlots} open of ${slotCount} slots, ${activeBookingCount} bookings`}
              >
                {/* LEFT — editorial numeral block: big open-slot count
                 *  in mono, with "open" + "of N slots" as a typographic
                 *  caption beneath. Mirrors the day-band's date block. */}
                <span className="account-row__numeral">
                  <span className="account-row__num mono tabular">
                    {openSlots}
                  </span>
                  <span className="account-row__num-label">
                    open · of <span className="mono">{slotCount}</span>
                  </span>
                </span>

                {/* CENTER — title + status */}
                <span className="account-row__body">
                  <span className="account-row__title">{event.title}</span>
                  <span className="account-row__meta-line">
                    <StatusChip kind={event.status as StatusChipKind} />
                    <span className="account-row__bookings">
                      <span className="mono tabular">{activeBookingCount}</span>
                      <span>booked</span>
                    </span>
                  </span>
                </span>

                {/* RIGHT — chevron affordance */}
                <ChevronRight
                  size={18}
                  strokeWidth={1.6}
                  aria-hidden="true"
                  className="account-row__chev"
                />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function billingErrorMessage(error: ApiClientError): string {
  if (error.code === 'billing_not_configured') {
    return 'Payments are not configured yet. Add the Stripe secret and webhook secret on Railway before taking money.';
  }
  if (error.code === 'billing_customer_not_found') {
    return 'No Stripe billing customer exists for this account yet.';
  }
  return error.message;
}

function accountCheckoutNotice(
  hasActiveStandby: boolean,
  checkoutReturn: CheckoutReturn,
): {
  tone: CheckoutReturnTone;
  eyebrow: string;
  title: string;
  body: string;
  actionLabel?: string;
  actionKind?: 'refresh' | 'checkout';
} | undefined {
  if (checkoutReturn.product === 'cancelled') {
    if (hasActiveStandby) {
      return {
        tone: 'warning',
        eyebrow: 'Checkout canceled',
        title: 'No new subscription change was made.',
        body: 'Company is already active for this account, so the workspace features remain available.',
      };
    }

    return {
      tone: 'warning',
      eyebrow: 'Checkout canceled',
      title: 'Company was not started.',
      body: 'No subscription was created. You can restart checkout when the team is ready for a shared workspace.',
      actionLabel: 'Restart checkout',
      actionKind: 'checkout',
    };
  }

  if (checkoutReturn.product !== 'company_standby') return undefined;

  if (hasActiveStandby) {
    return {
      tone: 'success',
      eyebrow: 'Company active',
      title: 'Your workspace billing is ready.',
      body: 'Team boards can now use central billing, higher limits, cross-board export, and custom domain setup from this account.',
    };
  }

  return {
    tone: 'pending',
    eyebrow: 'Checkout returned',
    title: 'Subscription status is still pending.',
    body: 'Stripe sent you back to mytimes. The webhook may still be finishing, so refresh this account before setting up company-only features.',
    actionLabel: 'Refresh status',
    actionKind: 'refresh',
  };
}

function customDomainErrorMessage(error: ApiClientError): string {
  if (error.code === 'company_standby_required') {
    return 'Custom domains are included with Company.';
  }
  if (error.code === 'custom_domain_taken') {
    return 'That hostname is already connected to another mytimes account.';
  }
  if (error.code === 'invalid_custom_domain') {
    return 'Use a subdomain like book.company.com.';
  }
  return error.message;
}

function standbySummary(subscription: AccountBillingResponse['subscription']): string {
  if (!subscription) {
    return 'Company is active for this account.';
  }
  if (subscription.cancelAtPeriodEnd) {
    return 'Company remains active until the end of the current billing period.';
  }
  return 'Company is active: high-limit boards, cross-board export, and no per-event checkout decisions.';
}

function formatBillingDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function CustomDomainCard({
  settings,
  hostname,
  busy,
  error,
  onHostnameChange,
  onSubmit,
  onVerify,
}: {
  settings: CustomDomainSettingsResponse;
  hostname: string;
  busy: boolean;
  error?: string;
  onHostnameChange: (value: string) => void;
  onSubmit: () => void;
  onVerify: () => void;
}) {
  const domain = settings.domain;
  const canSubmit = settings.eligible && hostname.trim().length > 0 && !busy;
  const activeURL = domain?.status === 'active' ? `https://${domain.hostname}` : undefined;
  const [copiedHost, setCopiedHost] = useState(false);

  const copyActiveURL = async () => {
    if (!activeURL) return;
    try {
      await navigator.clipboard.writeText(activeURL);
      setCopiedHost(true);
      window.setTimeout(() => setCopiedHost(false), 1400);
    } catch {
      // Clipboard can be blocked in some browsers. The visible URL remains selectable.
    }
  };

  return (
    <section className="account-domain-card" aria-label="Custom domain">
      <div className="account-domain-card__head">
        <span className="account-domain-card__icon" aria-hidden="true">
          <Globe2 size={16} strokeWidth={1.8} />
        </span>
        <div className="account-domain-card__copy">
          <span className="account-domain-card__eyebrow">Custom domain</span>
          <h2 className="account-domain-card__title">
            {domain ? domain.hostname : 'Use your company booking URL.'}
          </h2>
          <p className="account-domain-card__body">
            {domain
              ? domainStatusDescription(domain.status, settings.activation.automatic)
              : settings.eligible
              ? settings.activation.automatic
                ? 'Connect a subdomain such as book.company.com. Once DNS checks out, mytimes will attach it to the booking app automatically.'
                : 'Connect a subdomain such as book.company.com. DNS can be verified here, then the final Railway domain attachment can be completed once the records resolve.'
              : 'Included with Company for teams that want a permanent booking URL.'}
          </p>
        </div>
        {domain && <span className="account-domain-card__status mono">{domainStatusLabel(domain.status)}</span>}
      </div>

      {activeURL && (
        <div className="account-domain-card__active">
          <div className="account-domain-card__active-copy">
            <span>Public booking host</span>
            <code>{activeURL}</code>
          </div>
          <div className="account-domain-card__active-actions">
            <button
              type="button"
              className="account-domain-card__mini-action"
              onClick={() => void copyActiveURL()}
            >
              {copiedHost ? (
                <Check size={13} strokeWidth={1.9} aria-hidden="true" />
              ) : (
                <Copy size={13} strokeWidth={1.8} aria-hidden="true" />
              )}
              <span>{copiedHost ? 'Copied' : 'Copy host'}</span>
            </button>
            <a
              className="account-domain-card__mini-action"
              href={activeURL}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={13} strokeWidth={1.8} aria-hidden="true" />
              <span>Open</span>
            </a>
          </div>
        </div>
      )}

      {settings.eligible ? (
        <>
          <div className="account-domain-card__form">
            <input
              className="account-domain-card__input"
              type="text"
              inputMode="url"
              placeholder={domain?.hostname ?? 'book.company.com'}
              value={hostname}
              onChange={(event) => onHostnameChange(event.target.value)}
              disabled={busy}
              aria-label={domain ? 'Change custom domain hostname' : 'Custom domain hostname'}
            />
            <button
              type="button"
              className="account-domain-card__button"
              onClick={onSubmit}
              disabled={!canSubmit}
            >
              {busy ? 'Saving.' : domain ? 'Change domain' : 'Request domain'}
            </button>
          </div>

          {domain && (
            <div className="account-domain-card__dns">
              <DnsRow label="TXT name" value={domain.verification.name} />
              <DnsRow label="TXT value" value={domain.verification.value} />
              <DnsRow label="CNAME name" value={domain.routing.name} />
              <DnsRow label="CNAME value" value={domain.routing.value} />
              <p className="account-domain-card__hint">
                Cloudflare note: keep the CNAME set to DNS only while mytimes verifies and activates this host.
              </p>
              {domain.lastCheckError && (
                <p className="account-domain-card__error">{domain.lastCheckError}</p>
              )}
              <button
                type="button"
                className="account-domain-card__verify"
                onClick={onVerify}
                disabled={busy}
              >
                <RefreshCw size={13} strokeWidth={1.8} aria-hidden="true" />
                <span>{busy ? 'Checking DNS.' : 'Check DNS'}</span>
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="account-domain-card__locked">
          Start Company before requesting a custom booking domain.
        </p>
      )}

      {error && <p className="account-domain-card__error" aria-live="polite">{error}</p>}
    </section>
  );
}

function DnsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="account-domain-card__dns-row">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}

function domainStatusLabel(status: NonNullable<CustomDomainSettingsResponse['domain']>['status']): string {
  if (status === 'active') return 'Active';
  if (status === 'verified_dns') return 'DNS verified';
  if (status === 'rejected') return 'Needs review';
  return 'Pending DNS';
}

function domainStatusDescription(
  status: NonNullable<CustomDomainSettingsResponse['domain']>['status'],
  automaticActivation: boolean,
): string {
  if (status === 'active') {
    return 'New public booking links and participant manage links use this host. Admin and billing links stay on the main mytimes app.';
  }
  if (status === 'verified_dns') {
    return automaticActivation
      ? 'DNS is verified. mytimes is attaching this host to the booking app.'
      : 'DNS is verified. mytimes still needs to attach this host to the Railway frontend before it becomes active.';
  }
  if (status === 'rejected') {
    return 'This request needs review before it can be used for booking links.';
  }
  return 'Add these DNS records with your domain provider, then check DNS again.';
}

/* ─── AccountPlaceholder ─────────────────────────────────
 *  Shared empty / loading / signed-out / error surface. Same
 *  peach card material as the main account-card. */
function AccountPlaceholder({
  title,
  body,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
}: {
  title: string;
  body: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
}) {
  return (
    <section className="account-shell">
      <section className="account-placeholder" aria-live="polite">
        <h1 className="account-placeholder__title">{title}</h1>
        <p className="account-placeholder__body">{body}</p>
        {(primaryLabel || secondaryLabel) && (
          <div className="account-placeholder__actions">
            {primaryLabel && onPrimary && (
              <button
                type="button"
                className="material-stamp-dark is-md"
                onClick={onPrimary}
              >
                {primaryLabel}
              </button>
            )}
            {secondaryLabel && onSecondary && (
              <button
                type="button"
                className="material-stamp-light is-md"
                onClick={onSecondary}
              >
                {secondaryLabel}
              </button>
            )}
          </div>
        )}
      </section>
    </section>
  );
}
