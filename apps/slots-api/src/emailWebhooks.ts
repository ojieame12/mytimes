import { createHash, timingSafeEqual } from "node:crypto";
import { Webhook } from "svix";
import { withTransaction } from "./db.js";
import { loadEnv } from "./env.js";
import { ApiError } from "./errors.js";

type DeliveryStatus = "queued" | "sent" | "bounced" | "failed";

type NormalizedEmailWebhook = {
  provider: "resend" | "postmark" | "unknown";
  messageId: string;
  status: DeliveryStatus;
  error?: string | undefined;
  eventType: string;
};

export async function handleEmailProviderWebhook(input: {
  rawBody: string;
  headers: Headers;
}): Promise<{
  ok: true;
  provider: string;
  eventType: string;
  messageId?: string | undefined;
  matched: boolean;
  duplicate: boolean;
}> {
  const payload = verifiedPayload(input);
  const normalized = normalizeEmailWebhook(payload);
  if (!normalized) {
    return {
      ok: true,
      provider: "unknown",
      eventType: "ignored",
      matched: false,
      duplicate: false,
    };
  }

  const eventId = providerEventId(normalized, input);
  const payloadHash = sha256(input.rawBody);
  const result = await withTransaction(async (client) => {
    const inserted = await client.query<WebhookEventRow>(
      `
        insert into slotboard.email_webhook_events (
          provider,
          provider_event_id,
          event_type,
          provider_message_id,
          payload_hash
        )
        values ($1, $2, $3, $4, $5)
        on conflict (provider, provider_event_id) do nothing
        returning id, delivery_log_id
      `,
      [normalized.provider, eventId, normalized.eventType, normalized.messageId, payloadHash],
    );

    const webhookEvent = inserted.rows[0];
    if (!webhookEvent) {
      const existing = await client.query<WebhookEventRow>(
        `
          select id, delivery_log_id
          from slotboard.email_webhook_events
          where provider = $1
            and provider_event_id = $2
          limit 1
        `,
        [normalized.provider, eventId],
      );
      return {
        duplicate: true,
        matched: Boolean(existing.rows[0]?.delivery_log_id),
      };
    }

    const updated = await client.query<{ id: string }>(
      `
        update slotboard.email_delivery_logs
        set status = case
              when status in ('bounced', 'failed') and $3 = 'sent' then status
              else $3
            end,
            error = coalesce($4, error)
        where provider = $1
          and provider_message_id = $2
        returning id
      `,
      [
        normalized.provider,
        normalized.messageId,
        normalized.status,
        normalized.error?.slice(0, 2000) ?? null,
      ],
    );

    const deliveryLogId = updated.rows[0]?.id;
    if (deliveryLogId) {
      await client.query(
        `
          update slotboard.email_webhook_events
          set delivery_log_id = $2
          where id = $1
        `,
        [webhookEvent.id, deliveryLogId],
      );
    }

    return {
      duplicate: false,
      matched: Boolean(deliveryLogId),
    };
  });

  return {
    ok: true,
    provider: normalized.provider,
    eventType: normalized.eventType,
    messageId: normalized.messageId,
    matched: result.matched,
    duplicate: result.duplicate,
  };
}

type WebhookEventRow = {
  id: string;
  delivery_log_id: string | null;
};

function verifiedPayload(input: {
  rawBody: string;
  headers: Headers;
}): unknown {
  const env = loadEnv();
  const svixHeaders = {
    "svix-id": input.headers.get("svix-id") ?? "",
    "svix-timestamp": input.headers.get("svix-timestamp") ?? "",
    "svix-signature": input.headers.get("svix-signature") ?? "",
  };

  if (env.resendWebhookSecret && svixHeaders["svix-id"] && svixHeaders["svix-signature"]) {
    try {
      return new Webhook(env.resendWebhookSecret).verify(input.rawBody, svixHeaders);
    } catch {
      throw new ApiError(401, "invalid_webhook_signature", "Invalid webhook signature");
    }
  }

  assertGenericWebhookSecret(input.headers, env.emailWebhookSecret);
  try {
    return JSON.parse(input.rawBody) as unknown;
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
  }
}

function assertGenericWebhookSecret(
  headers: Headers,
  configuredSecret: string | undefined,
): void {
  if (!configuredSecret) {
    if (process.env.NODE_ENV === "production") {
      throw new ApiError(401, "webhook_secret_required", "Webhook secret is not configured");
    }
    return;
  }

  const auth = headers.get("authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : undefined;
  const provided = headers.get("x-slotboard-webhook-secret") ?? bearer;
  if (!provided || !constantTimeEqual(provided, configuredSecret)) {
    throw new ApiError(401, "invalid_webhook_secret", "Invalid webhook secret");
  }
}

function normalizeEmailWebhook(payload: unknown): NormalizedEmailWebhook | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const resendType = stringField(payload, "type");
  if (resendType?.startsWith("email.")) {
    return normalizeResendWebhook(payload, resendType);
  }

  const recordType = stringField(payload, "RecordType");
  if (recordType) {
    return normalizePostmarkWebhook(payload, recordType);
  }

  return undefined;
}

function providerEventId(
  normalized: NormalizedEmailWebhook,
  input: { rawBody: string; headers: Headers },
): string {
  const svixId = input.headers.get("svix-id");
  if (normalized.provider === "resend" && svixId) {
    return svixId;
  }
  return `${normalized.eventType}:${normalized.messageId}:${sha256(input.rawBody)}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeResendWebhook(payload: Record<string, unknown>, eventType: string): NormalizedEmailWebhook | undefined {
  const data = recordField(payload, "data");
  const messageId = data ? stringField(data, "email_id") : undefined;
  if (!data || !messageId) {
    return undefined;
  }

  if (eventType === "email.delivered" || eventType === "email.sent") {
    return { provider: "resend", eventType, messageId, status: "sent" };
  }
  if (eventType === "email.bounced" || eventType === "email.complained" || eventType === "email.suppressed") {
    return {
      provider: "resend",
      eventType,
      messageId,
      status: "bounced",
      error: resendError(data, "bounce") ?? resendError(data, "complaint") ?? eventType,
    };
  }
  if (eventType === "email.failed") {
    return {
      provider: "resend",
      eventType,
      messageId,
      status: "failed",
      error: resendError(data, "failed") ?? eventType,
    };
  }
  if (eventType === "email.delivery_delayed") {
    return {
      provider: "resend",
      eventType,
      messageId,
      status: "queued",
      error: "delivery_delayed",
    };
  }

  return undefined;
}

function normalizePostmarkWebhook(payload: Record<string, unknown>, recordType: string): NormalizedEmailWebhook | undefined {
  const messageId = stringField(payload, "MessageID");
  if (!messageId) {
    return undefined;
  }

  if (recordType === "Delivery") {
    return { provider: "postmark", eventType: recordType, messageId, status: "sent" };
  }
  if (recordType === "Bounce" || recordType === "SpamComplaint") {
    return {
      provider: "postmark",
      eventType: recordType,
      messageId,
      status: "bounced",
      error: [stringField(payload, "Name"), stringField(payload, "Description"), stringField(payload, "Details")]
        .filter(Boolean)
        .join(": ") || recordType,
    };
  }
  if (recordType === "SMTPAPIError") {
    return {
      provider: "postmark",
      eventType: recordType,
      messageId,
      status: "failed",
      error: stringField(payload, "Error") ?? stringField(payload, "Message") ?? recordType,
    };
  }

  return undefined;
}

function resendError(data: Record<string, unknown>, field: string): string | undefined {
  const nested = recordField(data, field);
  if (!nested) {
    return undefined;
  }
  return stringField(nested, "message") ?? stringField(nested, "reason") ?? stringField(nested, "type");
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function recordField(value: Record<string, unknown>, field: string): Record<string, unknown> | undefined {
  const fieldValue = value[field];
  return isRecord(fieldValue) ? fieldValue : undefined;
}

function stringField(value: Record<string, unknown>, field: string): string | undefined {
  const fieldValue = value[field];
  return typeof fieldValue === "string" ? fieldValue : undefined;
}
