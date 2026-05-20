import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type pg from "pg";
import { getPool } from "./db.js";
import { loadEnv } from "./env.js";
import { ApiError } from "./errors.js";
import { logError, logInfo, logWarn } from "./logger.js";
import { readAccountWorkspace } from "./organizations.js";
import type { BookingDTO, EventDTO, SlotDTO } from "./slotboard.js";
import type { NotificationIntegrationInput, NotificationProvider } from "./validation.js";

export type NotificationIntegrationDTO = {
  id: string;
  provider: NotificationProvider;
  destinationLabel: string;
  status: "active" | "disabled" | "failed";
  lastTestedAt?: string | undefined;
  lastError?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export type AccountNotificationIntegrationsResponse = {
  eligible: boolean;
  reason?: "company_required" | "permission_required" | "encryption_key_required" | undefined;
  integrations: NotificationIntegrationDTO[];
};

export type WorkspaceNotificationType =
  | "test"
  | "booking_created"
  | "booking_cancelled"
  | "booking_rescheduled"
  | "slot_closed"
  | "slot_reopened";

export async function readAccountNotificationIntegrations(input: {
  userId: string;
  email: string;
}): Promise<AccountNotificationIntegrationsResponse> {
  const workspace = await readAccountWorkspace(getPool(), input);
  if (!workspace.eligible || !workspace.organization) {
    return { eligible: false, reason: "company_required", integrations: [] };
  }

  const result = await getPool().query<NotificationIntegrationRow>(
    `
      select id, provider, destination_label, status, last_tested_at, last_error, created_at, updated_at
      from slotboard.notification_integrations
      where organization_id = $1
      order by created_at desc
    `,
    [workspace.organization.id],
  );

  return {
    eligible: true,
    integrations: result.rows.map(toDTO),
  };
}

export async function createAccountNotificationIntegration(input: {
  userId: string;
  email: string;
  integration: NotificationIntegrationInput;
}): Promise<AccountNotificationIntegrationsResponse> {
  const workspace = await requireWorkspaceAdmin(input);
  const encryptedSecret = encryptSecret(input.integration.webhookUrl);

  await getPool().query(
    `
      insert into slotboard.notification_integrations (
        organization_id,
        provider,
        destination_label,
        encrypted_secret,
        status,
        created_by_user_id,
        last_error
      )
      values ($1, $2, $3, $4, 'active', $5, null)
    `,
    [
      workspace.organization.id,
      input.integration.provider,
      input.integration.destinationLabel,
      encryptedSecret,
      input.userId,
    ],
  );

  logInfo("slotboard_notification_integration_created", {
    organizationId: workspace.organization.id,
    provider: input.integration.provider,
  });

  return readAccountNotificationIntegrations({ userId: input.userId, email: input.email });
}

export async function disableAccountNotificationIntegration(input: {
  userId: string;
  email: string;
  integrationId: string;
}): Promise<AccountNotificationIntegrationsResponse> {
  const workspace = await requireWorkspaceAdmin(input);
  await getPool().query(
    `
      update slotboard.notification_integrations
      set status = 'disabled'
      where id = $1
        and organization_id = $2
    `,
    [input.integrationId, workspace.organization.id],
  );
  logInfo("slotboard_notification_integration_disabled", {
    organizationId: workspace.organization.id,
    integrationId: input.integrationId,
  });
  return readAccountNotificationIntegrations({ userId: input.userId, email: input.email });
}

export async function testAccountNotificationIntegration(input: {
  userId: string;
  email: string;
  integrationId: string;
}): Promise<{ ok: true; integration: NotificationIntegrationDTO; delivery: NotificationDeliveryResult }> {
  const workspace = await requireWorkspaceAdmin(input);
  const integration = await readIntegrationForOrganization(input.integrationId, workspace.organization.id);
  const delivery = await deliverToIntegration(integration, {
    type: "test",
    title: "mytimes test notification",
    text: "This channel is connected to your mytimes workspace.",
    fields: [
      ["Workspace", workspace.organization.name],
      ["Destination", integration.destination_label],
    ],
  });

  await getPool().query(
    `
      update slotboard.notification_integrations
      set last_tested_at = now(),
          last_error = $3,
          status = case when $3::text is null then 'active' else 'failed' end
      where id = $1
        and organization_id = $2
    `,
    [integration.id, workspace.organization.id, delivery.status === "sent" ? null : delivery.error ?? "Notification test failed"],
  );

  const refreshed = await readIntegrationForOrganization(input.integrationId, workspace.organization.id);
  return {
    ok: true,
    integration: toDTO(refreshed),
    delivery,
  };
}

export async function notifyWorkspaceIntegrations(input: {
  type: Exclude<WorkspaceNotificationType, "test">;
  event: EventDTO;
  slot: SlotDTO;
  booking?: BookingDTO | undefined;
  actorLabel?: string | undefined;
}): Promise<void> {
  try {
    const organizationId = await readEventOrganizationId(input.event.id);
    if (!organizationId) {
      return;
    }

    const integrations = await getPool().query<NotificationIntegrationSecretRow>(
      `
        select id, organization_id, provider, destination_label, encrypted_secret, status, last_tested_at, last_error, created_at, updated_at
        from slotboard.notification_integrations
        where organization_id = $1
          and status = 'active'
        order by created_at asc
      `,
      [organizationId],
    );
    if (integrations.rows.length === 0) {
      return;
    }

    const message = buildNotificationMessage(input);
    await Promise.all(integrations.rows.map(async (integration) => {
      const delivery = await deliverToIntegration(integration, message);
      await writeDeliveryLog({
        integration,
        type: input.type,
        eventId: input.event.id,
        bookingId: input.booking?.id,
        delivery,
      });
      if (delivery.status === "failed") {
        await getPool().query(
          `
            update slotboard.notification_integrations
            set last_error = $2
            where id = $1
          `,
          [integration.id, delivery.error ?? "Notification delivery failed"],
        );
      }
    }));
  } catch (error) {
    logError("slotboard_notification_dispatch_failed", { eventId: input.event.id, type: input.type }, error);
  }
}

async function requireWorkspaceAdmin(input: { userId: string; email: string }) {
  const workspace = await readAccountWorkspace(getPool(), input);
  if (!workspace.eligible || !workspace.organization) {
    throw new ApiError(402, "company_required", "Company is required to configure workspace notifications");
  }
  if (!workspace.currentMember || !["owner", "admin"].includes(workspace.currentMember.role)) {
    throw new ApiError(403, "organization_permission_denied", "Only workspace owners and admins can configure notifications");
  }
  if (!loadEnv().integrationEncryptionKey) {
    throw new ApiError(500, "integration_encryption_key_missing", "SLOTBOARD_INTEGRATION_ENCRYPTION_KEY is required to save webhook URLs");
  }
  return workspace as typeof workspace & { organization: NonNullable<typeof workspace.organization> };
}

async function readIntegrationForOrganization(id: string, organizationId: string): Promise<NotificationIntegrationSecretRow> {
  const result = await getPool().query<NotificationIntegrationSecretRow>(
    `
      select id, organization_id, provider, destination_label, encrypted_secret, status, last_tested_at, last_error, created_at, updated_at
      from slotboard.notification_integrations
      where id = $1
        and organization_id = $2
      limit 1
    `,
    [id, organizationId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(404, "notification_integration_not_found", "Notification integration not found");
  }
  return row;
}

async function readEventOrganizationId(eventId: string): Promise<string | null> {
  const result = await getPool().query<{ organization_id: string | null }>(
    `
      select coalesce(e.organization_id, s.organization_id, o.id) as organization_id
      from slotboard.booking_events e
      left join slotboard.subscriptions s
        on s.owner_user_id = e.owner_user_id
       and s.plan_key = 'company_standby'
       and s.status in ('active', 'trialing')
       and (s.current_period_end is null or s.current_period_end > now())
      left join slotboard.organizations o
        on o.billing_owner_user_id = e.owner_user_id
       and o.status = 'active'
      where e.id = $1
      order by s.created_at desc nulls last, o.created_at desc nulls last
      limit 1
    `,
    [eventId],
  );
  return result.rows[0]?.organization_id ?? null;
}

function buildNotificationMessage(input: {
  type: Exclude<WorkspaceNotificationType, "test">;
  event: EventDTO;
  slot: SlotDTO;
  booking?: BookingDTO | undefined;
  actorLabel?: string | undefined;
}): NotificationMessage {
  const time = formatSlotTime(input.slot, input.event.timezone);
  const participant = input.booking?.participantName ?? input.actorLabel ?? "Participant";
  const titleByType: Record<typeof input.type, string> = {
    booking_created: "New booking",
    booking_cancelled: "Booking cancelled",
    booking_rescheduled: "Booking rescheduled",
    slot_closed: "Slot closed",
    slot_reopened: "Slot reopened",
  };
  const verbByType: Record<typeof input.type, string> = {
    booking_created: "claimed",
    booking_cancelled: "cancelled",
    booking_rescheduled: "moved to",
    slot_closed: "closed",
    slot_reopened: "reopened",
  };

  return {
    type: input.type,
    title: titleByType[input.type],
    text: input.booking
      ? `${participant} ${verbByType[input.type]} ${time} for ${input.event.title}.`
      : `${input.event.organizerName} ${verbByType[input.type]} ${time} for ${input.event.title}.`,
    fields: [
      ["Board", input.event.title],
      ["Slot", time],
      ...(input.booking ? [["Participant", participant] as [string, string]] : []),
    ],
  };
}

async function deliverToIntegration(
  integration: NotificationIntegrationSecretRow,
  message: NotificationMessage,
): Promise<NotificationDeliveryResult> {
  try {
    const webhookUrl = decryptSecret(integration.encrypted_secret);
    const payload = integration.provider === "slack"
      ? slackPayload(message)
      : teamsPayload(message);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const responseText = truncate(await response.text().catch(() => ""), 500);
      if (!response.ok) {
        logWarn("slotboard_notification_delivery_failed", {
          integrationId: integration.id,
          provider: integration.provider,
          providerStatus: response.status,
        });
        return {
          status: "failed",
          providerStatus: response.status,
          providerResponse: responseText,
          error: `Provider returned ${response.status}`,
        };
      }
      logInfo("slotboard_notification_delivery_sent", {
        integrationId: integration.id,
        provider: integration.provider,
        providerStatus: response.status,
      });
      return {
        status: "sent",
        providerStatus: response.status,
        providerResponse: responseText,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    logError("slotboard_notification_delivery_error", {
      integrationId: integration.id,
      provider: integration.provider,
    }, error);
    return {
      status: "failed",
      error: truncate(messageText, 500),
    };
  }
}

async function writeDeliveryLog(input: {
  integration: NotificationIntegrationSecretRow;
  type: WorkspaceNotificationType;
  eventId?: string | undefined;
  bookingId?: string | undefined;
  delivery: NotificationDeliveryResult;
}): Promise<void> {
  await getPool().query(
    `
      insert into slotboard.notification_delivery_logs (
        integration_id,
        organization_id,
        event_id,
        booking_id,
        notification_type,
        provider,
        destination_label,
        status,
        provider_status,
        provider_response,
        error
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    [
      input.integration.id,
      input.integration.organization_id,
      input.eventId ?? null,
      input.bookingId ?? null,
      input.type,
      input.integration.provider,
      input.integration.destination_label,
      input.delivery.status,
      input.delivery.providerStatus ?? null,
      input.delivery.providerResponse ?? null,
      input.delivery.error ?? null,
    ],
  );
}

function slackPayload(message: NotificationMessage) {
  return {
    text: `${message.title}: ${message.text}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${message.title}*\n${message.text}`,
        },
      },
      {
        type: "section",
        fields: message.fields.map(([label, value]) => ({
          type: "mrkdwn",
          text: `*${label}*\n${value}`,
        })),
      },
    ],
  };
}

function teamsPayload(message: NotificationMessage) {
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              text: message.title,
              weight: "Bolder",
              size: "Medium",
            },
            {
              type: "TextBlock",
              text: message.text,
              wrap: true,
            },
            {
              type: "FactSet",
              facts: message.fields.map(([title, value]) => ({ title, value })),
            },
          ],
        },
      },
    ],
  };
}

function encryptSecret(value: string): string {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

function decryptSecret(value: string): string {
  const [version, iv, tag, encrypted] = value.split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("Unsupported encrypted integration secret");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function encryptionKey(): Buffer {
  const secret = loadEnv().integrationEncryptionKey;
  if (!secret) {
    throw new ApiError(500, "integration_encryption_key_missing", "SLOTBOARD_INTEGRATION_ENCRYPTION_KEY is required to use workspace notifications");
  }
  if (/^[a-f0-9]{64}$/i.test(secret)) {
    return Buffer.from(secret, "hex");
  }
  const decoded = Buffer.from(secret, "base64");
  if (decoded.length === 32) {
    return decoded;
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

function toDTO(row: NotificationIntegrationRow): NotificationIntegrationDTO {
  return {
    id: row.id,
    provider: row.provider,
    destinationLabel: row.destination_label,
    status: row.status,
    lastTestedAt: row.last_tested_at?.toISOString(),
    lastError: row.last_error ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function formatSlotTime(slot: SlotDTO, timeZone: string): string {
  const start = new Date(slot.startsAt);
  const end = new Date(slot.endsAt);
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(start);
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
  return `${date}, ${timeFormatter.format(start)}-${timeFormatter.format(end)} ${timeZone}`;
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

type NotificationMessage = {
  type: WorkspaceNotificationType;
  title: string;
  text: string;
  fields: Array<[string, string]>;
};

type NotificationDeliveryResult = {
  status: "sent" | "failed";
  providerStatus?: number | undefined;
  providerResponse?: string | undefined;
  error?: string | undefined;
};

type NotificationIntegrationRow = {
  id: string;
  provider: NotificationProvider;
  destination_label: string;
  status: "active" | "disabled" | "failed";
  last_tested_at: Date | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
};

type NotificationIntegrationSecretRow = NotificationIntegrationRow & {
  organization_id: string;
  encrypted_secret: string;
};
