import { createTokenPair } from "@fresh-feel/slotboard-core";
import type pg from "pg";
import { tokenHash } from "./auth.js";
import { getPool, withTransaction } from "./db.js";
import { sendMyBoardsLinkEmail, type EmailDeliveryResult } from "./email.js";
import { loadEnv } from "./env.js";
import { ApiError } from "./errors.js";
import { recordActivity } from "./activity.js";

const MY_BOARDS_LINK_TTL_DAYS = 14;

export type MyBoardsRequestResponse = {
  ok: true;
  delivery?: EmailDeliveryResult | undefined;
};

export type MyBoardsResponse = {
  ownerEmail: string;
  expiresAt: string;
  boards: MyBoardSummary[];
};

export type MyBoardSummary = {
  id: string;
  title: string;
  status: "active" | "archived";
  planKey: "free" | "event_pass" | "company_standby";
  paymentStatus: "not_required" | "pending" | "paid" | "failed" | "refunded";
  slotCount: number;
  openSlots: number;
  bookingCount: number;
  createdAt: string;
  expiresAt?: string | undefined;
};

export async function requestMyBoardsLink(organizerEmail: string): Promise<MyBoardsRequestResponse> {
  const boardCount = await countRecoverableBoards(organizerEmail);
  if (boardCount < 1) {
    return { ok: true };
  }

  const env = loadEnv();
  const token = createTokenPair("boards", env.tokenPepper);
  const expiresAt = addDays(new Date(), MY_BOARDS_LINK_TTL_DAYS);

  await withTransaction(async (client) => {
    await client.query(
      `
        delete from slotboard.my_boards_links
        where owner_email = $1
          and expires_at <= now()
      `,
      [organizerEmail],
    );
    await client.query(
      `
        insert into slotboard.my_boards_links (
          owner_email,
          token_hash,
          expires_at
        )
        values ($1, $2, $3)
      `,
      [organizerEmail, token.tokenHash, expiresAt],
    );
  });

  const boardsURL = buildAppURL(`/my-boards?t=${encodeURIComponent(token.rawToken)}`, env.publicAppURL);
  const delivery = await sendMyBoardsLinkEmail({
    organizerEmail,
    boardsURL,
    boardCount,
    expiresAt,
  });

  return { ok: true, delivery };
}

export async function readMyBoards(rawToken: string): Promise<MyBoardsResponse> {
  const link = await readActiveMyBoardsLink(rawToken);
  const boards = await readBoardsForEmail(link.owner_email);
  return {
    ownerEmail: link.owner_email,
    expiresAt: link.expires_at.toISOString(),
    boards,
  };
}

export async function createMyBoardsAdminLink(
  rawToken: string,
  eventId: string,
): Promise<{ url: string }> {
  const env = loadEnv();
  const link = await readActiveMyBoardsLink(rawToken);
  const adminToken = createTokenPair("admin", env.tokenPepper);

  const event = await withTransaction(async (client) => {
    const updated = await client.query<AdminLinkEventRow>(
      `
        update slotboard.booking_events
        set admin_token_hash = $3
        where id = $1
          and (
            lower(organizer_email) = lower($2)
            or organization_id in (
              select id
              from slotboard.organizations
              where lower(billing_owner_email) = lower($2)
              union
              select organization_id as id
              from slotboard.organization_members
              where lower(email) = lower($2)
                and status = 'active'
            )
          )
          and deleted_at is null
        returning id, title, organizer_name
      `,
      [eventId, link.owner_email, adminToken.tokenHash],
    );
    const row = updated.rows[0];
    if (!row) {
      throw new ApiError(404, "event_not_found", "Board not found for this mytimes link");
    }
    await recordActivity(client, {
      eventId: row.id,
      type: "admin_link_rotated",
      actorType: "organizer",
      actorLabel: row.organizer_name,
      metadata: {
        reason: "my_boards",
      },
    });
    return row;
  });

  return {
    url: buildAppURL(`/a/${adminToken.rawToken}`, env.publicAppURL),
  };
}

async function countRecoverableBoards(organizerEmail: string): Promise<number> {
  const result = await getPool().query<{ count: string }>(
    `
      with recoverable_organizations as (
        select id
        from slotboard.organizations
        where lower(billing_owner_email) = lower($1)
        union
        select organization_id as id
        from slotboard.organization_members
        where lower(email) = lower($1)
          and status = 'active'
      )
      select count(*)::text as count
      from slotboard.booking_events
      where (
          lower(organizer_email) = lower($1)
          or organization_id in (select id from recoverable_organizations)
        )
        and deleted_at is null
    `,
    [organizerEmail],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function readActiveMyBoardsLink(rawToken: string): Promise<MyBoardsLinkRow> {
  const result = await getPool().query<MyBoardsLinkRow>(
    `
      update slotboard.my_boards_links
      set last_used_at = now()
      where token_hash = $1
        and expires_at > now()
      returning owner_email, expires_at
    `,
    [tokenHash(rawToken)],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(401, "invalid_my_boards_token", "This mytimes boards link is invalid or expired");
  }
  return row;
}

async function readBoardsForEmail(ownerEmail: string): Promise<MyBoardSummary[]> {
  const result = await getPool().query<MyBoardSummaryRow>(
    `
      with recoverable_organizations as (
        select id
        from slotboard.organizations
        where lower(billing_owner_email) = lower($1)
        union
        select organization_id as id
        from slotboard.organization_members
        where lower(email) = lower($1)
          and status = 'active'
      ),
      recoverable_events as (
        select e.*
        from slotboard.booking_events e
        where (
            lower(e.organizer_email) = lower($1)
            or e.organization_id in (select id from recoverable_organizations)
          )
          and e.deleted_at is null
      ),
      ranked_slots as (
        select
          s.id,
          s.event_id,
          s.status,
          row_number() over (partition by s.event_id order by s.starts_at asc, s.id asc)::int as publish_rank
        from slotboard.time_slots s
        join recoverable_events e on e.id = s.event_id
      )
      select
        e.id,
        e.title,
        e.status,
        e.plan_key,
        e.payment_status,
        e.slot_limit,
        e.created_at,
        e.expires_at,
        count(distinct rs.id) filter (
          where rs.publish_rank <= e.slot_limit
        )::int as slot_count,
        count(distinct rs.id) filter (
          where rs.publish_rank <= e.slot_limit
            and rs.status = 'open'
            and b.id is null
        )::int as open_slots,
        count(distinct b.id)::int as booking_count
      from recoverable_events e
      left join ranked_slots rs on rs.event_id = e.id
      left join slotboard.bookings b on b.slot_id = rs.id and b.cancelled_at is null
      group by
        e.id,
        e.title,
        e.status,
        e.plan_key,
        e.payment_status,
        e.slot_limit,
        e.created_at,
        e.expires_at
      order by e.created_at desc
    `,
    [ownerEmail],
  );

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status === "deleted" ? "archived" : row.status,
    planKey: row.plan_key,
    paymentStatus: row.payment_status,
    slotCount: row.slot_count,
    openSlots: row.open_slots,
    bookingCount: row.booking_count,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at?.toISOString(),
  }));
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function buildAppURL(path: string, baseURL: string): string {
  return new URL(path, withTrailingSlash(baseURL)).toString();
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

type MyBoardsLinkRow = {
  owner_email: string;
  expires_at: Date;
};

type MyBoardSummaryRow = {
  id: string;
  title: string;
  status: "active" | "archived" | "deleted";
  plan_key: "free" | "event_pass" | "company_standby";
  payment_status: "not_required" | "pending" | "paid" | "failed" | "refunded";
  slot_limit: number;
  created_at: Date;
  expires_at: Date | null;
  slot_count: number;
  open_slots: number;
  booking_count: number;
};

type AdminLinkEventRow = {
  id: string;
  title: string;
  organizer_name: string;
};
