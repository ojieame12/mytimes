import { Helmet } from 'react-helmet-async';
import '../styles/legal.css';

type LegalSection = {
  id: string;
  title: string;
  body: string[];
  bullets?: string[];
};

const UPDATED_AT = '2026-05-15';

const PRIVACY_TITLE = 'Privacy Policy | mytimes';
const PRIVACY_DESCRIPTION =
  'How mytimes handles organizer, participant, booking, billing, and operational data for booking boards.';
const PRIVACY_URL = 'https://mytimes.co/privacy';

const TERMS_TITLE = 'Terms of Service | mytimes';
const TERMS_DESCRIPTION =
  'The basic terms for using mytimes booking boards, admin links, participant links, payments, and Company workspaces.';
const TERMS_URL = 'https://mytimes.co/terms';

const privacySections: LegalSection[] = [
  {
    id: 'what-we-collect',
    title: 'Data we collect',
    body: [
      'mytimes collects the information needed to create, share, book, and manage booking boards.',
    ],
    bullets: [
      'Organizer details such as name, email, event title, description, timezone, slots, account status, and billing status.',
      'Participant details such as name, email, optional notes, selected slot, booking timezone, booking activity, and cancellation activity.',
      'Operational data such as device, browser, IP-derived security signals, delivery logs, support requests, and error logs.',
    ],
  },
  {
    id: 'how-we-use-it',
    title: 'How we use data',
    body: [
      'We use this data to run the booking process: generate links, show open slots, prevent double booking, send confirmations, attach calendar files, recover admin links, process billing, and support customers.',
      'We also use operational data to protect the service, detect abuse, diagnose delivery failures, and improve reliability.',
    ],
  },
  {
    id: 'links-and-visibility',
    title: 'Public links and private links',
    body: [
      'A public booking link shows event information and open slots. It does not show participant names, participant emails, notes, admin actions, or booked participant details.',
      'Admin links and manage links are private credentials. Anyone with an admin link can manage that board. Anyone with a manage link can view or cancel that specific booking.',
    ],
  },
  {
    id: 'processors',
    title: 'Service providers',
    body: [
      'mytimes uses trusted providers to host the app, store data, deliver email, process payments, protect traffic, and monitor production health.',
    ],
    bullets: [
      'Railway for application hosting, database infrastructure, and custom domain deployment.',
      'Cloudflare for DNS, edge protection, TLS, and traffic security.',
      'Resend for transactional email delivery.',
      'Stripe for checkout, subscriptions, receipts, and billing records.',
      'Sentry if enabled for production error monitoring and diagnostics.',
    ],
  },
  {
    id: 'retention',
    title: 'Retention',
    body: [
      'Booking boards are kept for the active window that applies to the plan or board unlock used for that board. Free boards are short-lived interview rounds, while Company boards have longer retention.',
      'When data is deleted or archived, public access is removed first. Backups and operational logs may retain limited copies for a short period until normal rotation completes.',
    ],
  },
  {
    id: 'choices',
    title: 'Your choices',
    body: [
      'You can request access, correction, deletion, or recovery help by emailing support@getcaboo.com from the organizer email connected to the board.',
      'Participants can use the manage link in their confirmation email to cancel their own booking when cancellation is available for that board.',
    ],
  },
];

const termsSections: LegalSection[] = [
  {
    id: 'using-mytimes',
    title: 'Using mytimes',
    body: [
      'mytimes is a standalone booking page for fixed interview slots and similar short-lived scheduling rounds. Participants do not need accounts.',
      'You are responsible for the events you create, the links you share, and the people you invite to use those links.',
    ],
  },
  {
    id: 'link-security',
    title: 'Admin and manage links',
    body: [
      'Admin links and manage links act like credentials. Keep admin links private. Only share participant booking links with people who should be able to claim an open slot.',
      'If an admin link is lost, the organizer can request recovery by email. Recovery messages are sent only to the organizer email attached to the board.',
    ],
  },
  {
    id: 'payments',
    title: 'Payments and plans',
    body: [
      'mytimes offers a free plan, a Company plan, and an in-app one-time board unlock when a free board reaches specific limits.',
      'Payments are processed by Stripe. Company subscriptions renew until cancelled. The one-time board unlock applies only to the current board and is not a subscription.',
    ],
    bullets: [
      'A first Company billing cycle can be refunded within 14 days if no event has run.',
      'A one-time board unlock refund can be reviewed within 14 days if no booking has been made on that board after purchase.',
      'Taxes, card rules, and payment method handling are controlled through Stripe checkout and billing systems.',
    ],
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: [
      'Do not use mytimes for spam, harassment, unlawful activity, deceptive collection, or use cases that require regulated record handling that mytimes has not agreed to support in writing.',
      'We may rate limit, suspend, archive, or remove boards that create security risk, delivery abuse, or service disruption.',
    ],
  },
  {
    id: 'custom-domains',
    title: 'Custom domains',
    body: [
      'Company customers can use a branded booking domain when the required DNS records are configured and verified.',
      'DNS propagation, third-party registrar delays, and certificate issuance are outside direct mytimes control, but the product will show the setup status when custom domains are configured.',
    ],
  },
  {
    id: 'service-availability',
    title: 'Service availability',
    body: [
      'mytimes is provided as a standalone booking service. It does not promise Outlook, Google Calendar, Microsoft Bookings, Calendly, or other calendar integrations.',
      'We work to keep the service reliable, but no online service is available without interruption. Keep important admin links and exported records in your own operational process.',
    ],
  },
  {
    id: 'contact',
    title: 'Contact',
    body: [
      'Questions about these terms, billing, or data requests can be sent to support@getcaboo.com.',
    ],
  },
];

export function PrivacyPage() {
  return (
    <LegalDocument
      kind="privacy"
      title="Privacy Policy"
      subtitle="How mytimes handles booking board data."
      description={PRIVACY_DESCRIPTION}
      canonical={PRIVACY_URL}
      helmetTitle={PRIVACY_TITLE}
      sections={privacySections}
    />
  );
}

export function TermsPage() {
  return (
    <LegalDocument
      kind="terms"
      title="Terms of Service"
      subtitle="The rules for creating, sharing, booking, and paying for mytimes boards."
      description={TERMS_DESCRIPTION}
      canonical={TERMS_URL}
      helmetTitle={TERMS_TITLE}
      sections={termsSections}
    />
  );
}

function LegalDocument({
  kind,
  title,
  subtitle,
  description,
  canonical,
  helmetTitle,
  sections,
}: {
  kind: 'privacy' | 'terms';
  title: string;
  subtitle: string;
  description: string;
  canonical: string;
  helmetTitle: string;
  sections: LegalSection[];
}) {
  return (
    <article className="legal-page">
      <Helmet>
        <title>{helmetTitle}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={helmetTitle} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="article" />
        <meta name="twitter:title" content={helmetTitle} />
        <meta name="twitter:description" content={description} />
      </Helmet>

      <header className="legal-hero">
        <p className="legal-hero__eyebrow">{kind === 'privacy' ? 'Privacy' : 'Terms'}</p>
        <h1 className="legal-hero__title">{title}</h1>
        <p className="legal-hero__subtitle">{subtitle}</p>
        <p className="legal-hero__updated">Last updated {UPDATED_AT}</p>
      </header>

      <div className="legal-layout">
        <aside className="legal-summary" aria-label={`${title} sections`}>
          <p className="legal-summary__label">On this page</p>
          <nav className="legal-summary__nav">
            {sections.map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.title}
              </a>
            ))}
          </nav>
        </aside>

        <div className="legal-document">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="legal-section">
              <h2>{section.title}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.bullets ? (
                <ul>
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}
