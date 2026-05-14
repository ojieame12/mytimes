import { useEffect, useState } from 'react';
import { Copy, Check, KeyRound } from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { navigate } from '../../lib/routing';
import { useWizardDraft } from '../../lib/wizard';
import {
  ApiClientError,
  clearStoredCreatedEvent,
  createAdminEventPassCheckout,
  type CreateEventResponse,
  readBillingReadiness,
  readStoredCreatedEvent,
} from '../../lib/api';

/* ─── Step 4 — /new/done ───────────────────────────────
 * The success page. Shows the public + admin URLs (admin
 * is masked by default with a one-time-reveal warning).
 * The review step stores the one-time API response in session
 * storage before navigating here.
 *
 * Variant detection — `free` vs `paid` ($19 board unlock):
 * We read `?paid=1` from the URL. Earlier wizard steps (or the
 * checkout return URL) will set this query param in a future
 * commit. URL-based detection keeps the wizard draft schema
 * unchanged and lets the backend / payment redirect drive it
 * without bumping the WizardDraft version. Default is `free`. */

type DoneVariant = 'free' | 'paid';

function readVariantFromUrl(): DoneVariant {
  if (typeof window === 'undefined') return 'free';
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('paid') === '1' ? 'paid' : 'free';
  } catch {
    return 'free';
  }
}

interface DoneStepProps {
  variant?: DoneVariant;
}

export function DoneStep({ variant: variantProp }: DoneStepProps = {}) {
  const { draft, reset } = useWizardDraft();
  const created = readStoredCreatedEvent();
  const variant: DoneVariant = variantProp ?? readVariantFromUrl();
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | undefined>();
  const [billingReady, setBillingReady] = useState<boolean | undefined>();

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

  if (!created) {
    return (
      <AppShell>
        <div className="done-shell">
          <section className="done-hero">
            <img
              className="done-hero__vignette"
              src="/assets/bg/vignette-laptop-only.png"
              alt=""
            />
            <p className="done-hero__eyebrow">
              <span>NOTHING POSTED YET</span>
            </p>
            <h1 className="done-hero__title">No posted board found.</h1>
            <p className="done-hero__body">
              Post a board from the review step to get public and admin links.
            </p>
          </section>
          <div className="done-actions">
            <button
              type="button"
              className="done-actions__primary"
              onClick={() => navigate('/new')}
            >
              Create a board →
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  const organizerEmail = created.event.organizerEmail || draft.organizerEmail;
  const isPaid =
    variant === 'paid' ||
    (created.event.paymentStatus === 'paid' &&
      (created.event.planKey === 'event_pass' || created.event.planKey === 'company_standby'));
  const postedEyebrow = isPaid
    ? created.event.planKey === 'company_standby'
      ? 'POSTED · COMPANY'
      : 'POSTED · UNLOCKED'
    : 'POSTED';

  const startEventPassCheckout = async () => {
    if (checkoutBusy) return;
    if (billingReady === false) {
      setCheckoutError('Payments are not active yet. Add the Stripe secret and webhook secret on Railway first.');
      return;
    }
    const adminToken = tokenFromAdminURL(created.links.admin);
    if (!adminToken) {
      setCheckoutError('Could not find the admin token for this board.');
      return;
    }

    setCheckoutBusy(true);
    setCheckoutError(undefined);
    try {
      const checkout = await createAdminEventPassCheckout(adminToken);
      window.location.assign(checkout.url);
    } catch (error) {
      setCheckoutError(
        error instanceof ApiClientError
          ? billingErrorMessage(error)
          : 'Could not start checkout.',
      );
    } finally {
      setCheckoutBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="done-shell">
        <section className="done-hero">
          <img
            className="done-hero__vignette"
            src="/assets/bg/vignette-laptop-only.png"
            alt=""
          />
          <p className="done-hero__eyebrow">
            <span>{postedEyebrow}</span>
          </p>
          <h1 className="done-hero__title">Your board is live.</h1>
          <p className="done-hero__body">
            Share the public link with your participants. Keep the admin link
            safe. We'll only show it once.
          </p>
        </section>

        {isPaid && (
          <PaidStatusCard event={created.event} email={organizerEmail} />
        )}

        {!isPaid && (
          <EventPassUpgradeCard
            busy={checkoutBusy}
            billingReady={billingReady}
            error={checkoutError}
            slotCount={created.event.slotCount}
            onUpgrade={() => void startEventPassCheckout()}
          />
        )}

        <DoneLinkCard
          variant="public"
          eyebrow="PUBLIC LINK · share with participants"
          url={created.links.public}
          openLabel="Open"
        />

        <DoneLinkCard
          variant="secret"
          eyebrow="ADMIN LINK · keep private"
          url={created.links.admin}
          openLabel="Open admin"
          warning="This is the only time we'll show this URL. Save it now. Anyone with this link can manage every booking."
        />

        <AccessCallout email={organizerEmail} isPaid={isPaid} />

        {/* Suggested participant invitation — pre-written message
            tied to the public link. Per UX direction: the organizer's
            real next step is "send the invite," not "copy link." */}
        <SuggestedMessageCard
          eventTitle={created.event.title || draft.title}
          publicUrl={created.links.public}
          organizerName={created.event.organizerName || draft.organizerName}
        />

        <div className="done-actions">
          <button
            type="button"
            className="done-actions__ghost"
            onClick={() => {
              clearStoredCreatedEvent();
              reset();
              navigate('/new');
            }}
          >
            Create another board
          </button>
          <a
            href={created.links.public}
            target="_blank"
            rel="noreferrer"
            className="done-actions__primary"
          >
            Go to public board →
          </a>
        </div>

        {(created.event.title || draft.title) && (
          <p className="done-footnote">
            Posted · {created.event.title || draft.title} · {created.event.slotCount} slots
          </p>
        )}
      </div>
    </AppShell>
  );
}

/* ─── DoneLinkCard ───────────────────────────────────
 * Inline link-card used only on the done page. Variant
 * 'public' is a calm light card; 'secret' is the dark
 * admin treatment that mirrors landing-link-card--admin. */

interface DoneLinkCardProps {
  variant: 'public' | 'secret';
  eyebrow: string;
  url: string;
  openLabel?: string;
  warning?: string;
}

function DoneLinkCard({
  variant,
  eyebrow,
  url,
  openLabel,
  warning,
}: DoneLinkCardProps) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(variant === 'public');

  const visibleUrl = revealed ? url : maskUrl(url);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard may be unavailable — silently no-op */
    }
  };

  return (
    <section className={`link-card link-card--${variant}`}>
      <header className="link-card__head">
        <span className="link-card__eyebrow">
          <span className="link-card__eyebrow-dot" aria-hidden="true" />
          {eyebrow}
        </span>
        {variant === 'secret' && (
          <button
            type="button"
            className="link-card__btn"
            onClick={() => setRevealed((r) => !r)}
            aria-pressed={revealed}
          >
            {revealed ? 'Hide' : 'Reveal'}
          </button>
        )}
      </header>

      {warning && <p className="link-card__warning">{warning}</p>}

      <div className="link-card__row">
        <code
          className={`link-card__url${!revealed ? ' link-card__url--masked' : ''}`}
          aria-live="polite"
        >
          {visibleUrl}
        </code>
        <div className="link-card__actions">
          <button
            type="button"
            className="link-card__btn"
            onClick={copy}
            aria-live="polite"
          >
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
          {openLabel && revealed && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="link-card__btn"
            >
              {openLabel}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function maskUrl(url: string): string {
  /* Replace the path tail (the token) with bullets while
     keeping the scheme + host visible. */
  try {
    const u = new URL(url);
    const tail = u.pathname.replace(/^\/[^/]+\//, '');
    const masked = '•'.repeat(Math.max(tail.length, 12));
    return `${u.origin}${u.pathname.slice(0, u.pathname.length - tail.length)}${masked}`;
  } catch {
    return '•'.repeat(Math.max(url.length, 24));
  }
}

function tokenFromAdminURL(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    return parts[0] === 'a' ? parts[1] : undefined;
  } catch {
    return undefined;
  }
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

function EventPassUpgradeCard({
  busy,
  billingReady,
  error,
  slotCount,
  onUpgrade,
}: {
  busy: boolean;
  billingReady: boolean | undefined;
  error: string | undefined;
  slotCount: number;
  onUpgrade: () => void;
}) {
  const disabled = busy || billingReady === false;
  return (
    <section className="event-pass-card">
      <div className="event-pass-card__copy">
        <span className="event-pass-card__eyebrow">
          <span className="event-pass-card__dot" aria-hidden="true" />
          Board unlock
        </span>
        <h2 className="event-pass-card__title">Unlock this board for $19.</h2>
        <p className="event-pass-card__body">
          Upgrade this board when the round matters: 75 bookings, 200 generated
          slots, 180-day activity window, no mytimes footer, and the same private admin link.
        </p>
        <p className="event-pass-card__meta mono">
          Current board: {slotCount} {slotCount === 1 ? 'slot' : 'slots'}
        </p>
      </div>
      <div className="event-pass-card__actions">
        <button
          type="button"
          className="event-pass-card__button"
          onClick={onUpgrade}
          disabled={disabled}
        >
          {busy
            ? 'Opening Checkout.'
            : billingReady === false
              ? 'Payments not active yet'
              : 'Unlock this board: $19'}
        </button>
        {(error || billingReady === false) && (
          <p className="event-pass-card__error" aria-live="polite">
            {error ?? 'Stripe checkout is not configured on the API service yet.'}
          </p>
        )}
      </div>
    </section>
  );
}

/* ─── SuggestedMessageCard ────────────────────────────
 * Pre-written invitation the organizer can copy into Slack /
 * email / DMs. The doc highlights this as a high-leverage move:
 * the organizer's actual next step is "send the invite," not
 * "copy the link." Template is editable in the textarea before
 * copying. */

function SuggestedMessageCard({
  eventTitle,
  publicUrl,
  organizerName,
}: {
  eventTitle: string;
  publicUrl: string;
  organizerName: string;
}) {
  const firstName = (organizerName || '').split(/\s+/)[0] || 'I';
  const initial = `Hi,\n\nPlease pick one available time for ${eventTitle || 'our meeting'}:\n\n${publicUrl}\n\nThe page shows times in your local timezone. Just confirm your name and email when you pick a slot.\n\nThanks,\n${firstName}`;
  const [message, setMessage] = useState(initial);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  return (
    <section className="suggested-message">
      <header className="suggested-message__head">
        <div className="suggested-message__head-text">
          <span className="suggested-message__eyebrow">
            <span className="suggested-message__eyebrow-dot" aria-hidden="true" />
            Suggested invitation
          </span>
          <h3 className="suggested-message__title">Paste this into Slack or email.</h3>
        </div>
        <button
          type="button"
          className={`suggested-message__copy${copied ? ' is-copied' : ''}`}
          onClick={copy}
          aria-live="polite"
        >
          {copied ? (
            <>
              <Check size={14} strokeWidth={2} aria-hidden="true" />
              Copied
            </>
          ) : (
            <>
              <Copy size={14} strokeWidth={1.6} aria-hidden="true" />
              Copy message
            </>
          )}
        </button>
      </header>
      <textarea
        className="suggested-message__textarea"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={7}
        spellCheck={true}
        aria-label="Suggested participant message"
      />
      <p className="suggested-message__hint">
        Edit before copying. This is a starting point, not the final word.
      </p>
    </section>
  );
}

/* ─── PaidStatusCard (paid variants only) ─────────────────
 * Summarises the active paid capacity without inventing a
 * receipt number. Stripe remains the source for receipts. */

function PaidStatusCard({
  event,
  email,
}: {
  event: CreateEventResponse['event'];
  email: string;
}) {
  const isCompany = event.planKey === 'company_standby';
  const activeUntil = formatActiveUntil(
    event.expiresAt ? new Date(event.expiresAt) : addDays(new Date(), isCompany ? 365 : 180),
  );
  return (
    <section className="receipt-card">
      <header className="receipt-card__head">
        <span className="receipt-card__eyebrow">
          <span className="receipt-card__eyebrow-dot" aria-hidden="true" />
          {isCompany ? 'COMPANY ACTIVE' : 'BOARD UNLOCKED'}
        </span>
      </header>
      <dl className="receipt-card__table">
        <div className="receipt-card__row">
          <dt className="receipt-card__row-key">Item</dt>
          <dd className="receipt-card__row-val">
            <span className="receipt-card__row-label">
              {isCompany ? 'Company workspace board' : 'Board unlock'}
            </span>
            <span className="receipt-card__row-num">
              {isCompany ? 'Included with Company' : '$19.00'}
            </span>
          </dd>
        </div>
        <div className="receipt-card__row">
          <dt className="receipt-card__row-key">Capacity</dt>
          <dd className="receipt-card__row-val">
            <span className="receipt-card__row-num">
              {isCompany ? 'Company limits' : '75 bookings / 200 slots'}
            </span>
          </dd>
        </div>
        <div className="receipt-card__row">
          <dt className="receipt-card__row-key">Organizer</dt>
          <dd className="receipt-card__row-val">
            <span className="receipt-card__row-num">{email || 'your inbox'}</span>
          </dd>
        </div>
        <div className="receipt-card__row">
          <dt className="receipt-card__row-key">Active until</dt>
          <dd className="receipt-card__row-val">
            <span className="receipt-card__row-num">{activeUntil}</span>
          </dd>
        </div>
      </dl>
      <p className="receipt-card__sent">
        Stripe receipts are sent by email. Keep the private admin link below for this board.
      </p>
    </section>
  );
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function formatActiveUntil(d: Date): string {
  /* "12 Aug 2026" — short, unambiguous, mono-friendly */
  try {
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/* ─── AccessCallout (both variants) ──────────────────────
 * Single-line emphatic callout under the admin link card.
 * Reminds the organizer the email is the access vector
 * (passwordless). Paid path adds the admin-link recovery
 * fallback sentence. */

function AccessCallout({ email, isPaid }: { email: string; isPaid: boolean }) {
  return (
    <aside className="access-callout" role="note">
      <KeyRound size={16} strokeWidth={1.8} aria-hidden="true" className="access-callout__icon" />
      <p className="access-callout__copy">
        This email is your access. Save the admin link or bookmark it.
        There's no password.
        {isPaid && (
          <>
            {' '}
            If you lose the email, run admin-link recovery. We'll resend every
            admin link tied to{' '}
            <span className="access-callout__email">{email || 'your address'}</span>.
          </>
        )}
      </p>
    </aside>
  );
}
