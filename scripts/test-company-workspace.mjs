import pg from "pg";
import { createServer } from "node:http";
import { createTokenPair } from "@fresh-feel/slotboard-core";
import { ApiError } from "../apps/slots-api/src/errors.ts";

const { Pool } = pg;

const databaseURL =
  process.env.SLOTBOARD_DATABASE_URL ||
  "postgres://slotboard:slotboard@localhost:5434/slotboard?sslmode=disable";
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const pool = new Pool({ connectionString: databaseURL, application_name: "slotboard-company-workspace-test" });

process.env.SLOTBOARD_DATABASE_URL ||= databaseURL;
process.env.SLOTBOARD_INTEGRATION_ENCRYPTION_KEY ||= "company-workspace-notification-test-key-32";

const {
  COMPANY_INCLUDED_ORGANIZER_SEATS,
  ensureCompanyWorkspaceForOwner,
  inviteOrganizationMember,
  readAccountWorkspace,
} = await import("../apps/slots-api/src/organizations.ts");
const {
  createMyBoardsAdminLink,
  readMyBoards,
} = await import("../apps/slots-api/src/myBoards.ts");
const {
  createEventTemplateFromEvent,
  readAccountTemplates,
} = await import("../apps/slots-api/src/eventTemplates.ts");
const {
  readAdminDashboard,
  rotateOrganizerPrivateLink,
} = await import("../apps/slots-api/src/slotboard.ts");
const {
  createAccountNotificationIntegration,
  notifyWorkspaceIntegrations,
  testAccountNotificationIntegration,
} = await import("../apps/slots-api/src/notificationIntegrations.ts");
const { closePool: closeApiPool } = await import("../apps/slots-api/src/db.ts");

try {
  await assertCompanyWorkspaceSchemaReady();

  const ownerUserId = `company-owner-${suffix}`;
  const ownerEmail = `company-owner+${suffix}@example.com`;
  await createAuthUser(ownerUserId, ownerEmail, "Company Owner");

  const { organizationId } = await ensureCompanyWorkspaceForOwner(pool, {
    ownerUserId,
    ownerEmail,
    name: "Company Workspace Test",
  });
  await createActiveCompanySubscription({
    organizationId,
    ownerUserId,
    ownerEmail,
  });

  const ownerWorkspace = await readAccountWorkspace(pool, {
    userId: ownerUserId,
    email: ownerEmail,
  });
  assert(ownerWorkspace.eligible === true, "expected owner workspace to be eligible");
  assert(ownerWorkspace.organization?.id === organizationId, "expected owner workspace organization id");
  assert(ownerWorkspace.organization?.seatLimit === COMPANY_INCLUDED_ORGANIZER_SEATS, "expected 10 organizer seats");
  assert(ownerWorkspace.currentMember?.role === "owner", "expected owner membership role");

  const invitedEmails = [];
  for (let index = 0; index < COMPANY_INCLUDED_ORGANIZER_SEATS - 1; index += 1) {
    const email = `company-member-${index}+${suffix}@example.com`;
    invitedEmails.push(email);
    const workspace = await inviteOrganizationMember(pool, {
      actorUserId: ownerUserId,
      actorEmail: ownerEmail,
      email,
      role: "organizer",
    });
    assert(workspace.members.some((member) => member.email === email), `expected invited member ${email}`);
  }

  const fullWorkspace = await readAccountWorkspace(pool, {
    userId: ownerUserId,
    email: ownerEmail,
  });
  assert(
    fullWorkspace.members.filter((member) => member.status === "active" || member.status === "invited").length ===
      COMPANY_INCLUDED_ORGANIZER_SEATS,
    "expected 10 organizer seats to be occupied by owner plus invites",
  );

  await expectApiError(
    () =>
      inviteOrganizationMember(pool, {
        actorUserId: ownerUserId,
        actorEmail: ownerEmail,
        email: `company-over-limit+${suffix}@example.com`,
        role: "organizer",
      }),
    "organization_seat_limit_reached",
  );

  const invitedUserId = `company-invited-${suffix}`;
  const invitedEmail = invitedEmails[0];
  await createAuthUser(invitedUserId, invitedEmail, "Company Invited Organizer");
  const invitedWorkspace = await readAccountWorkspace(pool, {
    userId: invitedUserId,
    email: invitedEmail,
  });
  assert(invitedWorkspace.eligible === true, "expected invited organizer to access workspace");
  assert(invitedWorkspace.organization?.id === organizationId, "expected invited organizer workspace id");
  assert(invitedWorkspace.currentMember?.role === "organizer", "expected invited organizer role");
  assert(
    invitedWorkspace.members.some(
      (member) => member.email === invitedEmail && member.userId === invitedUserId && member.status === "active",
    ),
    "expected matching signed-in email to accept workspace invite",
  );

  const organizationBoardId = await createOrganizationBoard({
    organizationId,
    ownerUserId: invitedUserId,
    organizerEmail: `consultant+${suffix}@example.com`,
  });
  const boardsToken = await createMyBoardsLink(ownerEmail);
  const recoveredBoards = await readMyBoards(boardsToken.rawToken);
  assert(
    recoveredBoards.boards.some((board) => board.id === organizationBoardId),
    "expected company-wide recovery to include organization boards created by another organizer",
  );
  const recoveredAdminLink = await createMyBoardsAdminLink(boardsToken.rawToken, organizationBoardId);
  assert(recoveredAdminLink.url.includes("/a/"), "expected company-wide recovery to rotate an admin link");

  const privateLinkBoard = await createOwnedBoardForPrivateLink({
    ownerUserId: invitedUserId,
    organizerEmail: invitedEmail,
  });
  const privateDashboardBefore = await readAdminDashboard(privateLinkBoard.adminToken);
  assert(privateDashboardBefore.event.id === privateLinkBoard.eventId, "expected old private admin URL to open before rotation");
  await rotateOrganizerPrivateLink(invitedUserId, privateLinkBoard.eventId);
  await expectApiError(
    () => readAdminDashboard(privateLinkBoard.adminToken),
    "event_not_found",
  );
  await expectApiError(
    () => rotateOrganizerPrivateLink(ownerUserId, privateLinkBoard.eventId),
    "event_not_found",
  );
  assert(
    (await latestAdminRotationReason(privateLinkBoard.eventId)) === "account_rotated",
    "expected account private admin URL rotation to record activity",
  );

  const savedTemplate = await createEventTemplateFromEvent({
    userId: ownerUserId,
    email: ownerEmail,
    eventId: organizationBoardId,
    name: "Vision Assessment template",
  });
  assert(savedTemplate.template.name === "Vision Assessment template", "expected named team template");
  assert(savedTemplate.template.organizationId === organizationId, "expected team template organization id");

  const templates = await readAccountTemplates({
    userId: invitedUserId,
    email: invitedEmail,
  });
  assert(templates.eligible === true, "expected invited organizer to read team templates");
  assert(
    templates.templates.some((template) => template.id === savedTemplate.template.id),
    "expected team template to be shared across the workspace",
  );

  const fakeSlack = await startFakeWebhookServer();
  try {
    const notificationSettings = await createAccountNotificationIntegration({
      userId: ownerUserId,
      email: ownerEmail,
      integration: {
        provider: "slack",
        destinationLabel: "#candidate-loop",
        webhookUrl: fakeSlack.url,
      },
    });
    const slackIntegration = notificationSettings.integrations.find((integration) => integration.provider === "slack");
    assert(slackIntegration, "expected Slack notification integration");
    assert(!(await storedNotificationSecret(slackIntegration.id)).includes(fakeSlack.url), "expected encrypted webhook URL at rest");

    const testDelivery = await testAccountNotificationIntegration({
      userId: ownerUserId,
      email: ownerEmail,
      integrationId: slackIntegration.id,
    });
    assert(testDelivery.delivery.status === "sent", "expected Slack test notification to send");
    assert(fakeSlack.payloads.some((payload) => JSON.stringify(payload).includes("mytimes test notification")), "expected fake Slack webhook to receive test payload");

    const notificationFixture = await createNotificationFixture({
      organizationId,
      ownerUserId,
      organizerEmail: ownerEmail,
    });
    await notifyWorkspaceIntegrations({
      type: "booking_created",
      event: notificationFixture.event,
      slot: notificationFixture.slot,
      booking: notificationFixture.booking,
    });
    assert(fakeSlack.payloads.some((payload) => JSON.stringify(payload).includes("New booking")), "expected booking notification payload");
    assert((await notificationDeliveryCount(notificationFixture.event.id)) === 1, "expected one notification delivery log for booking event");
  } finally {
    await fakeSlack.close();
  }

  const fakeTeams = await startFakeWebhookServer();
  try {
    const notificationSettings = await createAccountNotificationIntegration({
      userId: ownerUserId,
      email: ownerEmail,
      integration: {
        provider: "teams",
        destinationLabel: "Hiring channel",
        webhookUrl: fakeTeams.url,
      },
    });
    const teamsIntegration = notificationSettings.integrations.find((integration) => integration.provider === "teams");
    assert(teamsIntegration, "expected Teams notification integration");
    assert(!(await storedNotificationSecret(teamsIntegration.id)).includes(fakeTeams.url), "expected encrypted Teams webhook URL at rest");

    const testDelivery = await testAccountNotificationIntegration({
      userId: ownerUserId,
      email: ownerEmail,
      integrationId: teamsIntegration.id,
    });
    assert(testDelivery.delivery.status === "sent", "expected Teams test notification to send");
    assert(fakeTeams.payloads.some((payload) => JSON.stringify(payload).includes("AdaptiveCard")), "expected fake Teams webhook to receive adaptive card payload");
    assert(fakeTeams.payloads.some((payload) => JSON.stringify(payload).includes("mytimes test notification")), "expected fake Teams webhook to receive test payload");
  } finally {
    await fakeTeams.close();
  }

  console.log(JSON.stringify({
    ok: true,
    checked: [
      "company-workspace-created-from-subscription-owner",
      "10 organizer seats",
      "company-workspace-seat-limit-enforced",
      "company-workspace-invite-created",
      "company-workspace-invite-accepted-by-matching-email",
      "company-wide recovery",
      "account private admin URL rotation",
      "team template saved from a board",
      "team template readable by another organizer",
      "Slack notification integration stores encrypted webhook",
      "Slack test notification delivered",
      "Slack booking notification delivered",
      "Teams notification integration stores encrypted webhook",
      "Teams test notification delivered",
    ],
  }, null, 2));
} finally {
  await pool.end();
  await closeApiPool();
}

async function assertCompanyWorkspaceSchemaReady() {
  const result = await pool.query(
    `
      select
        to_regclass('slotboard.organizations') is not null
        and to_regclass('slotboard.organization_members') is not null
        and to_regclass('slotboard.event_templates') is not null as exists
    `,
  );
  assert(
    result.rows[0]?.exists === true,
    "expected Company workspace tables; run npm run migrate --workspace @fresh-feel/slots-api",
  );
}

async function createAuthUser(id, email, name) {
  await pool.query(
    `
      insert into slotboard.auth_users (
        id,
        name,
        email,
        email_verified
      )
      values ($1, $2, $3, true)
      on conflict (id) do update
      set email = excluded.email,
          name = excluded.name,
          email_verified = true
    `,
    [id, name, email],
  );
}

async function createActiveCompanySubscription({ organizationId, ownerUserId, ownerEmail }) {
  await pool.query(
    `
      insert into slotboard.subscriptions (
        owner_email,
        owner_user_id,
        organization_id,
        provider_customer_id,
        provider_subscription_id,
        plan_key,
        status,
        current_period_start,
        current_period_end,
        cancel_at_period_end
      )
      values ($1, $2, $3, $4, $5, 'company_standby', 'active', now(), now() + interval '30 days', false)
      on conflict (provider_subscription_id) do update
      set organization_id = excluded.organization_id,
          status = excluded.status,
          current_period_end = excluded.current_period_end
    `,
    [
      ownerEmail,
      ownerUserId,
      organizationId,
      `cus_company_workspace_${suffix.replace(/[^a-zA-Z0-9]/g, "")}`,
      `sub_company_workspace_${suffix.replace(/[^a-zA-Z0-9]/g, "")}`,
    ],
  );
}

async function createOrganizationBoard({ organizationId, ownerUserId, organizerEmail }) {
  const publicToken = createTokenPair("public", "dev-token-pepper-replace-before-production");
  const adminToken = createTokenPair("admin", "dev-token-pepper-replace-before-production");
  const result = await pool.query(
    `
      insert into slotboard.booking_events (
        title,
        description,
        organizer_name,
        organizer_email,
        timezone,
        meeting_duration_minutes,
        interval_minutes,
        public_token_hash,
        admin_token_hash,
        owner_user_id,
        organization_id,
        plan_key,
        payment_status,
        booking_limit,
        slot_limit
      )
      values (
        $1,
        'Company-wide recovery test board.',
        'Company Organizer',
        $2,
        'UTC',
        60,
        60,
        $3,
        $4,
        $5,
        $6,
        'company_standby',
        'paid',
        100000,
        100000
      )
      returning id
    `,
    [
      `Company Recovery Board ${suffix}`,
      organizerEmail,
      publicToken.tokenHash,
      adminToken.tokenHash,
      ownerUserId,
      organizationId,
    ],
  );
  const eventId = result.rows[0]?.id;
  assert(eventId, "expected organization board id");
  await pool.query(
    `
      insert into slotboard.time_slots (
        event_id,
        starts_at,
        ends_at,
        source_date,
        source_start_time,
        source_end_time,
        status
      )
      values ($1, now() + interval '14 days', now() + interval '14 days 1 hour', current_date + 14, '09:00', '10:00', 'open')
    `,
    [eventId],
  );
  return eventId;
}

async function createOwnedBoardForPrivateLink({ ownerUserId, organizerEmail }) {
  const publicToken = createTokenPair("public", "dev-token-pepper-replace-before-production");
  const adminToken = createTokenPair("admin", "dev-token-pepper-replace-before-production");
  const result = await pool.query(
    `
      insert into slotboard.booking_events (
        title,
        description,
        organizer_name,
        organizer_email,
        timezone,
        meeting_duration_minutes,
        interval_minutes,
        public_token_hash,
        admin_token_hash,
        owner_user_id,
        plan_key,
        payment_status,
        booking_limit,
        slot_limit
      )
      values (
        $1,
        'Account private admin URL rotation test board.',
        'Account Organizer',
        $2,
        'UTC',
        30,
        30,
        $3,
        $4,
        $5,
        'free',
        'not_required',
        15,
        30
      )
      returning id
    `,
    [
      `Account Private Link Board ${suffix}`,
      organizerEmail,
      publicToken.tokenHash,
      adminToken.tokenHash,
      ownerUserId,
    ],
  );
  const eventId = result.rows[0]?.id;
  assert(eventId, "expected account private link board id");
  return { eventId, adminToken: adminToken.rawToken };
}

async function latestAdminRotationReason(eventId) {
  const result = await pool.query(
    `
      select metadata->>'reason' as reason
      from slotboard.activity_events
      where event_id = $1
        and type = 'admin_link_rotated'
      order by created_at desc
      limit 1
    `,
    [eventId],
  );
  return result.rows[0]?.reason;
}

async function createNotificationFixture({ organizationId, ownerUserId, organizerEmail }) {
  const eventId = await createOrganizationBoard({
    organizationId,
    ownerUserId,
    organizerEmail,
  });
  const slotResult = await pool.query(
    `
      select id, starts_at, ends_at, source_date, source_start_time, source_end_time
      from slotboard.time_slots
      where event_id = $1
      order by starts_at asc
      limit 1
    `,
    [eventId],
  );
  const slotRow = slotResult.rows[0];
  assert(slotRow, "expected notification fixture slot");
  const bookingResult = await pool.query(
    `
      insert into slotboard.bookings (
        event_id,
        slot_id,
        participant_name,
        participant_email,
        manage_token_hash
      )
      values ($1, $2, 'Jordan Smith', 'jordan.smith@example.com', $3)
      returning id, booked_at, created_at, updated_at
    `,
    [eventId, slotRow.id, createTokenPair("manage", "dev-token-pepper-replace-before-production").tokenHash],
  );
  await pool.query(
    `
      update slotboard.time_slots
      set status = 'closed'
      where id = $1
    `,
    [slotRow.id],
  );
  const bookingRow = bookingResult.rows[0];
  assert(bookingRow, "expected notification fixture booking");
  return {
    event: {
      id: eventId,
      title: `Company Recovery Board ${suffix}`,
      description: "Company-wide recovery test board.",
      organizerName: "Company Organizer",
      organizerEmail,
      avatarStyle: "notionists",
      timezone: "UTC",
      durationMinutes: 60,
      intervalMinutes: 60,
      allowMultipleBookings: false,
      status: "active",
      planKey: "company_standby",
      paymentStatus: "paid",
      bookingLimit: 100000,
      slotLimit: 100000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    slot: {
      id: slotRow.id,
      eventId,
      startsAt: slotRow.starts_at.toISOString(),
      endsAt: slotRow.ends_at.toISOString(),
      sourceDate: typeof slotRow.source_date === "string" ? slotRow.source_date : slotRow.source_date?.toISOString().slice(0, 10),
      sourceStartTime: slotRow.source_start_time,
      sourceEndTime: slotRow.source_end_time,
      state: "just-claimed",
    },
    booking: {
      id: bookingRow.id,
      eventId,
      slotId: slotRow.id,
      participantName: "Jordan Smith",
      participantEmail: "jordan.smith@example.com",
      notes: "",
      status: "active",
      bookedAt: bookingRow.booked_at.toISOString(),
      createdAt: bookingRow.created_at.toISOString(),
      updatedAt: bookingRow.updated_at.toISOString(),
    },
  };
}

async function storedNotificationSecret(integrationId) {
  const result = await pool.query(
    `
      select encrypted_secret
      from slotboard.notification_integrations
      where id = $1
      limit 1
    `,
    [integrationId],
  );
  return result.rows[0]?.encrypted_secret ?? "";
}

async function notificationDeliveryCount(eventId) {
  const result = await pool.query(
    `
      select count(*)::int as count
      from slotboard.notification_delivery_logs
      where event_id = $1
        and notification_type = 'booking_created'
        and status = 'sent'
    `,
    [eventId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function startFakeWebhookServer() {
  const payloads = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      payloads.push(raw ? JSON.parse(raw) : {});
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object", "expected fake webhook server address");
  return {
    url: `http://127.0.0.1:${address.port}/slack`,
    payloads,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function createMyBoardsLink(ownerEmail) {
  const token = createTokenPair("boards", "dev-token-pepper-replace-before-production");
  await pool.query(
    `
      insert into slotboard.my_boards_links (
        owner_email,
        token_hash,
        expires_at
      )
      values ($1, $2, now() + interval '14 days')
    `,
    [ownerEmail, token.tokenHash],
  );
  return token;
}

async function expectApiError(action, code) {
  try {
    await action();
  } catch (error) {
    if (error instanceof ApiError && error.code === code) {
      return;
    }
    throw error;
  }
  throw new Error(`expected ${code}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
