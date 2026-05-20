import { useState } from 'react';
import { Bookmark, Check, Copy, KeyRound, RefreshCw } from 'lucide-react';

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

export interface AdminAccessPanelProps {
  organizerEmail: string;
  currentUrlDisplay: string;
  disabled?: boolean;
  onRotateAdminUrl: () => void;
}

export function AdminAccessPanel({
  organizerEmail,
  currentUrlDisplay,
  disabled = false,
  onRotateAdminUrl,
}: AdminAccessPanelProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | undefined>();
  const shortcut = isMac() ? 'Cmd+D' : 'Ctrl+D';

  const copyCurrentUrl = async () => {
    if (typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setCopyError(undefined);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopyError('Could not copy from this browser. Select the address bar instead.');
    }
  };

  return (
    <section className="admin-access-panel material-panel-mini">
      <header className="admin-section-head">
        <span>Admin access</span>
        <strong>Private URL</strong>
      </header>

      <div className="admin-access-panel__credential">
        <span className="admin-access-panel__icon" aria-hidden="true">
          <KeyRound size={14} strokeWidth={1.8} />
        </span>
        <div className="admin-access-panel__credential-copy">
          <p className="admin-access-panel__label">Controls this board</p>
          <code>{currentUrlDisplay}</code>
        </div>
      </div>

      <p className="admin-access-panel__body">
        Anyone with this URL can manage slots, bookings, exports, and board
        status. Save it on this device, or rotate it if it was shared with the
        wrong person.
      </p>

      <div className="admin-access-panel__actions">
        <button
          type="button"
          className="admin-access-panel__button admin-access-panel__button--primary"
          onClick={() => void copyCurrentUrl()}
          disabled={disabled}
          aria-live="polite"
        >
          {copied ? (
            <>
              <Check size={13} strokeWidth={2} aria-hidden="true" />
              Copied
            </>
          ) : (
            <>
              <Copy size={13} strokeWidth={1.8} aria-hidden="true" />
              Copy admin URL
            </>
          )}
        </button>

        <span className="admin-access-panel__bookmark">
          <Bookmark size={13} strokeWidth={1.8} aria-hidden="true" />
          Bookmark with <span className="mono">{shortcut}</span>
        </span>
      </div>

      {copyError ? (
        <p className="admin-access-panel__error" role="alert">
          {copyError}
        </p>
      ) : null}

      <div className="admin-access-panel__rotate">
        <p>
          Recovery and rotation both send a different admin URL to{' '}
          <strong>{organizerEmail}</strong> and turn the current one off.
        </p>
        <button
          type="button"
          className="admin-access-panel__rotate-button"
          onClick={onRotateAdminUrl}
          disabled={disabled}
        >
          <RefreshCw size={13} strokeWidth={1.8} aria-hidden="true" />
          Send new admin URL
        </button>
      </div>
    </section>
  );
}

export interface AccountAdminAccessPanelProps {
  organizerEmail: string;
  disabled?: boolean;
  sent?: boolean;
  onRotatePrivateUrl: () => void;
}

export function AccountAdminAccessPanel({
  organizerEmail,
  disabled = false,
  sent = false,
  onRotatePrivateUrl,
}: AccountAdminAccessPanelProps) {
  return (
    <section className="admin-access-panel admin-access-panel--account material-panel-mini">
      <header className="admin-section-head">
        <span>Admin access</span>
        <strong>Account mode</strong>
      </header>

      <div className="admin-access-panel__credential">
        <span className="admin-access-panel__icon" aria-hidden="true">
          <KeyRound size={14} strokeWidth={1.8} />
        </span>
        <div className="admin-access-panel__credential-copy">
          <p className="admin-access-panel__label">Signed-in dashboard</p>
          <code>Account session protects this board</code>
        </div>
      </div>

      <p className="admin-access-panel__body">
        This dashboard is opened through your signed-in account. A separate
        private admin URL can still exist for no-account access.
      </p>

      <div className="admin-access-panel__rotate">
        <p>
          Send a replacement private admin URL to{' '}
          <strong>{organizerEmail}</strong>. Any older private admin URL stops
          working, and this account dashboard stays open.
        </p>
        <button
          type="button"
          className="admin-access-panel__rotate-button"
          onClick={onRotatePrivateUrl}
          disabled={disabled}
        >
          <RefreshCw size={13} strokeWidth={1.8} aria-hidden="true" />
          {sent ? 'New private URL sent' : 'Send replacement URL'}
        </button>
      </div>
    </section>
  );
}
