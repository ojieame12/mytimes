import type pg from "pg";
import { ApiError } from "./errors.js";

export const COMPANY_INCLUDED_ORGANIZER_SEATS = 10;

export type OrganizationRole = "owner" | "admin" | "organizer";
export type OrganizationMemberStatus = "invited" | "active" | "removed";

export type OrganizationMembership = {
  organizationId: string;
  userId: string | null;
  email: string;
  role: OrganizationRole;
  status: OrganizationMemberStatus;
};

export type AccountWorkspaceResponse = {
  eligible: boolean;
  reason?: "company_required";
  organization?: {
    id: string;
    name: string;
    slug?: string | undefined;
    seatLimit: number;
    status: "active" | "suspended" | "cancelled";
  } | undefined;
  currentMember?: {
    role: OrganizationRole;
    status: OrganizationMemberStatus;
  } | undefined;
  members: {
    id: string;
    userId?: string | undefined;
    email: string;
    role: OrganizationRole;
    status: OrganizationMemberStatus;
    invitedAt: string;
    acceptedAt?: string | undefined;
  }[];
};

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

export async function ensureCompanyWorkspaceForOwner(
  db: Queryable,
  input: {
    ownerUserId: string;
    ownerEmail: string;
    name?: string | undefined;
  },
): Promise<{ organizationId: string }> {
  const existing = await db.query<{ id: string }>(
    `
      select o.id
      from slotboard.organizations o
      where o.billing_owner_user_id = $1
         or lower(o.billing_owner_email) = lower($2)
      order by o.created_at asc
      limit 1
    `,
    [input.ownerUserId, input.ownerEmail],
  );

  const organizationId =
    existing.rows[0]?.id ??
    (await db.query<{ id: string }>(
      `
        insert into slotboard.organizations (
          name,
          billing_owner_user_id,
          billing_owner_email,
          seat_limit,
          status
        )
        values ($1, $2, $3, $4, 'active')
        returning id
      `,
      [
        input.name ?? defaultOrganizationName(input.ownerEmail),
        input.ownerUserId,
        input.ownerEmail,
        COMPANY_INCLUDED_ORGANIZER_SEATS,
      ],
    )).rows[0]?.id;

  if (!organizationId) {
    throw new ApiError(500, "organization_create_failed", "Could not create Company workspace");
  }

  await db.query(
    `
      insert into slotboard.organization_members (
        organization_id,
        user_id,
        email,
        role,
        status,
        accepted_at
      )
      values ($1, $2, $3, 'owner', 'active', now())
      on conflict (organization_id, (lower(email))) do update
      set user_id = coalesce(excluded.user_id, slotboard.organization_members.user_id),
          role = case
            when slotboard.organization_members.role = 'owner' then 'owner'
            else excluded.role
          end,
          status = 'active',
          accepted_at = coalesce(slotboard.organization_members.accepted_at, now())
    `,
    [organizationId, input.ownerUserId, input.ownerEmail],
  );

  return { organizationId };
}

export async function readOrganizationMemberships(
  db: Queryable,
  userId: string,
): Promise<OrganizationMembership[]> {
  const result = await db.query<{
    organization_id: string;
    user_id: string | null;
    email: string;
    role: OrganizationRole;
    status: OrganizationMemberStatus;
  }>(
    `
      select
        organization_id,
        user_id,
        email,
        role,
        status
      from slotboard.organization_members
      where user_id = $1
        and status = 'active'
      order by created_at asc
    `,
    [userId],
  );

  return result.rows.map((row) => ({
    organizationId: row.organization_id,
    userId: row.user_id,
    email: row.email,
    role: row.role,
    status: row.status,
  }));
}

export async function readAccountWorkspace(
  db: Queryable,
  input: {
    userId: string;
    email: string;
  },
): Promise<AccountWorkspaceResponse> {
  await acceptPendingOrganizationInvitesForUser(db, input);

  const activeSubscription = await db.query<{ organization_id: string | null }>(
    `
      select organization_id
      from slotboard.subscriptions
      where plan_key = 'company_standby'
        and status in ('active', 'trialing')
        and (
          current_period_end is null
          or current_period_end > now()
        )
        and (
          owner_user_id = $1
          or lower(owner_email) = lower($2)
        )
      order by created_at asc
      limit 1
    `,
    [input.userId, input.email],
  );

  let organizationId = activeSubscription.rows[0]?.organization_id ?? null;
  if (!organizationId && activeSubscription.rows.length > 0) {
    organizationId = (await ensureCompanyWorkspaceForOwner(db, {
      ownerUserId: input.userId,
      ownerEmail: input.email,
    })).organizationId;
    await db.query(
      `
        update slotboard.subscriptions
        set organization_id = $3
        where plan_key = 'company_standby'
          and status in ('active', 'trialing')
          and (
            current_period_end is null
            or current_period_end > now()
          )
          and (
            owner_user_id = $1
            or lower(owner_email) = lower($2)
          )
      `,
      [input.userId, input.email, organizationId],
    );
  }

  if (!organizationId) {
    const memberSubscription = await db.query<{ organization_id: string }>(
      `
        select m.organization_id
        from slotboard.organization_members m
        join slotboard.subscriptions s
          on s.organization_id = m.organization_id
         and s.plan_key = 'company_standby'
         and s.status in ('active', 'trialing')
         and (
           s.current_period_end is null
           or s.current_period_end > now()
         )
        where m.user_id = $1
          and m.status = 'active'
        order by m.created_at asc
        limit 1
      `,
      [input.userId],
    );
    organizationId = memberSubscription.rows[0]?.organization_id ?? null;
  }

  if (!organizationId) {
    const ownerOrganization = await db.query<{ organization_id: string }>(
      `
        select o.id as organization_id
        from slotboard.organizations o
        where o.billing_owner_user_id = $1
          and exists (
            select 1
            from slotboard.subscriptions s
            where s.organization_id = o.id
              and s.plan_key = 'company_standby'
              and s.status in ('active', 'trialing')
              and (
                s.current_period_end is null
                or s.current_period_end > now()
              )
          )
        order by o.created_at asc
        limit 1
      `,
      [input.userId],
    );
    organizationId = ownerOrganization.rows[0]?.organization_id ?? null;
  }

  if (!organizationId) {
    return {
      eligible: false,
      reason: "company_required",
      members: [],
    };
  }

  return readWorkspaceById(db, organizationId, input.userId);
}

export async function inviteOrganizationMember(
  db: Queryable,
  input: {
    actorUserId: string;
    actorEmail: string;
    email: string;
    role: OrganizationRole;
  },
): Promise<AccountWorkspaceResponse> {
  const workspace = await readAccountWorkspace(db, {
    userId: input.actorUserId,
    email: input.actorEmail,
  });
  if (!workspace.eligible || !workspace.organization) {
    throw new ApiError(402, "company_required", "Company is required to invite organizer seats");
  }
  if (!workspace.currentMember || !["owner", "admin"].includes(workspace.currentMember.role)) {
    throw new ApiError(403, "organization_permission_denied", "Only workspace owners and admins can invite organizers");
  }

  await assertOrganizationCanInviteOrganizer(db, workspace.organization.id);
  await db.query(
    `
      insert into slotboard.organization_members (
        organization_id,
        email,
        role,
        status,
        invited_by_user_id
      )
      values ($1, $2, $3, 'invited', $4)
      on conflict (organization_id, (lower(email))) do update
      set role = excluded.role,
          status = case
            when slotboard.organization_members.status = 'removed' then 'invited'
            else slotboard.organization_members.status
          end,
          invited_by_user_id = excluded.invited_by_user_id,
          invited_at = now()
    `,
    [workspace.organization.id, input.email, input.role, input.actorUserId],
  );

  return readWorkspaceById(db, workspace.organization.id, input.actorUserId);
}

export async function assertOrganizationCanInviteOrganizer(
  db: Queryable,
  organizationId: string,
): Promise<void> {
  const result = await db.query<{ count: string; seat_limit: number }>(
    `
      select
        count(m.id)::text as count,
        o.seat_limit
      from slotboard.organizations o
      left join slotboard.organization_members m
        on m.organization_id = o.id
       and m.status in ('invited', 'active')
       and m.role in ('owner', 'admin', 'organizer')
      where o.id = $1
      group by o.id
    `,
    [organizationId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(404, "organization_not_found", "Company workspace not found");
  }
  const usedSeats = Number(row.count);
  if (usedSeats >= row.seat_limit) {
    throw new ApiError(
      402,
      "organization_seat_limit_reached",
      `Company includes ${row.seat_limit} organizer seats.`,
    );
  }
}

async function acceptPendingOrganizationInvitesForUser(
  db: Queryable,
  input: {
    userId: string;
    email: string;
  },
): Promise<void> {
  await db.query(
    `
      update slotboard.organization_members
      set user_id = $1,
          status = 'active',
          accepted_at = coalesce(accepted_at, now())
      where lower(email) = lower($2)
        and status = 'invited'
        and user_id is null
    `,
    [input.userId, input.email],
  );
}

async function readWorkspaceById(
  db: Queryable,
  organizationId: string,
  currentUserId: string,
): Promise<AccountWorkspaceResponse> {
  const organizationResult = await db.query<{
    id: string;
    name: string;
    slug: string | null;
    seat_limit: number;
    status: "active" | "suspended" | "cancelled";
  }>(
    `
      select id, name, slug, seat_limit, status
      from slotboard.organizations
      where id = $1
      limit 1
    `,
    [organizationId],
  );
  const organization = organizationResult.rows[0];
  if (!organization) {
    return {
      eligible: false,
      reason: "company_required",
      members: [],
    };
  }

  const membersResult = await db.query<{
    id: string;
    user_id: string | null;
    email: string;
    role: OrganizationRole;
    status: OrganizationMemberStatus;
    invited_at: Date;
    accepted_at: Date | null;
  }>(
    `
      select
        id,
        user_id,
        email,
        role,
        status,
        invited_at,
        accepted_at
      from slotboard.organization_members
      where organization_id = $1
        and status <> 'removed'
      order by
        case role when 'owner' then 0 when 'admin' then 1 else 2 end,
        invited_at asc
    `,
    [organizationId],
  );
  const currentMember = membersResult.rows.find((member) => member.user_id === currentUserId);

  return {
    eligible: true,
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug ?? undefined,
      seatLimit: organization.seat_limit,
      status: organization.status,
    },
    currentMember: currentMember
      ? {
          role: currentMember.role,
          status: currentMember.status,
        }
      : undefined,
    members: membersResult.rows.map((member) => ({
      id: member.id,
      userId: member.user_id ?? undefined,
      email: member.email,
      role: member.role,
      status: member.status,
      invitedAt: member.invited_at.toISOString(),
      acceptedAt: member.accepted_at?.toISOString(),
    })),
  };
}

function defaultOrganizationName(ownerEmail: string): string {
  const domain = ownerEmail.split("@")[1];
  if (!domain) {
    return "Company workspace";
  }
  return `${domain.split(".")[0] ?? "Company"} workspace`;
}
