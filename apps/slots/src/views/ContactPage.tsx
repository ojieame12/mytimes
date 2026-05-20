import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Helmet } from 'react-helmet-async';
import { ArrowRight } from 'lucide-react';
import {
  ApiClientError,
  submitContactLead,
  type ContactIntegrationInterest,
  type ContactLeadIntent,
} from '../lib/api';
import { Avatar } from '../components/Avatar';
import '../styles/contact.css';

const SUPPORT_EMAIL = 'support@getcaboo.com';
const FOUNDER_AVATAR_SEED = 'james@mytimes.co';

/* ─── Intent definitions ──────────────────────────────────
 * Each intent owns its field set, default integrations,
 * legend copy, and message placeholder. The form shape on the
 * page is derived from this map at render-time, so adding a
 * new intent is a single object change. */
type IntentField =
  | 'company'
  | 'role'
  | 'teamSize'
  | 'integrationInterest'
  | 'invoiceNumber';

type IntentConfig = {
  label: string;
  /** What the form is asking — appears as the form's small legend. */
  legend: string;
  /** Placeholder/prompt inside the message textarea. */
  messagePrompt: string;
  /** Which fields beyond name+email+message render. */
  fields: ReadonlySet<IntentField>;
  /** Default integrations seeded when this intent is chosen. */
  defaultIntegrations: ContactIntegrationInterest[];
};

const INTENTS: Array<{ value: ContactLeadIntent; config: IntentConfig }> = [
  {
    value: 'support',
    config: {
      label: 'Support',
      legend: "What's going on?",
      messagePrompt: 'What broke, or what are you trying to do?',
      fields: new Set<IntentField>(),
      defaultIntegrations: [],
    },
  },
  {
    value: 'enterprise',
    config: {
      label: 'Enterprise',
      legend: 'Tell us about the round.',
      messagePrompt:
        'Roles you hire for, how often the round repeats, who in your org needs to sign off.',
      fields: new Set<IntentField>([
        'company',
        'role',
        'teamSize',
        'integrationInterest',
      ]),
      defaultIntegrations: ['slack', 'teams', 'sso'],
    },
  },
  {
    value: 'slack',
    config: {
      label: 'Slack',
      legend: 'How does your team use Slack?',
      messagePrompt:
        'Which channel should get booking activity, and who needs the heads-up?',
      fields: new Set<IntentField>(['company', 'teamSize']),
      defaultIntegrations: ['slack'],
    },
  },
  {
    value: 'teams',
    config: {
      label: 'Teams',
      legend: 'How does your team use Microsoft Teams?',
      messagePrompt:
        'Which channel should get booking activity, and who needs the heads-up?',
      fields: new Set<IntentField>(['company', 'teamSize']),
      defaultIntegrations: ['teams'],
    },
  },
  {
    value: 'billing',
    config: {
      label: 'Billing',
      legend: "What's on the invoice?",
      messagePrompt: "What's the question: refund, receipt, plan change?",
      fields: new Set<IntentField>(['invoiceNumber']),
      defaultIntegrations: [],
    },
  },
  {
    value: 'security',
    config: {
      label: 'Security',
      legend: 'What does your review need to cover?',
      messagePrompt:
        'Areas you need answered: data handling, SSO, retention, vendor questionnaire.',
      fields: new Set<IntentField>(['company', 'role']),
      defaultIntegrations: ['security'],
    },
  },
];

const INTENT_MAP = new Map(INTENTS.map((entry) => [entry.value, entry.config]));

const integrationOptions: Array<{ value: ContactIntegrationInterest; label: string }> = [
  { value: 'slack', label: 'Slack' },
  { value: 'teams', label: 'Teams' },
  { value: 'sso', label: 'SSO' },
  { value: 'security', label: 'Security review' },
  { value: 'procurement', label: 'Procurement' },
  { value: 'custom_limits', label: 'Custom limits' },
];

type Status =
  | { type: 'idle' }
  | { type: 'submitting' }
  | { type: 'success' }
  | { type: 'error'; message: string };

export function ContactPage() {
  const initialIntent = useMemo(() => intentFromURL(), []);
  const [intent, setIntent] = useState<ContactLeadIntent>(initialIntent);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');
  const [integrationInterest, setIntegrationInterest] = useState<ContactIntegrationInterest[]>(
    INTENT_MAP.get(initialIntent)?.defaultIntegrations ?? [],
  );
  const [status, setStatus] = useState<Status>({ type: 'idle' });
  /* Soft fade when the intent (and therefore the field set) changes.
   * Keyed by intent — re-mounting the fieldset triggers the CSS animation. */
  const [fieldsKey, setFieldsKey] = useState(0);

  const config = INTENT_MAP.get(intent) ?? INTENT_MAP.get('support')!;
  const formRef = useRef<HTMLFormElement | null>(null);

  const toggleIntegration = (value: ContactIntegrationInterest) => {
    setIntegrationInterest((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  };

  const onIntentChange = (next: ContactLeadIntent) => {
    if (next === intent) return;
    setIntent(next);
    const nextConfig = INTENT_MAP.get(next);
    /* Replace integrations with the intent's defaults (instead of unioning) —
     * this avoids the previous bug where switching from Enterprise to Support
     * left Slack/Teams/SSO checked but with nowhere to render them. */
    setIntegrationInterest(nextConfig?.defaultIntegrations ?? []);
    setFieldsKey((k) => k + 1);
  };

  const resetForm = () => {
    setName('');
    setEmail('');
    setCompany('');
    setRole('');
    setTeamSize('');
    setInvoiceNumber('');
    setMessage('');
    setIntegrationInterest(INTENT_MAP.get(intent)?.defaultIntegrations ?? []);
    setStatus({ type: 'idle' });
    /* Focus the first input again so the user is back at the top of the form. */
    requestAnimationFrame(() => {
      const firstInput = formRef.current?.querySelector<HTMLInputElement>(
        'input[name="contact-name"]',
      );
      firstInput?.focus();
    });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus({ type: 'submitting' });
    try {
      /* The server schema doesn't accept an invoice number field, so for
       * Billing intent we serialize it as a single prefix line on the message.
       * The hashed email log keeps the original message readable. */
      const composedMessage =
        intent === 'billing' && invoiceNumber.trim()
          ? `Invoice number: ${invoiceNumber.trim()}\n\n${message}`
          : message;

      await submitContactLead({
        intent,
        name,
        email,
        company: config.fields.has('company') && company ? company : undefined,
        role: config.fields.has('role') && role ? role : undefined,
        teamSize: config.fields.has('teamSize') && teamSize ? teamSize : undefined,
        message: composedMessage,
        sourcePath: window.location.pathname + window.location.search,
        integrationInterest: config.fields.has('integrationInterest')
          ? integrationInterest
          : [],
        website,
      });
      setStatus({ type: 'success' });
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof ApiClientError
            ? error.message
            : 'Something went wrong sending your message. You can also email us directly.',
      });
    }
  };

  return (
    <div className="contact-page">
      <Helmet>
        <title>Contact mytimes</title>
        <meta
          name="description"
          content={`A real person reads every message. Tell us what you're after and we'll reply from ${SUPPORT_EMAIL} within a business day.`}
        />
        <link rel="canonical" href="https://mytimes.co/contact" />
      </Helmet>

      <section className="contact-hero">
        <p className="contact-hero__eyebrow">
          <span>Contact</span>
        </p>
        <h1 className="contact-hero__title">What's on your mind?</h1>
        <p className="contact-hero__body">
          A real person reads every message. Replies usually land within a
          business day from{' '}
          <a className="contact-hero__email" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>

      <section className="contact-workspace" aria-label="Contact form">
        {status.type === 'success' ? (
          <ContactConfirmation onSendAnother={resetForm} />
        ) : (
          <form ref={formRef} className="contact-form" onSubmit={onSubmit} noValidate>
            <fieldset className="contact-form__fieldset contact-form__fieldset--intents">
              <legend className="contact-form__legend">What do you need?</legend>
              <div className="contact-intents" role="radiogroup" aria-label="Contact intent">
                {INTENTS.map(({ value, config: intentConfig }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={intent === value}
                    className={`contact-intent${intent === value ? ' is-selected' : ''}`}
                    onClick={() => onIntentChange(value)}
                  >
                    {intentConfig.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div key={fieldsKey} className="contact-form__panel">
              <p className="contact-form__panel-legend">{config.legend}</p>

              <div className="contact-form__grid">
                <label className="contact-field">
                  <span className="contact-field__label">Name</span>
                  <input
                    name="contact-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    maxLength={160}
                    autoComplete="name"
                  />
                </label>
                <label className="contact-field">
                  <span className="contact-field__label">Email</span>
                  <input
                    name="contact-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    maxLength={254}
                    autoComplete="email"
                  />
                </label>
              </div>

              {(config.fields.has('company') || config.fields.has('role')) && (
                <div className="contact-form__grid">
                  {config.fields.has('company') && (
                    <label className="contact-field">
                      <span className="contact-field__label">Company</span>
                      <input
                        value={company}
                        onChange={(event) => setCompany(event.target.value)}
                        maxLength={180}
                        autoComplete="organization"
                      />
                    </label>
                  )}
                  {config.fields.has('role') && (
                    <label className="contact-field">
                      <span className="contact-field__label">Role</span>
                      <input
                        value={role}
                        onChange={(event) => setRole(event.target.value)}
                        maxLength={160}
                        autoComplete="organization-title"
                      />
                    </label>
                  )}
                </div>
              )}

              {config.fields.has('teamSize') && (
                <label className="contact-field">
                  <span className="contact-field__label">Team size</span>
                  <select
                    value={teamSize}
                    onChange={(event) => setTeamSize(event.target.value)}
                  >
                    <option value="">Not sure yet</option>
                    <option value="1-10">1–10</option>
                    <option value="11-50">11–50</option>
                    <option value="51-200">51–200</option>
                    <option value="201+">201+</option>
                  </select>
                </label>
              )}

              {config.fields.has('invoiceNumber') && (
                <label className="contact-field">
                  <span className="contact-field__label">
                    Invoice number
                    <span className="contact-field__hint">optional</span>
                  </span>
                  <input
                    value={invoiceNumber}
                    onChange={(event) => setInvoiceNumber(event.target.value)}
                    maxLength={64}
                    placeholder="e.g. INV-2026-0142"
                  />
                </label>
              )}

              {config.fields.has('integrationInterest') && (
                <fieldset className="contact-form__fieldset">
                  <legend className="contact-form__legend">
                    What do you want to talk through?
                  </legend>
                  <div className="contact-checks" role="group">
                    {integrationOptions.map((option) => (
                      <label key={option.value} className="contact-check">
                        <input
                          type="checkbox"
                          checked={integrationInterest.includes(option.value)}
                          onChange={() => toggleIntegration(option.value)}
                        />
                        <span className="contact-check__label">{option.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              <label className="contact-field contact-field--message">
                <span className="contact-field__label">Message</span>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  required
                  minLength={4}
                  maxLength={4000}
                  rows={7}
                  placeholder={config.messagePrompt}
                />
              </label>

              {/* Honeypot — kept in the layout flow but visually removed. */}
              <label className="contact-form__trap" aria-hidden="true">
                Website
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                />
              </label>

              <div className="contact-form__footer">
                <button
                  type="submit"
                  disabled={status.type === 'submitting'}
                  className="contact-submit"
                >
                  {status.type === 'submitting' ? 'Sending' : 'Send'}
                  <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
                </button>

                <ContactSignature />

                {status.type === 'error' && (
                  <p className="contact-status contact-status--error" role="alert">
                    {status.message} You can also email{' '}
                    <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
                  </p>
                )}
              </div>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

/* ─── Founder signature ───────────────────────────────────
 * Small inline lockup that sits below the submit button.
 * Same notionists avatar style used in transactional email so
 * the brand reads as one voice across surfaces. */
function ContactSignature() {
  return (
    <p className="contact-signature">
      <Avatar
        seed={FOUNDER_AVATAR_SEED}
        style="notionists"
        size={28}
        className="contact-signature__avatar"
      />
      <span className="contact-signature__text">
        I read every one of these. James Miller, founder.
      </span>
    </p>
  );
}

/* ─── After-success state ─────────────────────────────────
 * Replaces the form in place. No navigation, no confetti — the
 * confirmation is editorial typography on the same peach
 * surface, with one quiet "Send another" return. */
function ContactConfirmation({ onSendAnother }: { onSendAnother: () => void }) {
  /* Roll the focus to the heading so screen readers announce the change. */
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="contact-confirmation" role="status" aria-live="polite">
      <p className="contact-confirmation__eyebrow">
        <span>Got it</span>
      </p>
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="contact-confirmation__title"
      >
        We'll reply from{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        <br />
        within a business day.
      </h2>
      <p className="contact-confirmation__body">
        A real person reads every message, usually James. If it's urgent and
        you need an audit trail, the inbox above is the canonical record.
      </p>
      <button
        type="button"
        className="contact-confirmation__again"
        onClick={onSendAnother}
      >
        Send another
      </button>
    </div>
  );
}

function intentFromURL(): ContactLeadIntent {
  if (typeof window === 'undefined') return 'support';
  const raw = new URLSearchParams(window.location.search).get('intent');
  return INTENT_MAP.has(raw as ContactLeadIntent)
    ? (raw as ContactLeadIntent)
    : 'support';
}
