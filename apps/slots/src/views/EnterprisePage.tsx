import { Helmet } from 'react-helmet-async';
import { ArrowRight, Check } from 'lucide-react';
import { navigate } from '../lib/routing';
import '../styles/contact.css';

/* ─── EnterprisePage ────────────────────────────────────────
 * Editorial sales-deck shape, not a feature checklist.
 *
 *   1. Hero — eyebrow + two-line headline, body, two CTAs.
 *      No fake "workspace activity" card on the right — the
 *      page leads with typography, the way the landing hero
 *      does. (Direction A.)
 *
 *   2. Three feature blocks, each a horizontal row pairing a
 *      short editorial paragraph with a real-looking artifact
 *      built in HTML/CSS. Side alternates. The artifacts
 *      DEMONSTRATE the feature rather than describe it:
 *        • Slack-shaped message preview for channel notification setup
 *        • IdP login screen for SSO + admin recovery
 *        • Peach "deal page" mockup for procurement
 *
 *   3. Rollout — three concrete steps, named after what
 *      actually happens (discovery call, sandbox workspace,
 *      contracts + production), not abstract verbs.
 *
 *   4. Final CTA — single primary button + a short trust line.
 *      Drops the giant 2-line wall the old layout had. */

const ENTERPRISE_TITLE = 'Enterprise: mytimes';
const ENTERPRISE_DESCRIPTION =
  'When the booking board joins the team chat. Slack and Teams notification setup, SSO, security review, custom limits, and annual contract paperwork for hiring teams with formal rollout needs.';

export function EnterprisePage() {
  return (
    <div className="enterprise-page">
      <Helmet>
        <title>{ENTERPRISE_TITLE}</title>
        <meta name="description" content={ENTERPRISE_DESCRIPTION} />
        <link rel="canonical" href="https://mytimes.co/enterprise" />
      </Helmet>

      {/* ─── 1. Editorial hero ─── */}
      <section className="enterprise-hero">
        <p className="enterprise-hero__eyebrow">
          <span>For hiring teams</span>
        </p>
        <h1 className="enterprise-hero__title">
          <span>When the booking board</span>{' '}
          <span>joins the team chat.</span>
        </h1>
        <p className="enterprise-hero__body">
          Company is enough for teams running booking rounds on their own.
          Enterprise is for teams that need the booking board connected to
          Slack or Teams, behind SSO, with a real contract on the other side.
          Talk to us when the round becomes the work.
        </p>
        <div className="enterprise-hero__cta">
          <button
            type="button"
            className="enterprise-hero__primary"
            onClick={() => navigate('/contact?intent=enterprise')}
          >
            Talk to sales <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="enterprise-hero__ghost"
            onClick={() => navigate('/pricing')}
          >
            See pricing
          </button>
        </div>
      </section>

      {/* ─── 2. Three feature blocks ─── */}

      {/* Block 1 — Slack/Teams setup. Copy left, artifact right. */}
      <section className="enterprise-block" data-block="slack">
        <div className="enterprise-block__copy">
          <p className="enterprise-block__eyebrow">
            <span>Slack &amp; Teams setup</span>
          </p>
          <h2 className="enterprise-block__title">
            Connect booking activity to the channel where the team already
            lives.
          </h2>
          <p className="enterprise-block__body">
            During Enterprise setup we connect Slack or Teams to the workspace
            that needs it. The notification can include the slot, participant
            name, and board context without making chat the system of record.
          </p>
        </div>
        <div className="enterprise-block__artifact" aria-label="Slack message preview">
          <SlackArtifact />
        </div>
      </section>

      {/* Block 2 — SSO. Artifact left, copy right. */}
      <section className="enterprise-block enterprise-block--reverse" data-block="sso">
        <div className="enterprise-block__copy">
          <p className="enterprise-block__eyebrow">
            <span>SSO &amp; admin recovery</span>
          </p>
          <h2 className="enterprise-block__title">
            Centralize access, recovery, and workspace ownership.
          </h2>
          <p className="enterprise-block__body">
            Sign in through Okta, Microsoft Entra ID, or Google Workspace.
            Admin recovery runs through your identity provider, not a single
            private URL living in someone's password manager. The link stops
            being the single point of failure.
          </p>
        </div>
        <div className="enterprise-block__artifact" aria-label="Single sign-on login preview">
          <SsoArtifact />
        </div>
      </section>

      {/* Block 3 — Procurement. Copy left, artifact right. */}
      <section className="enterprise-block" data-block="procurement">
        <div className="enterprise-block__copy">
          <p className="enterprise-block__eyebrow">
            <span>Procurement &amp; custom limits</span>
          </p>
          <h2 className="enterprise-block__title">
            We meet your buying process where it is.
          </h2>
          <p className="enterprise-block__body">
            Real contracts, invoice handling, SOC-2 review, custom organization
            limits negotiated on paper. Procurement gets a single mytimes
            contact, not a billing portal. Your team gets a workspace shaped
            to your operating model.
          </p>
        </div>
        <div className="enterprise-block__artifact" aria-label="Enterprise deal page preview">
          <DealArtifact />
        </div>
      </section>

      {/* ─── 3. Rollout ─── */}
      <section className="enterprise-rollout" aria-label="How a rollout actually goes">
        <header className="enterprise-rollout__head">
          <p className="enterprise-block__eyebrow">
            <span>How a rollout actually goes</span>
          </p>
          <h2 className="enterprise-rollout__title">
            Three steps, no scripted demo.
          </h2>
        </header>

        <ol className="enterprise-rollout__steps">
          <li className="enterprise-rollout__step">
            <span className="enterprise-rollout__num mono">01</span>
            <div>
              <strong>Discovery call (30 min)</strong>
              <span>
                We map your hiring volume, current tools, and where mytimes
                fits. No pitch deck, no scripted demo.
              </span>
            </div>
          </li>
          <li className="enterprise-rollout__step">
            <span className="enterprise-rollout__num mono">02</span>
            <div>
              <strong>Sandbox workspace</strong>
              <span>
                Your team gets a real mytimes workspace with the right Slack or
                Teams path mapped out. We run an actual round together.
              </span>
            </div>
          </li>
          <li className="enterprise-rollout__step">
            <span className="enterprise-rollout__num mono">03</span>
            <div>
              <strong>Procurement and production</strong>
              <span>
                Contracts, SSO setup, custom limits agreed. Your team owns the
                workspace from there.
              </span>
            </div>
          </li>
        </ol>
      </section>

      {/* ─── 4. Final CTA ─── */}
      <section className="enterprise-final" aria-label="Talk to sales">
        <h2 className="enterprise-final__title">
          Bring the hiring process. We&apos;ll fit the board to it.
        </h2>
        <button
          type="button"
          className="enterprise-hero__primary"
          onClick={() => navigate('/contact?intent=enterprise')}
        >
          Talk to sales <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
        </button>
        <p className="enterprise-final__note">
          We reply within a business day. Calls start with what you&apos;re
          trying to do, not a demo.
        </p>
      </section>
    </div>
  );
}

/* ─── SlackArtifact ─────────────────────────────────────────
 *  A Slack-shaped message preview. White card, sender avatar
 *  square, channel pill above. We don't try to be pixel-exact
 *  to Slack — just enough vocabulary that the reader recognises
 *  what the integration ships into. The workspace name is a
 *  generic placeholder so the artifact never reads as real
 *  customer data. */
function SlackArtifact() {
  return (
    <div className="enterprise-slack">
      <div className="enterprise-slack__chrome">
        <span className="enterprise-slack__chrome-dots" aria-hidden="true">
          <span /><span /><span />
        </span>
        <span className="enterprise-slack__chrome-workspace mono">
          northstar-hiring.slack.com
        </span>
      </div>

      <div className="enterprise-slack__channel">
        <span className="enterprise-slack__channel-pill">
          <span aria-hidden="true">#</span>candidate-loop
        </span>
        <span className="enterprise-slack__channel-meta">12 members</span>
      </div>

      <article className="enterprise-slack__message">
        <span className="enterprise-slack__avatar" aria-hidden="true">m</span>
        <div className="enterprise-slack__message-body">
          <div className="enterprise-slack__message-head">
            <strong>mytimes</strong>
            <span className="enterprise-slack__app-tag">APP</span>
            <span className="enterprise-slack__time mono">10:42</span>
          </div>
          <div className="enterprise-slack__message-text">
            <strong>Casey Rivera</strong> claimed{' '}
            <span className="mono">Tue 18 May, 10:00 PT</span>: Vision
            Assessment, round 2.
          </div>
          <div className="enterprise-slack__message-attach">
            <span className="enterprise-slack__attach-bar" aria-hidden="true" />
            <div className="enterprise-slack__attach-body">
              <span className="enterprise-slack__attach-eyebrow">
                BOOKING · senior-design-engineer
              </span>
              <span className="enterprise-slack__attach-title">
                10:00-11:00 with Alex Miller
              </span>
              <button
                type="button"
                className="enterprise-slack__attach-cta"
                tabIndex={-1}
              >
                View booking
              </button>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}

/* ─── SsoArtifact ───────────────────────────────────────────
 *  Mini IdP-style login screen with recognizable provider marks.
 *  The buttons stay neutral, but the logo wells use the real
 *  brand colors so this reads as an enterprise SSO surface rather
 *  than a fake initials mockup. */
function SsoArtifact() {
  const providers = [
    { name: 'Okta', logo: <OktaLogo /> },
    { name: 'Microsoft Entra ID', logo: <MicrosoftLogo /> },
    { name: 'Google Workspace', logo: <GoogleLogo /> },
  ];

  return (
    <div className="enterprise-sso">
      <div className="enterprise-sso__head">
        <span className="enterprise-sso__wordmark">mytimes</span>
        <span className="enterprise-sso__head-dot" aria-hidden="true" />
        <span className="enterprise-sso__head-domain mono">
          acme-hiring.mytimes.co
        </span>
      </div>

      <div className="enterprise-sso__title">Sign in to continue</div>

      <div className="enterprise-sso__providers">
        {providers.map((provider) => (
          <button
            key={provider.name}
            type="button"
            className="enterprise-sso__provider"
            tabIndex={-1}
          >
            <span className="enterprise-sso__provider-mark" aria-hidden="true">
              {provider.logo}
            </span>
            <span className="enterprise-sso__provider-text">
              Continue with {provider.name}
            </span>
          </button>
        ))}
      </div>

      <p className="enterprise-sso__note">
        Admin recovery runs through your IdP, not a single private URL.
      </p>
    </div>
  );
}

function OktaLogo() {
  return (
    <svg className="enterprise-sso__logo enterprise-sso__logo--okta" viewBox="0 0 86 28" role="img">
      <text
        x="1"
        y="22"
        fill="#00297A"
        fontFamily="Arial Rounded MT Bold, Arial, Helvetica, sans-serif"
        fontSize="24"
        fontWeight="800"
        letterSpacing="-1"
      >
        okta
      </text>
    </svg>
  );
}

function MicrosoftLogo() {
  return (
    <svg className="enterprise-sso__logo enterprise-sso__logo--microsoft" viewBox="0 0 24 24" role="img">
      <rect x="2" y="2" width="9.5" height="9.5" fill="#F25022" />
      <rect x="12.5" y="2" width="9.5" height="9.5" fill="#7FBA00" />
      <rect x="2" y="12.5" width="9.5" height="9.5" fill="#00A4EF" />
      <rect x="12.5" y="12.5" width="9.5" height="9.5" fill="#FFB900" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg className="enterprise-sso__logo enterprise-sso__logo--google" viewBox="0 0 24 24" role="img">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.98 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.02 2.18 5.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

/* ─── DealArtifact ──────────────────────────────────────────
 *  Peach-tinted "deal page" mockup. Header with company + deal
 *  status pill, a stacked list of line items mimicking a real
 *  enterprise quote (annual subscription, seats, custom limits,
 *  SSO, SOC-2 attachment), and a small signed-stamp aesthetic
 *  at the bottom. Designed to read as a contract page, not a
 *  feature checklist. */
function DealArtifact() {
  const lines = [
    { label: 'Annual subscription', value: 'Enterprise · 12 mo' },
    { label: 'Organizer seats', value: '40 included' },
    { label: 'Custom limits', value: 'Agreed, see Addendum A' },
    { label: 'SSO', value: 'Okta · enforced' },
    { label: 'SOC-2 review', value: 'Attached' },
  ];

  return (
    <div className="enterprise-deal">
      <header className="enterprise-deal__head">
        <div>
          <span className="enterprise-deal__eyebrow">
            DEAL · acme-hiring
          </span>
          <strong className="enterprise-deal__title">
            mytimes Enterprise: annual
          </strong>
        </div>
        <span className="enterprise-deal__status">
          <span aria-hidden="true" className="enterprise-deal__status-dot" />
          In review
        </span>
      </header>

      <dl className="enterprise-deal__lines">
        {lines.map((line) => (
          <div key={line.label} className="enterprise-deal__line">
            <dt>{line.label}</dt>
            <dd>{line.value}</dd>
          </div>
        ))}
      </dl>

      <footer className="enterprise-deal__foot">
        <span className="enterprise-deal__stamp" aria-hidden="true">
          <Check size={14} strokeWidth={2.4} aria-hidden="true" />
          Signed by mytimes
        </span>
        <span className="enterprise-deal__meta mono">v3 · 14 May 2026</span>
      </footer>
    </div>
  );
}
