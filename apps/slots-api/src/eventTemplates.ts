import type { AvailabilityInput } from "@fresh-feel/slotboard-core";
import type pg from "pg";
import { getPool } from "./db.js";
import { ApiError } from "./errors.js";
import { readAccountWorkspace } from "./organizations.js";

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

export type EventTemplateDTO = {
  id: string;
  organizationId: string;
  name: string;
  title: string;
  description: string;
  timezone: string;
  durationMinutes: number;
  intervalMinutes: number;
  allowMultipleBookings: boolean;
  availability: AvailabilityInput;
  createdAt: string;
  updatedAt: string;
};

export type AccountTemplatesResponse = {
  eligible: boolean;
  reason?: "company_required";
  templates: EventTemplateDTO[];
};

export async function readAccountTemplates(input: {
  userId: string;
  email: string;
}): Promise<AccountTemplatesResponse> {
  const db = getPool();
  const workspace = await readAccountWorkspace(db, input);
  if (!workspace.eligible || !workspace.organization) {
    return {
      eligible: false,
      reason: "company_required",
      templates: [],
    };
  }

  const result = await db.query<EventTemplateRow>(
    `
      select
        id,
        organization_id,
        name,
        title,
        description,
        timezone,
        meeting_duration_minutes,
        interval_minutes,
        allow_multiple_bookings,
        availability_config,
        created_at,
        updated_at
      from slotboard.event_templates
      where organization_id = $1
      order by created_at desc
    `,
    [workspace.organization.id],
  );

  return {
    eligible: true,
    templates: result.rows.map(mapTemplateRow),
  };
}

export async function createEventTemplateFromEvent(input: {
  userId: string;
  email: string;
  eventId: string;
  name?: string | undefined;
}): Promise<{ template: EventTemplateDTO }> {
  const db = getPool();
  const workspace = await readAccountWorkspace(db, {
    userId: input.userId,
    email: input.email,
  });
  if (!workspace.eligible || !workspace.organization || !workspace.currentMember) {
    throw new ApiError(402, "company_required", "Team templates are included with Company.");
  }
  if (workspace.currentMember.status !== "active") {
    throw new ApiError(403, "workspace_access_denied", "Your workspace membership is not active.");
  }

  const event = await db.query<EventTemplateSourceRow>(
    `
      select
        id,
        title,
        description,
        timezone,
        meeting_duration_minutes,
        interval_minutes,
        allow_multiple_bookings,
        availability_config
      from slotboard.booking_events
      where id = $1
        and deleted_at is null
        and (
          organization_id = $2
          or owner_user_id = $3
        )
      limit 1
    `,
    [input.eventId, workspace.organization.id, input.userId],
  );
  const source = event.rows[0];
  if (!source) {
    throw new ApiError(404, "event_not_found", "This board is not available in your Company workspace.");
  }

  const name = normalizeTemplateName(input.name ?? source.title);
  const created = await db.query<EventTemplateRow>(
    `
      insert into slotboard.event_templates (
        organization_id,
        created_by_user_id,
        name,
        title,
        description,
        timezone,
        meeting_duration_minutes,
        interval_minutes,
        allow_multiple_bookings,
        availability_config
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
      returning
        id,
        organization_id,
        name,
        title,
        description,
        timezone,
        meeting_duration_minutes,
        interval_minutes,
        allow_multiple_bookings,
        availability_config,
        created_at,
        updated_at
    `,
    [
      workspace.organization.id,
      input.userId,
      name,
      source.title,
      source.description,
      source.timezone,
      source.meeting_duration_minutes,
      source.interval_minutes,
      source.allow_multiple_bookings,
      JSON.stringify(source.availability_config),
    ],
  );

  const template = created.rows[0];
  if (!template) {
    throw new ApiError(500, "template_create_failed", "Could not save this board as a template.");
  }

  return {
    template: mapTemplateRow(template),
  };
}

function normalizeTemplateName(value: string): string {
  const name = value.trim();
  if (name.length < 1 || name.length > 160) {
    throw new ApiError(400, "invalid_template", "Template name must be between 1 and 160 characters.");
  }
  return name;
}

function mapTemplateRow(row: EventTemplateRow): EventTemplateDTO {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    title: row.title,
    description: row.description,
    timezone: row.timezone,
    durationMinutes: row.meeting_duration_minutes,
    intervalMinutes: row.interval_minutes,
    allowMultipleBookings: row.allow_multiple_bookings,
    availability: row.availability_config,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

type EventTemplateSourceRow = {
  id: string;
  title: string;
  description: string;
  timezone: string;
  meeting_duration_minutes: number;
  interval_minutes: number;
  allow_multiple_bookings: boolean;
  availability_config: AvailabilityInput;
};

type EventTemplateRow = EventTemplateSourceRow & {
  organization_id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
};
