import type { ReactNode } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  ArrowRight,
  BadgeDollarSign,
  Calendar,
  CalendarClock,
  Check,
  CreditCard,
  FileDown,
  Globe2,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { navigate } from '../lib/routing';
import { preloadAuthPage, preloadBookingPage, preloadDetailsStep } from '../lib/routePreload';
import { Avatar } from '../components/Avatar';

/* ─── PricingPage ─────────────────────────────────────────
 * The /pricing page is mytimes' main conversion surface.
 *
 * Architecture:
 *  1. Hero (60/40) — title + CTAs on the left, real product
 *     link cards on the right so the buyer literally sees the
 *     public link + admin link workflow.
 *  2. Comparison table — two price-headers across the top
 *     (Free / Company), then a single feature matrix below.
 *  3. Trust strip — three calm reassurances.
 *  4. FAQ — native <details> accordions on peach surface.
 *  5. Founder note — DiceBear avatar + signed paragraph.
 *  6. The Model + Operating Mode — preserved from the
 *     previous version as the philosophy and infrastructure
 *     blocks (we still want the principled prose, we just
 *     don't want it to be the whole page).
 *
 * The peach editorial vocabulary survives: hsla(28,100%,97%)
 * surfaces, warm orange-tinted borders, mono numerals for
 * prices and counts, display font tight at 32–48px (NOT 80px+).
 */

type Tier = {
  key: 'free' | 'company';
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  cta: string;
  ctaVariant: 'ghost' | 'primary' | 'secondary';
  onSelect: () => void;
  onPreload?: () => void;
  badge?: string;
  highlighted?: boolean;
  priceAnchor?: string;
  foundingNote?: string;
  mobileFeatures: string[];
};

const tiers: Tier[] = [
  {
    key: 'free',
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    blurb: 'For individuals running small interview rounds.',
    cta: 'Create free board',
    ctaVariant: 'ghost',
    onSelect: () => navigate('/new'),
    onPreload: () => void preloadDetailsStep(),
    mobileFeatures: [
      '2 active boards',
      '25 bookings per board',
      '60 published slots',
      '60-day active window',
      'Per-board CSV export',
    ],
  },
  {
    key: 'company',
    name: 'Company',
    price: '$480',
    cadence: 'per year',
    foundingNote: '$49 monthly available · locked while active',
    blurb: 'For teams running repeated interview rounds.',
    cta: 'Start company workspace',
    ctaVariant: 'primary',
    onSelect: () => navigate('/signup'),
    onPreload: () => void preloadAuthPage(),
    mobileFeatures: [
      'Unlimited boards, fair use',
      '10 organizer seats',
      'Team templates',
      'Cross-event CSV export',
      'Custom company subdomain',
    ],
  },
];

/* Comparison matrix. A cell can be:
 *  · 'check'    → small lucide Check, orange-tinted
 *  · 'dash'     → muted middot for "not included"
 *  · 'value'    → quantitative text in mono numerals
 *  · 'text'     → short qualifier in default body font */
type Cell =
  | { kind: 'check' }
  | { kind: 'dash' }
  | { kind: 'value'; value: string }
  | { kind: 'text'; value: string };

const featureRows: { feature: string; cells: [Cell, Cell] }[] = [
  {
    feature: 'Active boards',
    cells: [
      { kind: 'value', value: '2' },
      { kind: 'text', value: 'Unlimited' },
    ],
  },
  {
    feature: 'Bookings per board',
    cells: [
      { kind: 'value', value: '25' },
      { kind: 'text', value: 'Unlimited' },
    ],
  },
  {
    feature: 'Published slots',
    cells: [
      { kind: 'value', value: '60' },
      { kind: 'text', value: 'Unlimited' },
    ],
  },
  {
    feature: 'Active window',
    cells: [
      { kind: 'value', value: '60 days' },
      { kind: 'value', value: '12 months' },
    ],
  },
  {
    feature: 'Per-board CSV export',
    cells: [
      { kind: 'check' },
      { kind: 'check' },
    ],
  },
  {
    feature: 'Cross-board CSV export',
    cells: [
      { kind: 'dash' },
      { kind: 'check' },
    ],
  },
  {
    feature: 'Email confirmations',
    cells: [
      { kind: 'check' },
      { kind: 'check' },
    ],
  },
  {
    feature: 'Admin link recovery',
    cells: [{ kind: 'check' }, { kind: 'text', value: 'Company-wide' }],
  },
  {
    feature: 'Organizer seats',
    cells: [
      { kind: 'value', value: '1' },
      { kind: 'value', value: '10' },
    ],
  },
  {
    feature: 'Custom company subdomain',
    cells: [{ kind: 'dash' }, { kind: 'check' }],
  },
  {
    feature: 'Made with mytimes footer',
    cells: [{ kind: 'text', value: 'Shown' }, { kind: 'text', value: 'Removed' }],
  },
];

const trustItems = [
  {
    icon: <ShieldCheck size={14} strokeWidth={1.8} aria-hidden="true" />,
    label: "14-day refund if your first Company cycle doesn't run an event",
  },
  {
    icon: <CreditCard size={14} strokeWidth={1.8} aria-hidden="true" />,
    label: 'No card stored until purchase',
  },
  {
    icon: <Calendar size={14} strokeWidth={1.8} aria-hidden="true" />,
    label: 'Cancel anytime. Your boards stay live to their expiry',
  },
];

const faqs: { q: string; a: ReactNode }[] = [
  {
    q: 'What counts as a "board"?',
    a: (
      <>
        A board is one event: one interview round, one batch of vendor calls,
        one set of office hours. Each board has its own public link, its own
        admin link, its own slot list.
      </>
    ),
  },
  {
    q: "What if my team doesn't run an event after subscribing?",
    a: (
      <>
        Ask within 14 days of the first Company billing cycle and we'll refund
        it if the workspace has not run a live board.
      </>
    ),
  },
  {
    q: 'Can I upgrade later if I hit my free limits?',
    a: (
      <>
        Yes. Board-level limits offer a one-time in-app unlock for that specific
        board. Public pricing stays focused on Free versus Company so the choice
        remains simple.
      </>
    ),
  },
  {
    q: 'Do participants need an account?',
    a: (
      <>
        Never. Participants click your link, pick a time, and confirm. We
        collect their name and email so we can send the confirmation. Nothing
        else. No calendar OAuth, no analytics, no marketing email.
      </>
    ),
  },
  {
    q: 'Can I use a custom domain?',
    a: (
      <>
        Yes, on Company. Start with a participant-facing domain like
        book.company.com while admin, login, and billing stay on mytimes.co.
      </>
    ),
  },
  {
    q: 'What happens if I cancel Company?',
    a: (
      <>
        Your workspace remains available through the current billing period.
        After the subscription lapses, new boards use Free limits and the locked
        founding rate no longer applies to a future resubscribe.
      </>
    ),
  },
  {
    q: 'How does founding pricing work?',
    a: (
      <>
        The price you sign up at stays locked while the subscription remains
        active. If it lapses and you resubscribe later, the current public rate
        applies.
      </>
    ),
  },
];

/* ─── Route-level head ─────────────────────────────────────
 * Page-specific overrides on top of the site-wide defaults
 * in index.html. The JSON-LD describes both tiers as Offers
 * inside a single Product so search engines can read the
 * pricing table directly. The freeware tier is exposed as a
 * separate Offer (price 0) so it's surfaced honestly. */
const PRICING_TITLE = 'Pricing — mytimes';
const PRICING_DESCRIPTION =
  'Free for small interview rounds. $480 a year (or $49 a month) for a Company workspace with shared recovery, custom subdomain, and 10 organizer seats.';
const PRICING_URL = 'https://mytimes.co/pricing';

const PRICING_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'mytimes',
  description:
    'Booking boards for one-off interview rounds, candidate demos, and vendor calls.',
  brand: {
    '@type': 'Brand',
    name: 'mytimes',
  },
  url: PRICING_URL,
  offers: [
    {
      '@type': 'Offer',
      name: 'Free',
      description:
        'For individuals running small interview rounds. Two active boards, 25 bookings per board, 60-day active window.',
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      url: 'https://mytimes.co/new',
    },
    {
      '@type': 'Offer',
      name: 'Company',
      description:
        'Workspace mode for teams running repeated interview rounds. Unlimited boards, 10 organizer seats, custom subdomain, 12-month active window.',
      price: '480',
      priceCurrency: 'USD',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: '480',
        priceCurrency: 'USD',
        billingDuration: 'P1Y',
        unitText: 'YEAR',
      },
      availability: 'https://schema.org/InStock',
      url: 'https://mytimes.co/signup',
    },
  ],
};

export function PricingPage() {
  return (
    <div className="pricing-page">
      <Helmet>
        <title>{PRICING_TITLE}</title>
        <meta name="description" content={PRICING_DESCRIPTION} />
        <link rel="canonical" href={PRICING_URL} />
        <meta property="og:title" content={PRICING_TITLE} />
        <meta property="og:description" content={PRICING_DESCRIPTION} />
        <meta property="og:url" content={PRICING_URL} />
        <meta property="og:type" content="website" />
        <meta name="twitter:title" content={PRICING_TITLE} />
        <meta name="twitter:description" content={PRICING_DESCRIPTION} />
        <script type="application/ld+json">
          {JSON.stringify(PRICING_JSON_LD)}
        </script>
      </Helmet>
      {/* ─── A · Hero (60/40 split) ─────────────────────── */}
      <section className="pricing-hero">
        <div className="pricing-hero__copy">
          <p className="pricing-hero__eyebrow">
            <span>Pricing</span> · for one-off interview rounds
          </p>
          <h1 className="pricing-hero__title">Free for small rounds. Company for repeat hiring.</h1>
          <p className="pricing-hero__body">
            Run small interview boards for free. Subscribe when your team wants
            mytimes always available with shared recovery, branding, and billing.
          </p>
          <div className="pricing-hero__actions">
            <button
              type="button"
              className="pricing-button pricing-button--primary"
              onPointerEnter={() => void preloadDetailsStep()}
              onFocus={() => void preloadDetailsStep()}
              onClick={() => navigate('/new')}
            >
              Create a board <ArrowRight size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="pricing-button pricing-button--ghost"
              onPointerEnter={() => void preloadBookingPage()}
              onFocus={() => void preloadBookingPage()}
              onClick={() => navigate('/b/preview')}
            >
              View demo board <ArrowRight size={14} strokeWidth={2} />
            </button>
          </div>
        </div>

        <aside className="pricing-hero__companion" aria-label="What every board includes">
          <span className="pricing-hero__companion-label">
            Every board starts with two links, emailed
          </span>
          <article className="pricing-link-card">
            <span className="pricing-link-card__eyebrow">Public link</span>
            <code className="pricing-link-card__url mono">
              mytimes.co/b/vision-2026
            </code>
            <p className="pricing-link-card__hint">Share with candidates.</p>
          </article>
          <article className="pricing-link-card pricing-link-card--admin">
            <span className="pricing-link-card__eyebrow">
              <ShieldCheck size={11} strokeWidth={1.8} aria-hidden="true" />
              Admin link · keep private
            </span>
            <code className="pricing-link-card__url mono">
              mytimes.co/admin/k3J9-2Xm-4Tn8
            </code>
            <p className="pricing-link-card__hint">
              The only way to manage this board. Save it.
            </p>
          </article>
          <p className="pricing-hero__companion-foot">Participants never make accounts.</p>
        </aside>
      </section>

      {/* ─── B · Comparison table ───────────────────────── */}
      <section className="pricing-compare" aria-label="Plan comparison">
        <header className="pricing-compare__heads">
          <div className="pricing-compare__feature-head">
            <span className="pricing-compare__feature-head-eyebrow">
              Pick your plan
            </span>
            <h2 className="pricing-compare__feature-head-title">
              What you get,<br />line by line.
            </h2>
            <p className="pricing-compare__feature-head-body">
              Same booking experience in every plan. The difference is how many
              rounds you run and how many of you run them.
            </p>
          </div>
          {tiers.map((tier) => (
            <PriceHead key={tier.key} tier={tier} />
          ))}
        </header>

        <div className="pricing-compare__matrix" role="table" aria-label="Feature comparison">
          <span className="pricing-compare__section-label" role="rowheader">
            What's included
          </span>
          {featureRows.map((row) => (
            <div key={row.feature} className="pricing-compare__row" role="row">
              <div className="pricing-compare__feature" role="rowheader">
                {row.feature}
              </div>
              {row.cells.map((cell, i) => (
                <CompareCell key={i} cell={cell} highlighted={tiers[i].highlighted} />
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ─── D · Trust strip ────────────────────────────── */}
      <section className="pricing-trust" aria-label="Trust signals">
        {trustItems.map((item, idx) => (
          <span key={item.label} className="pricing-trust__item">
            <span className="pricing-trust__icon">{item.icon}</span>
            <span>{item.label}</span>
            {idx < trustItems.length - 1 && (
              <span className="pricing-trust__sep" aria-hidden="true">
                ·
              </span>
            )}
          </span>
        ))}
      </section>

      <section className="pricing-domain" aria-label="Custom domain upsell">
        <div className="pricing-domain__copy">
          <span className="pricing-section-label">Team-only domain</span>
          <h2>Use your own booking address when mytimes becomes company infrastructure.</h2>
          <p>
            Custom domains belong in Company because they carry DNS setup,
            support, and trust. Participant links feel internal and reusable
            across every round.
          </p>
        </div>
        <div className="pricing-domain__card">
          <span>
            <Globe2 size={14} strokeWidth={1.8} aria-hidden="true" />
            Participant link
          </span>
          <strong className="mono">book.company.com/senior-engineer</strong>
          <small>Admin and billing remain on mytimes.co for simpler account recovery.</small>
        </div>
      </section>

      {/* ─── C · FAQ ────────────────────────────────────── */}
      <section className="pricing-faq" aria-label="Frequently asked questions">
        <div className="pricing-faq__head">
          <span className="pricing-section-label">FAQ</span>
          <h2>The questions buyers ask before paying.</h2>
        </div>
        <div className="pricing-faq__list">
          {faqs.map((faq) => (
            <details key={faq.q} className="pricing-faq__item">
              <summary className="pricing-faq__summary">
                <span>{faq.q}</span>
                <span className="pricing-faq__chevron" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="pricing-faq__answer">{faq.a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* ─── Founder note ───────────────────────────────── */}
      <section className="pricing-founder" aria-label="A note from the founder">
        <Avatar
          seed="james.miller@mytimes.co"
          style="notionists"
          size={56}
        />
        <div className="pricing-founder__copy">
          <p>
            "I built mytimes after watching recruiting friends fight Calendly
            setup five times in a row. The pricing is the pricing: free when
            the board is small, flat when the company repeats the job. No
            per-seat math before you have a real team."
          </p>
          <p className="pricing-founder__sign">
            James Miller, founder ·{' '}
            <a
              className="pricing-founder__email mono"
              href="mailto:hello@mytimes.co"
            >
              hello@mytimes.co
            </a>
          </p>
        </div>
      </section>

      {/* ─── The Model (preserved philosophy) ───────────── */}
      <section className="pricing-positioning" aria-label="Pricing model">
        <div className="pricing-positioning__copy">
          <span className="pricing-section-label">The model</span>
          <h2>Do not sell Company as more events.</h2>
          <p>
            Free is the individual workflow. Company buys operational quiet:
            no repeated approvals, no scattered admin links, no per-round
            payment decision.
          </p>
        </div>
        <div
          className="pricing-positioning__ledger"
          aria-label="Pricing summary"
        >
          <span>One small proof board</span>
          <strong className="mono">$0</strong>
          <span>Always-on company workspace</span>
          <strong className="mono">$49/mo</strong>
          <span>Annual company workspace</span>
          <strong className="mono">$480/yr</strong>
        </div>
      </section>

      {/* ─── Operating Mode (preserved as final infrastructure block) ── */}
      <section className="pricing-operating">
        <div className="pricing-operating__header">
          <span className="pricing-section-label">Operating mode</span>
          <h2>
            Company should feel like infrastructure, not a bulk
            discount.
          </h2>
        </div>
        <div className="pricing-operating__grid">
          <article>
            <CalendarClock size={17} strokeWidth={1.8} aria-hidden="true" />
            <strong>Recurring hiring cycles</strong>
            <span>
              Boards can be created whenever the team needs a new round.
            </span>
          </article>
          <article>
            <WalletCards size={17} strokeWidth={1.8} aria-hidden="true" />
            <strong>Fewer billing interruptions</strong>
            <span>
              One subscription replaces one-off checkout decisions for every
              round.
            </span>
          </article>
          <article>
            <FileDown size={17} strokeWidth={1.8} aria-hidden="true" />
            <strong>Company memory</strong>
            <span>
              Templates, exports, branding, retention, and recovery belong at
              workspace level.
            </span>
          </article>
        </div>
      </section>

      {/* ─── Final tail CTA ─────────────────────────────── */}
      <section className="pricing-final">
        <BadgeDollarSign size={20} strokeWidth={1.8} aria-hidden="true" />
        <h2>Start free. Charge only when the round has real weight.</h2>
        <p>
          The pricing should make the product useful for one round and
          dependable for teams that repeat the job.
        </p>
        <button
          type="button"
          className="pricing-button pricing-button--primary"
          onPointerEnter={() => void preloadDetailsStep()}
          onFocus={() => void preloadDetailsStep()}
          onClick={() => navigate('/new')}
        >
          Create your first board <ArrowRight size={16} strokeWidth={2} />
        </button>
      </section>
    </div>
  );
}

/* ─── PriceHead — top-of-column header for each tier ───── */
function PriceHead({ tier }: { tier: Tier }) {
  const className = [
    'pricing-head',
    tier.highlighted ? 'pricing-head--highlighted' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const buttonClass = [
    'pricing-head__cta',
    tier.ctaVariant === 'primary' ? 'pricing-head__cta--primary' : '',
    tier.ctaVariant === 'ghost' ? 'pricing-head__cta--ghost' : '',
    tier.ctaVariant === 'secondary' ? 'pricing-head__cta--secondary' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={className}>
      {tier.badge && (
        <span className="pricing-head__badge">{tier.badge}</span>
      )}
      <span className="pricing-head__name">{tier.name}</span>
      <div className="pricing-head__price">
        {tier.priceAnchor && (
          <s className="pricing-head__price-anchor mono">{tier.priceAnchor}</s>
        )}
        <strong className="mono">{tier.price}</strong>
        <span>{tier.cadence}</span>
      </div>
      {tier.foundingNote && (
        <span className="pricing-head__founding-note">{tier.foundingNote}</span>
      )}
      <p className="pricing-head__blurb">{tier.blurb}</p>
      <ul className="pricing-head__mobile-features" aria-label={`${tier.name} included features`}>
        {tier.mobileFeatures.map((feature) => (
          <li key={feature}>
            <Check size={13} strokeWidth={2.2} aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={buttonClass}
        onPointerEnter={tier.onPreload}
        onFocus={tier.onPreload}
        onClick={tier.onSelect}
      >
        {tier.cta} <ArrowRight size={14} strokeWidth={2} />
      </button>
    </article>
  );
}

/* ─── CompareCell — renders one cell of the feature matrix.
 *  - 'check' is the small lucide Check, orange-tinted.
 *  - 'dash' is a muted middot — never "No" or red ✗.
 *  - 'value' uses mono numerals for quantitative content.
 *  - 'text' uses default body font for short qualifiers. */
function CompareCell({
  cell,
  highlighted,
}: {
  cell: Cell;
  highlighted?: boolean;
}) {
  const className = [
    'pricing-compare__cell',
    highlighted ? 'pricing-compare__cell--highlighted' : '',
  ]
    .filter(Boolean)
    .join(' ');
  if (cell.kind === 'check') {
    return (
      <div className={className} role="cell">
        <Check
          size={15}
          strokeWidth={2.2}
          aria-label="Included"
          className="pricing-compare__check"
        />
      </div>
    );
  }
  if (cell.kind === 'dash') {
    return (
      <div className={className} role="cell">
        <span className="pricing-compare__dash" aria-label="Not included">
          ·
        </span>
      </div>
    );
  }
  if (cell.kind === 'value') {
    return (
      <div className={className} role="cell">
        <span className="pricing-compare__value mono">{cell.value}</span>
      </div>
    );
  }
  return (
    <div className={className} role="cell">
      <span className="pricing-compare__text">{cell.value}</span>
    </div>
  );
}
