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
  FileText,
  Globe2,
  Key,
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
import { prefetchBookingPage, prefetchCreateFlow } from '../lib/prefetch';
import { Avatar } from '../components/Avatar';
import { BookingHeaderCard } from '../components/BookingHeaderCard';
import { TimezonePicker } from '../components/TimezonePicker';
import { MOCK_EVENT, MOCK_SLOTS } from '../lib/mockData';
import { formatTimeInTz, formatDateKey, formatDayPartsInTz } from '../lib/time';
import '../styles/landing.css';

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
const LANDING_TITLE = 'mytimes: Scheduling for one-off interview rounds';
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
            onPointerEnter={prefetchCreateFlow}
            onFocus={prefetchCreateFlow}
            onClick={() => navigate('/new')}
          >
            Create your board <ArrowRight size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="landing-hero__ghost"
            onPointerEnter={prefetchBookingPage}
            onFocus={prefetchBookingPage}
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

        <section className="bento-section">
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
            Pick a viewer timezone and the table slides. Every slot keeps the
            organizer&rsquo;s source time on the left and the participant&rsquo;s
            local time on the right. A <span className="mono">−1d</span> or{' '}
            <span className="mono">+1d</span> badge appears the moment a slot
            crosses midnight in either direction.
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
                <span className="privacy-ledger__val">provider buttons plus .ics, no calendar OAuth</span>
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
          onPointerEnter={prefetchCreateFlow}
          onFocus={prefetchCreateFlow}
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
        emails Google, Outlook, Office 365, and Apple/iCal calendar buttons
        plus an attached <strong>.ics</strong> file.
        No third-party tracking, no marketing email.
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
        Free is <strong>$0</strong> forever for one small
        round, capped at 1 active board, 15 bookings, 30
        slots, and a 3-day active window. Company is <strong>$49 per month</strong>
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
    <section className="landing-proof" aria-label="Where mytimes fits">
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

/* ─── TzSnippet — live boarding-pass translation table
 *  Source TZ stays fixed (a Tokyo organizer — chosen so the
 *  default Pacific viewer has a chunky 16-hour gap and the
 *  ±1d badge actually shows up). The viewer column is a real
 *  TimezonePicker; changing it re-formats every row using the
 *  same Intl helpers the booking page uses. */
function TzSnippet() {
  const sourceTz = 'Asia/Tokyo';
  const demoViewerTz = 'America/Los_Angeles';
  const [viewerTz, setViewerTz] = useState(demoViewerTz);

  /* Anchored to a fixed Thursday so the demo is stable across
   *  loads. Four interview-shaped times across the organizer's
   *  workday (09:00, 12:00, 15:00, 17:30 JST). */
  const sourceInstants = useMemo(
    () => [
      new Date('2026-05-21T00:00:00Z'), // 09:00 Thu JST
      new Date('2026-05-21T03:00:00Z'), // 12:00 Thu JST
      new Date('2026-05-21T06:00:00Z'), // 15:00 Thu JST
      new Date('2026-05-21T08:30:00Z'), // 17:30 Thu JST
    ],
    [],
  );

  const rows = sourceInstants.map((instant) => {
    const orgKey = formatDateKey(instant, sourceTz);
    const viewKey = formatDateKey(instant, viewerTz);
    const shift =
      orgKey === viewKey ? 0 : viewKey < orgKey ? -1 : 1;
    return {
      orgTime: formatTimeInTz(instant, sourceTz),
      orgWeekday: formatDayPartsInTz(instant, sourceTz).weekdayShort,
      viewTime: formatTimeInTz(instant, viewerTz),
      viewWeekday: formatDayPartsInTz(instant, viewerTz).weekdayShort,
      shift,
    };
  });

  return (
    <div className="landing-snippet landing-snippet--tz tz-pass">
      <header className="tz-pass__head">
        <div className="tz-pass__head-side">
          <span className="tz-pass__label">Set in</span>
          <span className="tz-pass__zone mono">{sourceTz}</span>
        </div>
        <span className="tz-pass__head-arrow" aria-hidden="true">↦</span>
        <div className="tz-pass__head-side tz-pass__head-side--viewer">
          <span className="tz-pass__label">Showing in</span>
          <TimezonePicker
            value={viewerTz}
            onChange={setViewerTz}
            detected={demoViewerTz}
            commonZones={US_DEMO_TIMEZONES}
          />
        </div>
      </header>

      <dl className="tz-pass__table">
        {rows.map((row, idx) => (
          <div
            key={idx}
            className={
              row.shift !== 0
                ? 'tz-pass__row tz-pass__row--shift'
                : 'tz-pass__row'
            }
          >
            <dt className="tz-pass__col tz-pass__col--org">
              <span className="tz-pass__time mono tabular">{row.orgTime}</span>
              <span className="tz-pass__day">{row.orgWeekday}</span>
            </dt>
            <dd className="tz-pass__col tz-pass__col--view">
              <span className="tz-pass__time mono tabular">{row.viewTime}</span>
              <span className="tz-pass__day">{row.viewWeekday}</span>
              {row.shift !== 0 ? (
                <span
                  className="tz-pass__shift mono"
                  aria-label={
                    row.shift > 0 ? 'shifted one day forward' : 'shifted one day back'
                  }
                >
                  {row.shift > 0 ? '+1d' : '−1d'}
                </span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
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
  /* Direction A — hero one participant, demote the rest.
   * The pitch is "private desk for every booking" so the visual
   * unit is ONE booking, large, with the action context next to
   * it (avatar, bounce alert, real action buttons). The board
   * stats become a small atmospheric strip, and the slot grid
   * becomes a sparse horizontal sparkline that just sets the
   * context "this is your full board". */
  return (
    <section className="landing-ops" data-reveal="split">
      <div className="landing-ops__copy">
        <span className="landing-flow__mark">After the link is live</span>
        <h2>One private desk for every booking.</h2>
        <p>
          The admin link opens the whole board. Each booking still gets its own
          record: participant name, note, email delivery status, and the actions
          you need when a slot has to be closed, reopened, or cancelled.
        </p>
      </div>

      <div className="landing-ops__desk" aria-label="Selected booking preview">
        {/* Atmospheric context strip — what board are we in, what's
         *  the headline shape. Quiet so the hero booking dominates. */}
        <div className="landing-ops__context">
          <span className="landing-ops__context-board">
            <span className="brand-dot" aria-hidden="true" />
            Vision Assessment · 28 slots
          </span>
          <span className="landing-ops__context-stats">
            <span><strong className="mono">18</strong> open</span>
            <span className="landing-ops__context-dot" aria-hidden="true" />
            <span><strong className="mono">7</strong> booked</span>
            <span className="landing-ops__context-dot" aria-hidden="true" />
            <span><strong className="mono">3</strong> closed</span>
          </span>
        </div>

        {/* HERO — one booking, full attention. */}
        <article className="landing-ops__booking" aria-label="Booking detail">
          <header className="landing-ops__booking-head">
            <Avatar
              className="landing-ops__avatar"
              seed="anya@protonmail.com"
              style="notionists"
              size={56}
              ariaLabel="Avatar for Anya Gupta"
            />
            <div className="landing-ops__booking-id">
              <span className="landing-ops__booking-eyebrow">Booked · Tue 18 May</span>
              <h3 className="landing-ops__booking-name">Anya Gupta</h3>
              <span className="landing-ops__booking-meta mono">
                10:00 SAST &middot; anya@protonmail.com
              </span>
            </div>
          </header>

          <div className="landing-ops__alert">
            <span className="landing-ops__alert-eyebrow">Email status · bounced</span>
            <p className="landing-ops__alert-body">
              The confirmation email bounced. Anya hasn't received the
              calendar invite or manage link yet.
            </p>
            <div className="landing-ops__alert-buttons">
              <button type="button" className="landing-ops__btn landing-ops__btn--primary" tabIndex={-1}>
                <RefreshCw size={14} strokeWidth={1.8} aria-hidden="true" />
                Resend to anya@protonmail.com
              </button>
              <button type="button" className="landing-ops__btn" tabIndex={-1}>
                Ask for a different email
              </button>
            </div>
          </div>

          <footer className="landing-ops__booking-foot">
            <span className="landing-ops__booking-note">
              <span className="landing-ops__booking-note-mark">Note from Anya</span>
              <span className="landing-ops__booking-note-text">
                &ldquo;I may join from a phone for the first few minutes.&rdquo;
              </span>
            </span>
          </footer>
        </article>

        {/* Slot sparkline — sparse horizontal strip. The booked slot
         *  has a peach dot to anchor "you are looking at this one". */}
        <div className="landing-ops__sparkline" aria-hidden="true">
          {[
            ['09:00', 'open'],
            ['10:00', 'selected'],
            ['11:00', 'open'],
            ['14:00', 'closed'],
            ['15:00', 'booked'],
            ['16:00', 'open'],
            ['17:00', 'open'],
            ['18:00', 'closed'],
          ].map(([time, state]) => (
            <span
              key={`${time}-${state}`}
              className={`landing-ops__spark landing-ops__spark--${state}`}
              title={`${time} · ${state}`}
            >
              <span className="mono">{time}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function OrganizerShowcaseSection() {
  return (
    <section className="organizer-showcase">
      <div className="organizer-showcase-container">
        <div className="os-text">
          <div className="os-badge">After the link is live</div>
          <h2 className="os-title">One private desk for every booking.</h2>
          <p className="os-desc">
            The admin link opens a working view of the board: open slots, booked slots, closed slots, recent activity, participant notes, email status, and the few actions an organizer actually needs.
          </p>
        </div>
        <div className="os-mockup-wrapper">
          <div className="os-mockup">
            <div className="os-m-header">
              <span className="os-m-title">Organizer dashboard</span>
              <span className="os-m-tz">America/New_York</span>
            </div>
            <div className="os-m-metrics">
              <div className="os-m-metric"><span className="os-m-val text-green">18</span><span className="os-m-lbl">Open</span></div>
              <div className="os-m-metric"><span className="os-m-val text-blue">7</span><span className="os-m-lbl">Booked</span></div>
              <div className="os-m-metric"><span className="os-m-val text-gray">3</span><span className="os-m-lbl">Closed</span></div>
              <div className="os-m-metric"><span className="os-m-val text-black">28</span><span className="os-m-lbl">Total</span></div>
            </div>
            <div className="os-m-body">
              <div className="os-m-slots">
                <div className="os-m-slot is-open"><span>09:00</span><span>open</span></div>
                <div className="os-m-slot is-booked"><span>10:00</span><span>booked</span></div>
                <div className="os-m-slot is-open"><span>11:00</span><span>open</span></div>
                <div className="os-m-slot is-closed"><span>14:00</span><span>closed</span></div>
                <div className="os-m-slot is-booked"><span>15:00</span><span>booked</span></div>
                <div className="os-m-slot is-open"><span>16:00</span><span>open</span></div>
                <div className="os-m-slot is-open"><span>17:00</span><span>open</span></div>
                <div className="os-m-slot is-closed"><span>18:00</span><span>closed</span></div>
              </div>
              <div className="os-m-panel">
                <div className="os-m-panel-eyebrow">Selected slot</div>
                <div className="os-m-panel-title">10:00 booked by Anya Gupta</div>
                <div className="os-m-panel-email">anya@protonmail.com</div>
                <div className="os-m-panel-note">Previous email delivery bounced for this participant.</div>
                <div className="os-m-panel-actions">
                  <button><RefreshCw size={12}/> Resend email</button>
                  <button><Archive size={12}/> Keep closed</button>
                </div>
              </div>
            </div>
            <div className="os-m-footer">
              <button><FileText size={12}/> Export CSV</button>
              <button><Archive size={12}/> Archive board</button>
              <button><Key size={12}/> Recover admin link</button>
            </div>
          </div>
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
  /* Inbox preview redesign. The artifact IS the experience —
   * a faux mail-client list row on top, the open confirmation
   * email beneath. Same wordmark, eyebrow, peach time block,
   * and brand CTA the participant will actually see. Closes
   * the gap between landing-page claim and real recipient view. */
  return (
    <section className="landing-lifecycle landing-lifecycle--inbox" data-reveal="split">
      <div className="landing-inbox" aria-label="What lands in the participant's inbox">
        <div className="landing-inbox__row">
          <Avatar
            className="landing-inbox__avatar"
            seed="oyani@mytimes.co"
            style="notionists"
            size={36}
            ariaLabel="Avatar for Oyani Solis"
          />
          <div className="landing-inbox__row-text">
            <div className="landing-inbox__row-top">
              <span className="landing-inbox__row-sender">Oyani Solis</span>
              <span className="landing-inbox__row-time mono">10:42</span>
            </div>
            <div className="landing-inbox__row-subject">Confirmed with Oyani.</div>
            <div className="landing-inbox__row-pre">
              Tue 18 May &middot; 10:00 SAST &middot; 60 min with Oyani &middot;
              <span className="landing-inbox__row-attach">
                <span aria-hidden="true">📎</span> calendar attached
              </span>
            </div>
          </div>
        </div>

        <div className="landing-inbox__open" aria-hidden="true">
          <div className="landing-inbox__open-bar">
            <span className="landing-inbox__open-bar-wordmark">mytimes</span>
            <span className="landing-inbox__open-bar-dot" aria-hidden="true" />
          </div>
          <div className="landing-inbox__open-eyebrow">Booking confirmed</div>
          <div className="landing-inbox__open-title">Confirmed with Oyani.</div>
          <div className="landing-inbox__open-timeblock">
            <span className="landing-inbox__open-tb-label">Your time</span>
            <div className="landing-inbox__open-tb-date">Tuesday, 18 May 2026</div>
            <div className="landing-inbox__open-tb-time mono">
              10:00&ndash;11:00 <span>SAST</span>
            </div>
          </div>
          <button className="landing-inbox__open-cta" type="button" tabIndex={-1}>
            Manage booking <ArrowRight size={13} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="landing-lifecycle__copy">
        <span className="landing-flow__mark">The full participant loop</span>
        <h2>Confirmation is not the end of the flow.</h2>
        <p>
          Every booking sends a real confirmation email, includes calendar
          buttons plus an <strong>.ics</strong> file, and gives the participant
          a private manage link. If plans change, they cancel without asking
          you to play calendar traffic controller.
        </p>
        <ul className="landing-lifecycle__notes">
          <li><Mail size={13} strokeWidth={1.8} aria-hidden="true" /><span>Confirmation email, the moment the slot is claimed</span></li>
          <li><Download size={13} strokeWidth={1.8} aria-hidden="true" /><span>Calendar buttons plus <strong>.ics</strong> file, no OAuth</span></li>
          <li><RefreshCw size={13} strokeWidth={1.8} aria-hidden="true" /><span>Manage link: cancel or resend without an account</span></li>
        </ul>
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
type PricingTier = {
  label: string;
  price: string;
  cadence: string;
  tagline: string;
  bullets: string[];
  footnote?: string;
  cta?: { label: string; href: string };
  featured?: boolean;
};

function LandingPricingSection() {
  const tiers: PricingTier[] = [
    {
      label: 'Free',
      price: '$0',
      cadence: 'forever',
      tagline: 'Try one small round and see if mytimes fits.',
      bullets: [
        '1 active board',
        '15 bookings · 30 published slots',
        '3-day active window',
      ],
      footnote: 'Per-board CSV export · 3-day active window',
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
    {
      label: 'Enterprise',
      price: 'Custom',
      cadence: '',
      tagline: 'For hiring teams with formal rollout needs.',
      bullets: [
        'Slack & Teams setup',
        'SSO, security review, custom limits',
        'Annual contract paperwork',
      ],
      cta: { label: 'View Enterprise', href: '/enterprise' },
    },
  ];

  return (
    <section id="pricing" className="landing-pricing-v2" aria-label="Pricing summary" data-reveal="section">
      <header className="landing-pricing-v2__head">
        <span className="landing-flow__mark">Pricing that matches the job</span>
        <h2>
          <span>Free for one round.</span>{' '}
          <span>Subscribe when it's the job.</span>
        </h2>
        <p>
          mytimes stays free while you try one round. Company fits when rounds
          become a habit. Enterprise is for hiring teams that need Slack,
          Teams, SSO, and signed vendor paperwork.
        </p>
      </header>

      {/* Two-row grid: self-serve tiers up top, contact-sales
       *  card full-width below in a horizontal layout that signals
       *  "different kind of conversation" without competing. */}
      <div className="landing-pricing-v2__grid">
        <div className="landing-pricing-v2__selfserve">
          {tiers.filter((t) => !t.cta).map((tier) => (
            <article
              key={tier.label}
              className={[
                'landing-pricing-v2__tier',
                tier.featured ? 'landing-pricing-v2__tier--featured' : '',
              ].filter(Boolean).join(' ')}
            >
              <div className="landing-pricing-v2__tier-head">
                <span className="landing-pricing-v2__tier-name">{tier.label}</span>
                <div className="landing-pricing-v2__tier-price">
                  <strong className="mono">{tier.price}</strong>
                  {tier.cadence ? <span>{tier.cadence}</span> : null}
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
              {tier.footnote ? (
                <div className="landing-pricing-v2__tier-foot">{tier.footnote}</div>
              ) : null}
            </article>
          ))}
        </div>

        {tiers.filter((t) => t.cta).map((tier) => (
          <article key={tier.label} className="landing-pricing-v2__enterprise">
            <div className="landing-pricing-v2__enterprise-head">
              <span className="landing-pricing-v2__enterprise-label">{tier.label}</span>
              <span className="landing-pricing-v2__enterprise-price">{tier.price}</span>
              <p className="landing-pricing-v2__enterprise-tagline">{tier.tagline}</p>
            </div>
            <ul className="landing-pricing-v2__enterprise-bullets">
              {tier.bullets.map((b) => (
                <li key={b}>
                  <Check size={13} strokeWidth={2.2} aria-hidden="true" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            {tier.cta ? (
              <button
                type="button"
                className="landing-pricing-v2__enterprise-cta"
                onClick={() => navigate(tier.cta!.href)}
              >
                {tier.cta.label} <ArrowRight size={14} strokeWidth={2} />
              </button>
            ) : null}
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
