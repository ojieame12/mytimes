import { useState, type MouseEvent } from 'react';
import {
  Check,
  ChevronDown,
  Clock,
  Copy,
  Mail,
  RefreshCcw,
  ShieldCheck,
  User,
  Video,
} from 'lucide-react';
import { Avatar } from './Avatar';
import { TimezonePicker } from './TimezonePicker';
import type { BookingEvent } from '../lib/types';

export function BookingHeaderCard({
  event,
  viewerTz,
  detectedViewerTz,
  onViewerTzChange,
  openSlotCount,
  uniqueDays,
  commonTimezones,
}: {
  event: BookingEvent;
  viewerTz: string;
  detectedViewerTz: string;
  onViewerTzChange: (timezone: string) => void;
  openSlotCount: number;
  uniqueDays: number;
  commonTimezones?: string[];
}) {
  const [open, setOpen] = useState(false);
  const showMytimesFooter = !(
    event.paymentStatus === 'paid' &&
    (event.planKey === 'event_pass' || event.planKey === 'company_standby')
  );

  return (
    <section
      className={`booking-card${open ? ' is-expanded' : ''}`}
      aria-label="Event details"
    >
      <header className="booking-card__main">
        <div className="booking-card__text">
          <p className="booking-card__eyebrow">
            <span>{event.organizerName}</span> invites you to book
          </p>
          <h1 className="booking-card__title">{event.title}</h1>
          <ul className="booking-card__meta">
            <li>
              <Clock size={14} strokeWidth={1.6} aria-hidden="true" />
              <span className="mono tabular">{event.durationMinutes} min</span>
            </li>
            <li>
              <Video size={14} strokeWidth={1.6} aria-hidden="true" />
              <span>Video call</span>
            </li>
            <li>
              <TimezonePicker
                value={viewerTz}
                onChange={onViewerTzChange}
                detected={detectedViewerTz}
                commonZones={commonTimezones}
                showLabel
              />
            </li>
            <li>
              <Mail size={14} strokeWidth={1.6} aria-hidden="true" />
              <a
                href={`mailto:${event.organizerEmail}`}
                className="booking-card__meta-email mono"
              >
                {event.organizerEmail}
              </a>
            </li>
          </ul>
        </div>
        <Avatar
          seed={event.avatarSeed ?? event.organizerEmail}
          style={event.avatarStyle ?? 'notionists'}
          size={44}
        />
      </header>

      <div
        className="booking-card__strip"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={open ? 'Hide event details' : 'Show event details'}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        <div className="booking-card__strip-left">
          <span className="booking-card__stats">
            <span className="booking-card__stats-num mono tabular">{openSlotCount}</span>
            <span className="booking-card__stats-label">open</span>
            <span className="booking-card__stats-sep" aria-hidden="true">·</span>
            <span className="booking-card__stats-num mono tabular">{uniqueDays}</span>
            <span className="booking-card__stats-label">days</span>
          </span>
          <span className="booking-card__strip-sep" aria-hidden="true" />
          <ReferenceInline value={formatReference(event.id)} />
          {showMytimesFooter && (
            <>
              <span className="booking-card__strip-sep" aria-hidden="true" />
              <span className="booking-card__trust">
                <ShieldCheck size={12} strokeWidth={1.6} aria-hidden="true" />
                <span>Hosted on mytimes · Private booking link</span>
              </span>
            </>
          )}
        </div>
        <span className="booking-card__caret-icon" aria-hidden="true">
          <ChevronDown size={14} strokeWidth={1.8} />
        </span>
      </div>

      <div className="booking-card__tray" aria-hidden={!open}>
        <div className="booking-card__tray-inner">
          <section className="booking-card__tray-section">
            <h3 className="booking-card__tray-label">What to expect</h3>
            <ul className="booking-card__tray-list">
              <li>
                <Video size={13} strokeWidth={1.6} aria-hidden="true" />
                <span>Video call details after confirm</span>
              </li>
              <li>
                <Clock size={13} strokeWidth={1.6} aria-hidden="true" />
                <span>
                  <span className="mono tabular">{event.durationMinutes}</span> minutes, kept tight
                </span>
              </li>
              <li>
                <User size={13} strokeWidth={1.6} aria-hidden="true" />
                <span>1-on-1, no prep needed</span>
              </li>
              <li>
                <Mail size={13} strokeWidth={1.6} aria-hidden="true" />
                <span>Manage link shown after booking</span>
              </li>
            </ul>
          </section>

          <section className="booking-card__tray-section">
            <h3 className="booking-card__tray-label">
              <RefreshCcw size={12} strokeWidth={1.8} aria-hidden="true" />
              If you can't make it
            </h3>
            <p className="booking-card__tray-body">
              Use your private manage link to cancel. Your slot reopens for someone else.
              Organizer timezone: <span className="mono">{event.timezone}</span>.
              Detected here: <span className="mono">{detectedViewerTz}</span>.
            </p>
          </section>
        </div>
      </div>
    </section>
  );
}

function ReferenceInline({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async (event: MouseEvent) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard writes can be blocked outside a user activation.
    }
  };
  return (
    <button
      type="button"
      className="booking-card__ref"
      onClick={copy}
      aria-label={copied ? 'Copied reference code' : `Copy reference code ${value}`}
    >
      <code className="mono">{value}</code>
      {copied ? (
        <Check size={12} strokeWidth={1.8} aria-hidden="true" />
      ) : (
        <Copy size={12} strokeWidth={1.6} aria-hidden="true" />
      )}
    </button>
  );
}

function formatReference(id: string): string {
  const tail = id.replace(/[^a-z0-9]/gi, '').slice(-12).toUpperCase().padStart(12, '0');
  return `${tail.slice(0, 4)}-${tail.slice(4, 8)}-${tail.slice(8, 12)}`;
}
