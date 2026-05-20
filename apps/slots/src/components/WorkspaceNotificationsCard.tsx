import React from 'react';
import { Bell, MessageSquare, Send, Slash, TestTube2 } from 'lucide-react';
import type {
  AccountNotificationIntegrationsResponse,
  NotificationIntegration,
  NotificationIntegrationInput,
  NotificationProvider,
} from '../lib/api';

type WorkspaceNotificationsCardProps = {
  settings: AccountNotificationIntegrationsResponse;
  busyKey?: string;
  notice?: string;
  error?: string;
  onCreate: (input: NotificationIntegrationInput) => Promise<void>;
  onTest: (integrationId: string) => Promise<void>;
  onDisable: (integrationId: string) => Promise<void>;
};

export function WorkspaceNotificationsCard({
  settings,
  busyKey,
  notice,
  error,
  onCreate,
  onTest,
  onDisable,
}: WorkspaceNotificationsCardProps) {
  const eligible = settings.eligible;

  return (
    <section className="account-notifications-card" aria-label="Slack and Teams setup">
      <header className="account-notifications-card__head">
        <span className="account-notifications-card__icon" aria-hidden="true">
          <Bell size={16} strokeWidth={1.8} />
        </span>
        <div className="account-notifications-card__copy">
          <span className="account-notifications-card__eyebrow">Workspace notifications</span>
          <h2 className="account-notifications-card__title">Send booking activity where the team already works.</h2>
          <p className="account-notifications-card__body">
            {eligible
              ? 'Connect Slack or Teams with an incoming webhook. Webhook URLs are encrypted and never shown again.'
              : notificationLockedCopy(settings.reason)}
          </p>
        </div>
        <span className="account-notifications-card__status mono">
          {eligible ? `${settings.integrations.length} saved` : 'Company'}
        </span>
      </header>

      {notice && (
        <p className="account-notifications-card__notice" aria-live="polite">
          {notice}
        </p>
      )}
      {error && (
        <p className="account-notifications-card__error" aria-live="polite">
          {error}
        </p>
      )}

      {eligible ? (
        <>
          <NotificationIntegrationForm busy={busyKey === 'create'} onCreate={onCreate} />
          <NotificationIntegrationList
            integrations={settings.integrations}
            busyKey={busyKey}
            onTest={onTest}
            onDisable={onDisable}
          />
        </>
      ) : (
        <p className="account-notifications-card__locked">
          Start Company before configuring Slack or Teams destinations.
        </p>
      )}
    </section>
  );
}

function NotificationIntegrationForm({
  busy,
  onCreate,
}: {
  busy: boolean;
  onCreate: (input: NotificationIntegrationInput) => Promise<void>;
}) {
  const [provider, setProvider] = React.useState<NotificationProvider>('slack');
  const [destinationLabel, setDestinationLabel] = React.useState('');
  const [webhookUrl, setWebhookUrl] = React.useState('');

  const canSubmit = destinationLabel.trim().length > 0 && webhookUrl.trim().length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    await onCreate({
      provider,
      destinationLabel: destinationLabel.trim(),
      webhookUrl: webhookUrl.trim(),
    });
    setWebhookUrl('');
    setDestinationLabel(provider === 'slack' ? '#interviews' : 'Hiring channel');
  };

  return (
    <div className="account-notifications-card__form">
      <div className="account-notifications-card__provider" role="group" aria-label="Notification provider">
        <button
          type="button"
          className={provider === 'slack' ? 'is-selected' : undefined}
          onClick={() => setProvider('slack')}
          disabled={busy}
        >
          Slack
        </button>
        <button
          type="button"
          className={provider === 'teams' ? 'is-selected' : undefined}
          onClick={() => setProvider('teams')}
          disabled={busy}
        >
          Teams
        </button>
      </div>
      <label className="account-notifications-card__field">
        <span>Destination label</span>
        <input
          type="text"
          value={destinationLabel}
          onChange={(event) => setDestinationLabel(event.target.value)}
          placeholder={provider === 'slack' ? '#interviews' : 'Hiring channel'}
          maxLength={120}
          disabled={busy}
        />
      </label>
      <label className="account-notifications-card__field account-notifications-card__field--webhook">
        <span>{provider === 'slack' ? 'Slack incoming webhook URL' : 'Teams Workflows webhook URL'}</span>
        <input
          type="url"
          inputMode="url"
          value={webhookUrl}
          onChange={(event) => setWebhookUrl(event.target.value)}
          placeholder="https://hooks.example.com/..."
          disabled={busy}
        />
      </label>
      <button
        type="button"
        className="account-notifications-card__button"
        onClick={() => void submit()}
        disabled={!canSubmit}
      >
        <Send size={13} strokeWidth={1.8} aria-hidden="true" />
        <span>{busy ? 'Saving.' : 'Save destination'}</span>
      </button>
      <p className="account-notifications-card__hint">
        Booking created, cancelled, rescheduled, slot closed, and slot reopened events will be sent to active destinations.
      </p>
    </div>
  );
}

function NotificationIntegrationList({
  integrations,
  busyKey,
  onTest,
  onDisable,
}: {
  integrations: NotificationIntegration[];
  busyKey?: string;
  onTest: (integrationId: string) => Promise<void>;
  onDisable: (integrationId: string) => Promise<void>;
}) {
  if (integrations.length === 0) {
    return (
      <div className="account-notifications-card__empty">
        <MessageSquare size={15} strokeWidth={1.8} aria-hidden="true" />
        <span>No destinations yet. Add one webhook, send a test, then real booking activity will follow.</span>
      </div>
    );
  }

  return (
    <div className="account-notifications-card__list" role="list">
      {integrations.map((integration) => {
        const testBusy = busyKey === `test:${integration.id}`;
        const disableBusy = busyKey === `disable:${integration.id}`;
        return (
          <article key={integration.id} className="account-notifications-card__item" role="listitem">
            <div className="account-notifications-card__item-main">
              <span className="account-notifications-card__provider-label mono">
                {providerLabel(integration.provider)}
              </span>
              <h3>{integration.destinationLabel}</h3>
              <p>
                {statusLabel(integration)}
                {integration.lastTestedAt ? ` · tested ${formatShortDate(integration.lastTestedAt)}` : ''}
              </p>
              {integration.lastError && (
                <p className="account-notifications-card__item-error">{integration.lastError}</p>
              )}
            </div>
            <div className="account-notifications-card__item-actions">
              <button
                type="button"
                className="account-notifications-card__mini-action"
                onClick={() => void onTest(integration.id)}
                disabled={testBusy || disableBusy || integration.status === 'disabled'}
              >
                <TestTube2 size={13} strokeWidth={1.8} aria-hidden="true" />
                <span>{testBusy ? 'Testing.' : 'Send test'}</span>
              </button>
              {integration.status !== 'disabled' && (
                <button
                  type="button"
                  className="account-notifications-card__mini-action"
                  onClick={() => void onDisable(integration.id)}
                  disabled={testBusy || disableBusy}
                >
                  <Slash size={13} strokeWidth={1.8} aria-hidden="true" />
                  <span>{disableBusy ? 'Disabling.' : 'Disable'}</span>
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function notificationLockedCopy(reason: AccountNotificationIntegrationsResponse['reason']): string {
  if (reason === 'permission_required') {
    return 'Only workspace owners and admins can configure notification destinations.';
  }
  if (reason === 'encryption_key_required') {
    return 'Webhook encryption is not configured on the API service yet.';
  }
  return 'Included with Company for teams that want booking updates in Slack or Teams.';
}

function statusLabel(integration: NotificationIntegration): string {
  if (integration.status === 'active') return 'Active';
  if (integration.status === 'failed') return 'Needs attention';
  return 'Disabled';
}

function providerLabel(provider: NotificationProvider): string {
  return provider === 'slack' ? 'Slack' : 'Teams';
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}
