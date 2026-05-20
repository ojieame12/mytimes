import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  ArrowRight,
  Archive,
  BadgeDollarSign,
  CalendarCheck,
  Check,
  Clock,
  ClipboardList,
  Copy,
  Download,
  FileDown,
  Globe2,
  ShieldCheck,
  Mail,
  KeyRound,
  LockKeyhole,
  ReceiptText,
  RefreshCw,
  Send,
  SlidersHorizontal,
  UserCheck,
} from 'lucide-react';
import { navigate } from '../lib/routing';
import { preloadBookingPage, preloadDetailsStep } from '../lib/routePreload';
import { BookingHeaderCard } from '../components/BookingHeaderCard';
import { TimezonePicker } from '../components/TimezonePicker';
import { MOCK_EVENT, MOCK_SLOTS } from '../lib/mockData';

/* ─── LandingPage ─────────────────────────────────────────
 * The landing is its own surface, but its job is to PROVE the
 * product. So we render real booking-page DOM inline as the
 * demo, not a cartoon. Editorial sections below pair prose
 * with additional real product snippets. */

/* ─── Route-level head ─────────────────────────────────────
 * The site-wide defaults in apps/slots/index.html already
 * cover the global title, brand OG, Organization, and
 * SoftwareApplication JSON-LD. Here we override the bits
 * that are page-specific, plus add a WebPage schema that
 * names this URL as the entry point. */
const LANDING_TITLE = 'mytimes — Scheduling for one-off interview rounds';
const LANDING_DESCRIPTION =
  'One-off interview rounds, candidate demos, and vendor calls. Fixed times, one shareable link. No participant accounts, no calendar OAuth. Live in five minutes.';
const LANDING_URL = 'https://mytimes.co/';
const US_DEMO_TIMEZONES = [
  'America/Los_Angeles',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'UTC',
];

const LANDING_JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': LANDING_URL,
      url: LANDING_URL,
      name: LANDING_TITLE,
      description: LANDING_DESCRIPTION,
      inLanguage: 'en',
      isPartOf: { '@id': 'https://mytimes.co/#website' },
      primaryImageOfPage: 'https://mytimes.co/og-image.png',
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: LANDING_URL,
        },
      ],
    },
  ],
};

function useLandingMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.landing');
    if (!root) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const revealNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));

    const scrollToHash = () => {
      const targetId = window.location.hash.slice(1);
      if (!targetId) return;

      const target = document.getElementById(targetId);
      if (!target || !root.contains(target)) return;

      target.scrollIntoView({
        block: 'start',
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    };

    window.requestAnimationFrame(scrollToHash);
    window.addEventListener('hashchange', scrollToHash);

    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      revealNodes.forEach((node) => node.classList.add('is-revealed'));
      return () => window.removeEventListener('hashchange', scrollToHash);
    }

    root.classList.add('landing--motion-ready');

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      },
      {
        rootMargin: '0px 0px -16% 0px',
        threshold: 0.16,
      },
    );

    window.requestAnimationFrame(() => {
      revealNodes.forEach((node) => observer.observe(node));
    });

    return () => {
      observer.disconnect();
      root.classList.remove('landing--motion-ready');
      window.removeEventListener('hashchange', scrollToHash);
    };
  }, []);
}

export function LandingPage() {
  useLandingMotion();

  return (
    <div className="landing">
      <Helmet>
        <title>{LANDING_TITLE}</title>
        <meta name="description" content={LANDING_DESCRIPTION} />
        <link rel="canonical" href={LANDING_URL} />
        <meta property="og:title" content={LANDING_TITLE} />
        <meta property="og:description" content={LANDING_DESCRIPTION} />
        <meta property="og:url" content={LANDING_URL} />
        <meta property="og:type" content="website" />
        <meta name="twitter:title" content={LANDING_TITLE} />
        <meta name="twitter:description" content={LANDING_DESCRIPTION} />
        <script type="application/ld+json">
          {JSON.stringify(LANDING_JSON_LD)}
        </script>
      </Helmet>
      {/* ─── Hero — specific to the wedge, not generic SaaS ─── */}
      <section className="landing-hero">
        <p className="landing-hero__eyebrow">
          <span>For interview rounds</span> · candidate demos · vendor calls
        </p>
        {/* Phrase blocks keep the headline breaks stable across viewports. */}
        <h1 className="landing-hero__title">
          <span>Your interview round,</span>{' '}
          <span>on a single page.</span>
        </h1>
        <p className="landing-hero__body">
          Fixed times, one shareable link. No participant accounts,
          no calendar OAuth, no rules engine to configure. Send it to ten
          candidates and let them pick. Five minutes from idea to live link.
        </p>
        <div className="landing-hero__cta">
          <button
            type="button"
            className="landing-hero__primary"
            onPointerEnter={() => void preloadDetailsStep()}
            onFocus={() => void preloadDetailsStep()}
            onClick={() => navigate('/new')}
          >
            Create your board <ArrowRight size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="landing-hero__ghost"
            onPointerEnter={() => void preloadBookingPage()}
            onFocus={() => void preloadBookingPage()}
            onClick={() => navigate('/b/preview')}
          >
            See demo board
          </button>
        </div>
      </section>

      <LandingProofStrip />

      {/* ─── Demo — the REAL booking header rendered inline.
       *  Same peach material, same product vocabulary, not a
       *  cartoon. ─── */}
      <section id="demo" className="landing-demo">
        <LandingDemoCard />
      </section>

      <CreationFlowSection />

      {/* ─── Editorial sections — each pairs a real product
       *  snippet with a short prose paragraph. ─── */}

      <section className="landing-board-story" data-reveal="split">
        <div className="landing-board-story__copy">
          <p className="landing-pitch__eyebrow">
            <span>Pick a time</span>
          </p>
          <h2 className="landing-board-story__title">
            The spreadsheet shape, without the spreadsheet risk.
          </h2>
          <p className="landing-board-story__body">
            People already understand a date column and a row of times.
            mytimes keeps that scanning pattern, then adds the part a
            spreadsheet cannot: every claim locks immediately, disappears from
            the public board, and stays traceable in admin.
          </p>
          <div className="landing-board-story__proof" aria-label="Booking safety rules">
            <span>Open times stay visible</span>
            <span>Claimed times become admin records</span>
            <span>Admin keeps the record</span>
          </div>
        </div>
        <div className="landing-board-story__ui">
          <BoardSafetySnippet />
        </div>
      </section>

      <section className="landing-pitch" data-reveal="split">
        <div className="landing-pitch__text">
          <p className="landing-pitch__eyebrow">
            <span>Their timezone, your timezone</span>
          </p>
          <h2 className="landing-pitch__title">No one books the wrong hour.</h2>
          <p className="landing-pitch__body">
            Participants see times in their own timezone with your source
            timezone on every chip when they hover. Slots that cross a date
            boundary in your timezone get a small +1d badge that stays always
            visible, so nobody accidentally books the wrong day.
          </p>
        </div>
        <div className="landing-pitch__ui">
          <TzSnippet />
        </div>
      </section>

      <section className="landing-pitch landing-pitch--alt" data-reveal="split">
        <div className="landing-pitch__text">
          <p className="landing-pitch__eyebrow">
            <span>One link, no setup</span>
          </p>
          <h2 className="landing-pitch__title">Send the link. Let them book.</h2>
          <p className="landing-pitch__body">
            Each board has two private things: a public link for participants
            and an admin link for you. No accounts, no calendar OAuth, no
            permission rules. Participants never sign up. You manage every
            booking from one URL, kept in your inbox or a password manager.
          </p>
        </div>
        <div className="landing-pitch__ui">
          <LinkSnippet />
        </div>
      </section>

      {/* ─── Privacy ledger ──────────────────────────────────
       *  Editorial-typography redesign. No nested cards, no
       *  floating seals, no icon-grid filler. The peach page is
       *  the surface. Three labelled stanzas — we ask / we send
       *  / we never — read like a typeset contract. */}
      <section className="landing-privacy" data-reveal="ledger">
        <header className="landing-privacy__head">
          <p className="landing-pitch__eyebrow">
            <span>Privacy by default</span>
          </p>
          <h2 className="landing-privacy__title">
            Only what the meeting needs.<br />
            Nothing else.
          </h2>
          <p className="landing-privacy__body">
            A participant is claiming one interview slot, not joining a
            platform. The data flow stays small on purpose: identify the
            person, send the confirmation, keep a private cancellation link.
          </p>
        </header>

        <dl className="privacy-ledger" aria-label="What mytimes asks for and what it sends">
          <div className="privacy-ledger__stanza">
            <dt className="privacy-ledger__label">We ask</dt>
            <dd className="privacy-ledger__rows">
              <div className="privacy-ledger__row">
                <span className="privacy-ledger__key">Name</span>
                <span className="privacy-ledger__val">so the organizer knows who's coming</span>
              </div>
              <div className="privacy-ledger__row">
                <span className="privacy-ledger__key">Email</span>
                <span className="privacy-ledger__val">for the confirmation and the manage link</span>
              </div>
              <div className="privacy-ledger__row">
                <span className="privacy-ledger__key">Note</span>
                <span className="privacy-ledger__val">optional, anything the organizer should know</span>
              </div>
            </dd>
          </div>

          <div className="privacy-ledger__stanza">
            <dt className="privacy-ledger__label">We send</dt>
            <dd className="privacy-ledger__rows">
              <div className="privacy-ledger__row">
                <span className="privacy-ledger__key">Confirmation</span>
                <span className="privacy-ledger__val">email, the moment the slot is claimed</span>
              </div>
              <div className="privacy-ledger__row">
                <span className="privacy-ledger__key">Calendar file</span>
                <span className="privacy-ledger__val">.ics, opens in any calendar app</span>
              </div>
              <div className="privacy-ledger__row">
                <span className="privacy-ledger__key">Manage link</span>
                <span className="privacy-ledger__val">private, cancel without an account</span>
              </div>
            </dd>
          </div>

          <div className="privacy-ledger__stanza privacy-ledger__stanza--never">
            <dt className="privacy-ledger__label">We never ask for</dt>
            <dd className="privacy-ledger__never">
              <span>Passwords</span>
              <span>Phone numbers</span>
              <span>Calendar OAuth</span>
              <span>Tracking pixels</span>
              <span>Marketing email</span>
            </dd>
          </div>
        </dl>
      </section>

      <OperationsSection />

      <CompanyStandbySection />

      <ParticipantLifecycleSection />

      <LandingPricingSection />

      <LandingFaqSection />

      {/* ─── Footer CTA ─── */}
      <section className="landing-footer" data-reveal="artifact">
        <h2 className="landing-footer__title">
          Five minutes. One link. Done.
        </h2>
        <p className="landing-footer__body">
          No credit card. No participant accounts. No calendar to connect.
        </p>
        <button
          type="button"
          className="landing-hero__primary landing-footer__cta"
          onPointerEnter={() => void preloadDetailsStep()}
          onFocus={() => void preloadDetailsStep()}
          onClick={() => navigate('/new')}
        >
          Create your board <ArrowRight size={16} strokeWidth={2} />
        </button>
      </section>
    </div>
  );
}

/* ─── FAQ ─────────────────────────────────────────────────
 * Visible Q&A tied to the FAQPage JSON-LD in index.html.
 * Native <details>/<summary> means the content lives in the
 * DOM (crawler- and AI-friendly), the accordion needs no JS,
 * and screen readers get correct semantics for free.
 *
 * Wording is kept in lockstep with the JSON-LD answers so
 * what humans read and what crawlers index match exactly. */
const FAQ_ITEMS: Array<{ q: string; a: ReactNode }> = [
  {
    q: 'Do candidates need an account to book a time?',
    a: (
      <>
        No. Participants never sign up. They click your public link, pick a
        time, enter their name and email, and confirm. mytimes uses that email
        only to send the confirmation and a private manage link.
      </>
    ),
  },
  {
    q: 'Does mytimes connect to my calendar?',
    a: (
      <>
        No. There is no calendar OAuth. After a booking is confirmed, mytimes
        emails an <strong>.ics</strong> calendar file that drops into any
        calendar app. No third-party tracking, no marketing email.
      </>
    ),
  },
  {
    q: 'How long does it take to create a booking board?',
    a: (
      <>
        About four to five minutes. The creation flow has four screens:
        describe the round, generate the slots from a date range and daily
        window, review the real public page, and post and send the link.
      </>
    ),
  },
  {
    q: 'What counts as a board?',
    a: (
      <>
        A board is one event: one interview round, one batch of vendor
        calls, one set of office hours. Each board has its own public link,
        its own admin link, and its own slot list.
      </>
    ),
  },
  {
    q: 'Can I use a custom domain?',
    a: (
      <>
        Yes, on the Company plan. Participant links can live on a domain like
        {' '}<code>book.company.com</code> while admin, login, and billing stay
        on mytimes.co.
      </>
    ),
  },
  {
    q: 'How does pricing work?',
    a: (
      <>
        Free is <strong>$0</strong> forever for individuals running small
        rounds, capped at 2 active boards, 25 bookings per board, 60
        slots, and a 60-day window. Company is <strong>$49 per month</strong>
        {' '}(or $480 per year) with unlimited boards, 10 seats, custom
        subdomain, and company-wide admin recovery.
      </>
    ),
  },
];

function LandingFaqSection() {
  return (
    <section id="faq" className="landing-faq" aria-label="Frequently asked questions" data-reveal="section">
      <header className="landing-faq__head">
        <span className="landing-flow__mark">Common questions</span>
        <h2>Six things people ask before they ship.</h2>
        <p>
          If something else needs answering, replying to any mytimes email
          reaches a human.
        </p>
      </header>

      <div className="landing-faq__list">
        {FAQ_ITEMS.map((item, i) => (
          <details
            key={item.q}
            className="landing-faq__item"
            // First item open by default so the section reads as an
            // example rather than a wall of closed accordions.
            open={i === 0 ? true : undefined}
          >
            <summary className="landing-faq__q">
              <span>{item.q}</span>
              <span className="landing-faq__chevron" aria-hidden="true" />
            </summary>
            <div className="landing-faq__a">{item.a}</div>
          </details>
        ))}
      </div>
    </section>
  );
}

function LandingProofStrip() {
  return (
    <section className="landing-proof" aria-label="What mytimes is built for">
      {[
        {
          icon: <Clock size={14} strokeWidth={1.8} aria-hidden="true" />,
          label: 'Create in under 4 minutes',
          detail: 'Details, availability, review, post.',
        },
        {
          icon: <UserCheck size={14} strokeWidth={1.8} aria-hidden="true" />,
          label: 'Claim in under 30 seconds',
          detail: 'Name, email, optional note, done.',
        },
        {
          icon: <LockKeyhole size={14} strokeWidth={1.8} aria-hidden="true" />,
          label: 'No participant accounts',
          detail: 'Public board, private manage links.',
        },
      ].map((item) => (
        <article key={item.label} className="landing-proof__item">
          <span className="landing-proof__icon">{item.icon}</span>
          <span>
            <strong>{item.label}</strong>
            <small>{item.detail}</small>
          </span>
        </article>
      ))}
    </section>
  );
}

function CreationFlowSection() {
  const steps = [
    {
      icon: <ClipboardList size={16} strokeWidth={1.8} aria-hidden="true" />,
      title: 'Describe the round',
      body: 'Title, short context, organizer name, email, timezone, and the slot length.',
    },
    {
      icon: <SlidersHorizontal size={16} strokeWidth={1.8} aria-hidden="true" />,
      title: 'Generate the slots',
      body: 'Pick a date range, weekdays, daily window, and breaks. The preview counts every slot live.',
    },
    {
      icon: <CalendarCheck size={16} strokeWidth={1.8} aria-hidden="true" />,
      title: 'Review the real board',
      body: 'The review step renders the exact public booking page participants will see.',
    },
    {
      icon: <Send size={16} strokeWidth={1.8} aria-hidden="true" />,
      title: 'Post and send',
      body: 'Copy the public link, save the admin link, and use the suggested invitation as your first message.',
    },
  ];

  return (
    <section className="landing-flow" data-reveal="section">
      <div className="landing-flow__intro">
        <span className="landing-flow__mark">From blank to live</span>
        <h2>Four screens, then the board is out of your hands.</h2>
        <p>
          mytimes keeps creation narrow on purpose. You do not connect calendars,
          invite teammates, or configure recurring rules. You describe the round,
          generate the slots, check the public view, then send the link.
        </p>
      </div>

      <div className="landing-flow__track" aria-label="Organizer creation flow">
        {steps.map((step, index) => (
          <article key={step.title} className="landing-flow__step">
            <span className="landing-flow__number mono">{String(index + 1).padStart(2, '0')}</span>
            <span className="landing-flow__step-icon">{step.icon}</span>
            <span className="landing-flow__step-copy">
              <strong>{step.title}</strong>
              <span>{step.body}</span>
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ─── LandingDemoCard ─────────────────────────────────────
 * The actual <BookingHeaderCard> from the booking page,
 * rendered with MOCK_EVENT. If the real product card changes
 * (new field, new layout, different colors), this updates
 * automatically, so the landing does not drift from product. */
function LandingDemoCard() {
  const demoViewerTz = 'America/Los_Angeles';
  const [viewerTz, setViewerTz] = useState(demoViewerTz);
  const openSlotCount = MOCK_SLOTS.filter((s) => s.state === 'open').length;
  const uniqueDays = useMemo(() => {
    const set = new Set<string>();
    for (const s of MOCK_SLOTS) {
      if (s.state === 'open') set.add(s.startsAt.slice(0, 10));
    }
    return set.size;
  }, []);

  return (
    <div className="landing-demo__frame">
      <BookingHeaderCard
        event={MOCK_EVENT}
        viewerTz={viewerTz}
        detectedViewerTz={demoViewerTz}
        onViewerTzChange={setViewerTz}
        openSlotCount={openSlotCount}
        uniqueDays={uniqueDays}
        commonTimezones={US_DEMO_TIMEZONES}
      />
    </div>
  );
}

function BoardSafetySnippet() {
  const rows = [
    {
      weekday: 'MON',
      day: '18',
      month: 'MAY',
      slots: [
        { time: '09:00', status: 'open' },
        { time: '11:00', status: 'open' },
        { time: '14:00', status: 'open' },
      ],
    },
    {
      weekday: 'TUE',
      day: '19',
      month: 'MAY',
      slots: [
        { time: '10:00', status: 'open' },
        { time: '13:00', status: 'locked' },
        { time: '15:00', status: 'open' },
      ],
    },
    {
      weekday: 'WED',
      day: '20',
      month: 'MAY',
      slots: [
        { time: '09:00', status: 'open' },
        { time: '11:00', status: 'claimed' },
        { time: '14:00', status: 'open' },
      ],
    },
  ];

  return (
    <div className="landing-board-artifact" aria-label="Spreadsheet-style booking board">
      <div className="landing-board-artifact__bar">
        <span>Board state</span>
        <code className="mono">mytimes.co/b/vision-2026</code>
      </div>

      <div className="landing-board-artifact__rows">
        {rows.map((row) => (
          <div
            key={`${row.weekday}-${row.day}`}
            className={`landing-board-row${
              row.slots.some((slot) => slot.status === 'claimed') ? ' is-selected' : ''
            }`}
          >
            <div className="landing-board-row__date">
              <span>{row.weekday}</span>
              <strong className="mono tabular">{row.day}</strong>
              <small>{row.month}</small>
            </div>
            <div className="landing-board-row__slots">
              {row.slots.map((slot) => (
                <span
                  key={slot.time}
                  className={`landing-board-slot landing-board-slot--${slot.status}`}
                >
                  <span className="mono tabular">{slot.time}</span>
                  <small>
                    {slot.status === 'claimed'
                      ? 'claimed'
                      : slot.status === 'locked'
                        ? 'hidden'
                        : 'open'}
                  </small>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <aside className="landing-board-artifact__receipt">
        <span>Admin record</span>
        <strong>Mark Reynolds claimed 11:00</strong>
        <small>Slot removed from the public board immediately.</small>
      </aside>
    </div>
  );
}

/* ─── TzSnippet — real TimezonePicker + a sample participant
 *  strip + two dual-time chips, including a date-shift badge. */
function TzSnippet() {
  const demoViewerTz = 'America/Los_Angeles';
  const [viewerTz, setViewerTz] = useState(demoViewerTz);
  return (
    <div className="landing-snippet landing-snippet--tz">
      <div className="booking__tz-strip">
        <span className="booking__tz-strip-label">Showing in</span>
        <TimezonePicker
          value={viewerTz}
          onChange={setViewerTz}
          detected={demoViewerTz}
          commonZones={US_DEMO_TIMEZONES}
        />
        <span className="booking__tz-strip-sep" aria-hidden="true">·</span>
        <span className="booking__tz-strip-source">
          <span className="booking__tz-strip-label">Organizer in</span>
          <span className="booking__tz-strip-source-value mono">America/New_York</span>
        </span>
      </div>
      <div className="landing-snippet__chips">
        <button
          type="button"
          className="day-band__chip day-band__chip--am day-band__chip--dual"
          tabIndex={-1}
        >
          <span className="day-band__chip-time mono tabular">09:00</span>
          <span className="day-band__chip-meridiem" aria-hidden="true">am</span>
          <span className="day-band__chip-source mono" aria-hidden="true">12:00</span>
        </button>
        <button
          type="button"
          className="day-band__chip day-band__chip--pm day-band__chip--dual day-band__chip--date-shift"
          tabIndex={-1}
        >
          <span className="day-band__chip-time mono tabular">21:30</span>
          <span className="day-band__chip-meridiem" aria-hidden="true">pm</span>
          <span className="day-band__chip-source mono" aria-hidden="true">02:30</span>
          <span className="day-band__chip-shift" aria-hidden="true">-1d</span>
        </button>
      </div>
    </div>
  );
}

/* ─── LinkSnippet — show the two-link pair (public + admin)
 *  as compact cards. */
function LinkSnippet() {
  return (
    <div className="landing-snippet landing-snippet--links">
      <article className="landing-link-card">
        <span className="landing-link-card__eyebrow">PUBLIC LINK</span>
        <code className="landing-link-card__url mono">mytimes.co/b/vision-2026</code>
        <p className="landing-link-card__hint">Share with candidates.</p>
      </article>
      <article className="landing-link-card landing-link-card--admin">
        <span className="landing-link-card__eyebrow">
          <ShieldCheck size={11} strokeWidth={1.8} aria-hidden="true" />
          ADMIN LINK · keep private
        </span>
        <code className="landing-link-card__url mono">
          mytimes.co/admin/k3J9-2Xm-4Tn8
        </code>
        <p className="landing-link-card__hint">
          The only way to manage this board. Save it.
        </p>
      </article>
    </div>
  );
}

function OperationsSection() {
  const stats = [
    { label: 'Open', value: '18', kind: 'open' },
    { label: 'Booked', value: '7', kind: 'booked' },
    { label: 'Closed', value: '3', kind: 'closed' },
    { label: 'Total', value: '28', kind: 'total' },
  ];

  return (
    <section className="landing-ops" data-reveal="split">
      <div className="landing-ops__copy">
        <span className="landing-flow__mark">After the link is live</span>
        <h2>One private desk for every booking.</h2>
        <p>
          The admin link opens a working view of the board: open slots, booked
          slots, closed slots, recent activity, participant notes, email status,
          and the few actions an organizer actually needs.
        </p>
      </div>

      <div className="landing-ops__desk" aria-label="Organizer dashboard preview">
        <div className="landing-ops__bar">
          <span>
            <span className="brand-dot" aria-hidden="true" />
            Organizer dashboard
          </span>
          <strong>America/New_York</strong>
        </div>

        <div className="landing-ops__stats">
          {stats.map((stat) => (
            <span key={stat.label} className={`landing-ops__stat landing-ops__stat--${stat.kind}`}>
              <strong className="mono">{stat.value}</strong>
              <small>{stat.label}</small>
            </span>
          ))}
        </div>

        <div className="landing-ops__workspace">
          <div className="landing-ops__slots" aria-hidden="true">
            {[
              ['09:00', 'open'],
              ['10:00', 'booked'],
              ['11:00', 'open'],
              ['14:00', 'closed'],
              ['15:00', 'booked'],
              ['16:00', 'open'],
              ['17:00', 'open'],
              ['18:00', 'closed'],
            ].map(([time, state]) => (
              <span key={`${time}-${state}`} className={`landing-ops__slot landing-ops__slot--${state}`}>
                <span className="mono">{time}</span>
                <small>{state}</small>
              </span>
            ))}
          </div>

          <aside className="landing-ops__action">
            <span className="landing-ops__action-label">Selected slot</span>
            <strong>10:00 booked by Anya Gupta</strong>
            <code>anya@protonmail.com</code>
            <p>Previous email delivery bounced for this participant.</p>
            <div className="landing-ops__buttons">
              <span><RefreshCw size={13} strokeWidth={1.8} aria-hidden="true" />Resend email</span>
              <span><Archive size={13} strokeWidth={1.8} aria-hidden="true" />Keep closed</span>
            </div>
          </aside>
        </div>

        <div className="landing-ops__tools" aria-label="Admin tools">
          <span><FileDown size={13} strokeWidth={1.8} aria-hidden="true" />Export CSV</span>
          <span><Archive size={13} strokeWidth={1.8} aria-hidden="true" />Archive board</span>
          <span><KeyRound size={13} strokeWidth={1.8} aria-hidden="true" />Recover admin link</span>
        </div>
      </div>
    </section>
  );
}

function CompanyStandbySection() {
  const features = [
    {
      icon: <Globe2 size={15} strokeWidth={1.8} aria-hidden="true" />,
      label: 'Custom booking domain',
      detail: 'Use book.company.com for participant links while admin stays on mytimes.co.',
    },
    {
      icon: <ClipboardList size={15} strokeWidth={1.8} aria-hidden="true" />,
      label: 'Shared templates',
      detail: 'Reuse the same interview round shape without rebuilding it from memory.',
    },
    {
      icon: <FileDown size={15} strokeWidth={1.8} aria-hidden="true" />,
      label: 'Cross-event exports',
      detail: 'Pull booking records across rounds when hiring becomes a repeat motion.',
    },
    {
      icon: <KeyRound size={15} strokeWidth={1.8} aria-hidden="true" />,
      label: 'Company recovery',
      detail: 'Recover admin access across the workspace instead of hunting old links.',
    },
  ];

  return (
    <section className="landing-company" data-reveal="split">
      <div className="landing-company__copy">
        <span className="landing-flow__mark">Company</span>
        <h2>When boards become company muscle memory.</h2>
        <p>
          The subscription is not just more events. It is the operating mode for
          teams that run interview rounds often enough to want shared recovery,
          shared defaults, shared billing, and a participant link that feels
          internal.
        </p>
      </div>

      <div className="landing-company__artifact" aria-label="Company workspace preview">
        <div className="landing-company__domain">
          <span>
            <Globe2 size={14} strokeWidth={1.8} aria-hidden="true" />
            Custom participant domain
          </span>
          <strong className="mono">book.company.com/senior-engineer</strong>
          <small>Participant-facing only at first. Admin stays on mytimes.co.</small>
        </div>

        <div className="landing-company__grid">
          {features.map((feature) => (
            <article key={feature.label} className="landing-company__feature">
              <span className="landing-company__feature-icon">{feature.icon}</span>
              <span>
                <strong>{feature.label}</strong>
                <small>{feature.detail}</small>
              </span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ParticipantLifecycleSection() {
  return (
    <section className="landing-lifecycle" data-reveal="split">
      {/* Boarding-pass composition. The top is the receipt the participant
       *  gets. The perforated stub at the bottom shows the four capabilities
       *  this booking gives them — turning what used to be a disconnected
       *  chip row into the bottom half of the same ticket. */}
      <div className="landing-lifecycle__ticket" aria-label="Participant receipt preview">
        <span className="landing-lifecycle__stamp">CONFIRMED</span>
        <h2>Vision Assessment</h2>
        <dl>
          <div>
            <dt>Booked time</dt>
            <dd>Mon 18 May, 10:00</dd>
          </div>
          <div>
            <dt>Calendar file</dt>
            <dd>vision-assessment.ics</dd>
          </div>
          <div>
            <dt>Private manage link</dt>
            <dd>mytimes.co/m/v8p-4mQ</dd>
          </div>
        </dl>

        <div className="landing-lifecycle__stub" aria-label="What this booking unlocks">
          <span className="landing-lifecycle__stub-label">This booking carries</span>
          <ul className="landing-lifecycle__stub-list">
            <li><Mail size={13} strokeWidth={1.8} aria-hidden="true" /><span>Confirmation email</span></li>
            <li><Download size={13} strokeWidth={1.8} aria-hidden="true" /><span>Calendar download</span></li>
            <li><RefreshCw size={13} strokeWidth={1.8} aria-hidden="true" /><span>Cancel &amp; reopen</span></li>
            <li><Copy size={13} strokeWidth={1.8} aria-hidden="true" /><span>Manage link resend</span></li>
          </ul>
        </div>
      </div>

      <div className="landing-lifecycle__copy">
        <span className="landing-flow__mark">The full participant loop</span>
        <h2>Confirmation is not the end of the flow.</h2>
        <p>
          Every booking can send a confirmation email, attach a calendar file,
          and give the participant a private manage link. If plans change, they
          can cancel without asking you to play calendar traffic controller.
        </p>
      </div>
    </section>
  );
}

/* ─── Pricing teaser ──────────────────────────────────
 *  Tight three-row composition:
 *    1. Editorial header (eyebrow + short title + body)
 *    2. Two pricing cards side-by-side, each with three
 *       real constraints below the headline price
 *    3. Single primary CTA underneath, centred
 *
 *  Replaces the previous design: an oversized headline that
 *  squashed the cards into a corner and a floating black
 *  "custom domains" callout that read as a UI mistake. */
function LandingPricingSection() {
  const tiers = [
    {
      label: 'Free',
      price: '$0',
      cadence: 'forever',
      tagline: 'For the round you have to ship this week.',
      bullets: [
        '2 active boards',
        '25 bookings per board',
        'Per-board CSV export',
      ],
      footnote: '60-day active window',
    },
    {
      label: 'Company',
      price: '$49',
      cadence: 'per month',
      tagline: 'When booking rounds become a company habit.',
      bullets: [
        'Unlimited boards · 10 organizer seats',
        'Custom subdomain (book.company.com)',
        'Shared admin recovery + cross-board export',
      ],
      footnote: 'Or $480/year · custom domains included',
      featured: true,
    },
  ];

  return (
    <section id="pricing" className="landing-pricing-v2" aria-label="Pricing summary" data-reveal="section">
      <header className="landing-pricing-v2__head">
        <span className="landing-flow__mark">Pricing that matches the job</span>
        <h2>Free for one round.<br />Subscribe when it's the job.</h2>
        <p>
          mytimes stays free for the interview round you have to ship this
          week. Company unlocks when teams want the board ready every time,
          with shared recovery and billing.
        </p>
      </header>

      <div className="landing-pricing-v2__tiers">
        {tiers.map((tier) => (
          <article
            key={tier.label}
            className={`landing-pricing-v2__tier${tier.featured ? ' landing-pricing-v2__tier--featured' : ''}`}
          >
            <div className="landing-pricing-v2__tier-head">
              <span className="landing-pricing-v2__tier-name">{tier.label}</span>
              <div className="landing-pricing-v2__tier-price">
                <strong className="mono">{tier.price}</strong>
                <span>{tier.cadence}</span>
              </div>
            </div>
            <p className="landing-pricing-v2__tier-tagline">{tier.tagline}</p>
            <ul className="landing-pricing-v2__tier-bullets">
              {tier.bullets.map((b) => (
                <li key={b}>
                  <Check size={13} strokeWidth={2.2} aria-hidden="true" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <div className="landing-pricing-v2__tier-foot">{tier.footnote}</div>
          </article>
        ))}
      </div>

      <div className="landing-pricing-v2__cta-row">
        <button
          type="button"
          className="landing-hero__primary"
          onClick={() => navigate('/pricing')}
        >
          See full pricing <ArrowRight size={16} strokeWidth={2} />
        </button>
        <p className="landing-pricing-v2__cta-note">
          No credit card to start. Upgrade only when a board needs it.
        </p>
      </div>
    </section>
  );
}
