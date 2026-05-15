const baseURL = process.env.SLOTBOARD_API_URL || "http://127.0.0.1:3014";
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const slotDate = isoDateAfterDays(14);
const slotWeekday = new Date(`${slotDate}T00:00:00.000Z`).getUTCDay();

await request("/healthz");
await request("/readyz");

const exclusionAvailability = {
  startDate: slotDate,
  endDate: slotDate,
  weekdays: [slotWeekday],
  dailyStart: "09:00",
  dailyEnd: "11:00",
  durationMinutes: 60,
  timezone: "Africa/Johannesburg",
  blockedRanges: [],
};
const fullPreview = await request("/api/slotboard/availability/preview", {
  method: "POST",
  json: exclusionAvailability,
});
assert(fullPreview.slots.length === 2, `expected preview to generate 2 slots, got ${fullPreview.slots.length}`);
const intervalPreview = await request("/api/slotboard/availability/preview", {
  method: "POST",
  json: {
    ...exclusionAvailability,
    intervalMinutes: 30,
  },
});
assert(
  intervalPreview.slots.length === 3,
  `expected interval preview to generate 3 overlapping starts, got ${intervalPreview.slots.length}`,
);
const excludedStart = fullPreview.slots[0].startsAt;
const excludedPreview = await request("/api/slotboard/availability/preview", {
  method: "POST",
  json: {
    ...exclusionAvailability,
    excludedSlotStarts: [excludedStart],
  },
});
assert(excludedPreview.slots.length === 1, `expected excluded preview to generate 1 slot, got ${excludedPreview.slots.length}`);

const exclusionCreated = await request("/api/slotboard/events", {
  method: "POST",
  json: {
    title: `Excluded Slot Board ${suffix}`,
    description: "Automated backend exclusion smoke test.",
    organizerName: "Smoke Organizer",
    organizerEmail: `organizer-exclusion+${suffix}@example.com`,
    timezone: "Africa/Johannesburg",
    allowMultipleBookings: false,
    availability: {
      ...exclusionAvailability,
      excludedSlotStarts: [excludedStart],
    },
  },
  expectedStatus: 201,
});
const exclusionPublicToken = tokenFromLink(exclusionCreated.links.public);
const exclusionBoard = await request("/api/slotboard/book", {
  token: exclusionPublicToken,
});
assert(exclusionBoard.slots.length === 1, `expected excluded board to expose 1 slot, got ${exclusionBoard.slots.length}`);

const created = await request("/api/slotboard/events", {
  method: "POST",
  json: {
    title: `Smoke Test Board ${suffix}`,
    description: "Automated backend smoke test.",
    organizerName: "Smoke Organizer",
    organizerEmail: `organizer+${suffix}@example.com`,
    timezone: "Africa/Johannesburg",
    allowMultipleBookings: false,
    availability: {
      startDate: slotDate,
      endDate: slotDate,
      weekdays: [slotWeekday],
      dailyStart: "09:00",
      dailyEnd: "11:00",
      durationMinutes: 60,
      timezone: "Africa/Johannesburg",
      blockedRanges: [],
    },
  },
  expectedStatus: 201,
});

const publicToken = tokenFromLink(created.links.public);
const adminToken = tokenFromLink(created.links.admin);
assert(created.shareMessage.includes(created.links.public), "expected created response to include share message with public link");
assert(
  created.email?.organizerLinks?.status === "sent",
  `expected organizer link email status sent, got ${created.email?.organizerLinks?.status}`,
);

const productEvent = await request("/api/slotboard/product-events", {
  method: "POST",
  expectedStatus: 202,
  json: {
    name: "smoke.copy_public_link",
    actorType: "organizer",
    eventId: created.event.id,
    metadata: {
      source: "smoke-api",
    },
  },
});
assert(productEvent.ok === true, "expected product event endpoint to accept bounded event");

const publicBoard = await request("/api/slotboard/book", {
  token: publicToken,
});
assert(publicBoard.slots.length === 2, `expected 2 public slots, got ${publicBoard.slots.length}`);

const slotId = publicBoard.slots[0].id;
const claimed = await request("/api/slotboard/book/claim", {
  method: "POST",
  token: publicToken,
  expectedStatus: 201,
  json: {
    slotId,
    participantName: "Smoke Participant",
    participantEmail: `participant+${suffix}@example.com`,
    notes: "Smoke test booking.",
  },
});
assert(
  claimed.email.participantConfirmation.status === "sent",
  `expected participant confirmation email status sent, got ${claimed.email.participantConfirmation.status}`,
);
assert(
  claimed.email.organizerNotice.status === "sent",
  `expected organizer notice email status sent, got ${claimed.email.organizerNotice.status}`,
);

const adminCancelSlotId = publicBoard.slots[1].id;
await request("/api/slotboard/book/claim", {
  method: "POST",
  token: publicToken,
  expectedStatus: 201,
  json: {
    slotId: adminCancelSlotId,
    participantName: "Smoke Admin Cancel",
    participantEmail: `admin-cancel+${suffix}@example.com`,
    notes: "Organizer cancellation path.",
  },
});

await request("/api/slotboard/book/recover", {
  method: "POST",
  token: publicToken,
  expectedStatus: 202,
  json: {
    participantEmail: `admin-cancel+${suffix}@example.com`,
  },
});

await request("/api/slotboard/book/claim", {
  method: "POST",
  token: publicToken,
  expectedStatus: 409,
  json: {
    slotId,
    participantName: "Smoke Duplicate",
    participantEmail: `duplicate+${suffix}@example.com`,
    notes: "Expected conflict.",
  },
});

const manageToken = tokenFromLink(claimed.links.manage);
const managed = await request("/api/slotboard/manage", {
  token: manageToken,
});
assert(managed.booking.status === "active", `expected active booking, got ${managed.booking.status}`);

const calendar = await requestText("/api/slotboard/manage/calendar.ics", {
  token: manageToken,
});
assert(calendar.includes("BEGIN:VCALENDAR"), "expected manage calendar download to return ICS");
assert(calendar.includes(`UID:${claimed.booking.id}@slotboard`), "expected ICS to include booking UID");

const resentActive = await request("/api/slotboard/manage/resend-email", {
  method: "POST",
  token: manageToken,
  expectedStatus: 202,
});
assert(
  resentActive.delivery.status === "sent" && resentActive.delivery.emailType === "booking_confirmation",
  `expected active resend to log booking_confirmation sent, got ${resentActive.delivery.emailType}:${resentActive.delivery.status}`,
);

const adminBeforeCancel = await request("/api/slotboard/admin", {
  token: adminToken,
});
assert(
  adminBeforeCancel.slots.some((slot) => slot.id === slotId && slot.state === "booked"),
  "expected admin dashboard to show booked slot",
);
assert(
  adminBeforeCancel.activity.some((item) => item.type === "event_created"),
  "expected admin dashboard to include event-created activity",
);
assert(
  adminBeforeCancel.activity.some((item) => item.type === "booking_created"),
  "expected admin dashboard to include booking-created activity",
);
assert(
  adminBeforeCancel.activity.some((item) => item.type === "manage_link_rotated"),
  "expected admin dashboard to include manage-link recovery activity",
);
const adminBookedSlot = adminBeforeCancel.slots.find(
  (slot) => slot.id === adminCancelSlotId && slot.state === "booked",
);
assert(adminBookedSlot?.bookingId, "expected booked admin slot to expose bookingId");

const adminResent = await request(`/api/slotboard/admin/bookings/${adminBookedSlot.bookingId}/resend-email`, {
  method: "POST",
  token: adminToken,
  expectedStatus: 202,
});
assert(
  adminResent.delivery.status === "sent" && adminResent.delivery.emailType === "booking_confirmation",
  `expected admin resend to log booking_confirmation sent, got ${adminResent.delivery.emailType}:${adminResent.delivery.status}`,
);
const adminResentManage = await request("/api/slotboard/manage", {
  token: tokenFromLink(adminResent.links.manage),
});
assert(
  adminResentManage.booking.id === adminBookedSlot.bookingId,
  "expected admin resend to issue a fresh manage link for the same booking",
);

const adminCancelled = await request(`/api/slotboard/admin/bookings/${adminBookedSlot.bookingId}/cancel`, {
  method: "POST",
  token: adminToken,
  json: {
    reason: "Smoke organizer cancellation.",
  },
});
assert(adminCancelled.booking.status === "cancelled", `expected admin-cancelled booking, got ${adminCancelled.booking.status}`);

const csvFree = await requestText("/api/slotboard/admin/export.csv", {
  token: adminToken,
});
assert(csvFree.includes("event_id,event_title"), "expected free board CSV export to return a CSV header");

const cancelled = await request("/api/slotboard/manage/cancel", {
  method: "POST",
  token: manageToken,
  json: {
    reason: "Smoke cancellation.",
  },
});
assert(cancelled.booking.status === "cancelled", `expected cancelled booking, got ${cancelled.booking.status}`);

const resentCancelled = await request("/api/slotboard/manage/resend-email", {
  method: "POST",
  token: manageToken,
  expectedStatus: 202,
});
assert(
  resentCancelled.delivery.status === "sent" && resentCancelled.delivery.emailType === "booking_cancellation",
  `expected cancelled resend to log booking_cancellation sent, got ${resentCancelled.delivery.emailType}:${resentCancelled.delivery.status}`,
);

await request(`/api/slotboard/admin/slots/${slotId}/close`, {
  method: "POST",
  token: adminToken,
});

const afterClose = await request("/api/slotboard/book", {
  token: publicToken,
});
assert(!afterClose.slots.some((slot) => slot.id === slotId), "expected closed slot to be hidden publicly");

await request(`/api/slotboard/admin/slots/${slotId}/reopen`, {
  method: "POST",
  token: adminToken,
});

const afterReopen = await request("/api/slotboard/book", {
  token: publicToken,
});
assert(afterReopen.slots.some((slot) => slot.id === slotId), "expected reopened slot to be public again");

const rotated = await request("/api/slotboard/admin/public-link/rotate", {
  method: "POST",
  token: adminToken,
});
assert(rotated.shareMessage.includes(rotated.links.public), "expected rotated response to include share message");
const rotatedPublicToken = tokenFromLink(rotated.links.public);
await request("/api/slotboard/book", {
  token: publicToken,
  expectedStatus: 404,
});
const rotatedPublicBoard = await request("/api/slotboard/book", {
  token: rotatedPublicToken,
});
assert(rotatedPublicBoard.event.id === created.event.id, "expected rotated public link to load same event");

const lifecycleCreated = await request("/api/slotboard/events", {
  method: "POST",
  json: {
    title: `Lifecycle Smoke Board ${suffix}`,
    description: "Automated lifecycle smoke test.",
    organizerName: "Smoke Organizer",
    organizerEmail: `organizer-lifecycle+${suffix}@example.com`,
    timezone: "Africa/Johannesburg",
    allowMultipleBookings: false,
    availability: {
      startDate: slotDate,
      endDate: slotDate,
      weekdays: [slotWeekday],
      dailyStart: "09:00",
      dailyEnd: "11:00",
      durationMinutes: 60,
      timezone: "Africa/Johannesburg",
      blockedRanges: [],
    },
  },
  expectedStatus: 201,
});
const lifecyclePublicToken = tokenFromLink(lifecycleCreated.links.public);
const lifecycleAdminToken = tokenFromLink(lifecycleCreated.links.admin);
const lifecycleBeforeArchive = await request("/api/slotboard/book", {
  token: lifecyclePublicToken,
});
assert(lifecycleBeforeArchive.slots.length === 2, "expected lifecycle board to expose public slots");
const lifecycleSlotId = lifecycleBeforeArchive.slots[0].id;

const archived = await request("/api/slotboard/admin/archive", {
  method: "POST",
  token: lifecycleAdminToken,
});
assert(archived.event.status === "archived", `expected archived event, got ${archived.event.status}`);

const archivedPublic = await request("/api/slotboard/book", {
  token: lifecyclePublicToken,
});
assert(archivedPublic.event.status === "archived", `expected archived public board, got ${archivedPublic.event.status}`);
assert(archivedPublic.slots.length === 0, "expected archived public board to hide slots");

await request("/api/slotboard/book/claim", {
  method: "POST",
  token: lifecyclePublicToken,
  expectedStatus: 409,
  json: {
    slotId: lifecycleSlotId,
    participantName: "Smoke Archived Claim",
    participantEmail: `archived-claim+${suffix}@example.com`,
    notes: "Expected archived conflict.",
  },
});

const deleted = await request("/api/slotboard/admin/delete", {
  method: "POST",
  token: lifecycleAdminToken,
});
assert(deleted.event.status === "deleted", `expected deleted event, got ${deleted.event.status}`);
await request("/api/slotboard/admin", {
  token: lifecycleAdminToken,
  expectedStatus: 404,
});
await request("/api/slotboard/book", {
  token: lifecyclePublicToken,
  expectedStatus: 404,
});

await request("/api/slotboard/recover", {
  method: "POST",
  expectedStatus: 202,
  json: {
    organizerEmail: created.event.organizerEmail,
  },
});

const webhookPayload = {
  RecordType: "Delivery",
  MessageID: `smoke-missing-${suffix}`,
  Recipient: created.event.organizerEmail,
  DeliveredAt: new Date().toISOString(),
  Details: "Smoke delivery webhook.",
  MessageStream: "outbound",
};
if (process.env.SLOTBOARD_SKIP_WEBHOOK_SMOKE !== "true") {
  const webhookResult = await request("/api/slotboard/webhooks/email-provider", {
    method: "POST",
    webhookSecret: process.env.SLOTBOARD_EMAIL_WEBHOOK_SECRET || "local-compose-webhook-secret",
    json: webhookPayload,
  });
  assert(webhookResult.ok === true, "expected email webhook to return ok");
  assert(webhookResult.duplicate === false, "expected first email webhook delivery to be new");

  const duplicateWebhookResult = await request("/api/slotboard/webhooks/email-provider", {
    method: "POST",
    webhookSecret: process.env.SLOTBOARD_EMAIL_WEBHOOK_SECRET || "local-compose-webhook-secret",
    json: webhookPayload,
  });
  assert(duplicateWebhookResult.ok === true, "expected duplicate email webhook to return ok");
  assert(duplicateWebhookResult.duplicate === true, "expected duplicate email webhook delivery to be tracked");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      baseURL,
      eventId: created.event.id,
      checked: [
        "health",
        "readiness",
        "availability-exclusions",
        "product-events",
        "create-event",
        "share-message",
        "public-read",
        "claim",
        "claim-email-status",
        "manage-link-recovery",
        "duplicate-claim-conflict",
        "manage-read",
        "manage-resend-active-email",
        "admin-read",
        "admin-resend-booking-email",
        "admin-cancel",
        "free-csv-export",
        "participant-cancel",
        "manage-resend-cancelled-email",
        "admin-close",
        "admin-reopen",
        "public-link-rotation",
        "admin-archive",
        "public-archive",
        "archived-claim-conflict",
        "admin-delete",
        "deleted-token-rejection",
        "admin-recovery",
        ...(process.env.SLOTBOARD_SKIP_WEBHOOK_SMOKE === "true" ? [] : [
          "email-webhook",
          "email-webhook-duplicate",
        ]),
      ],
    },
    null,
    2,
  ),
);

async function request(path, options = {}) {
  const response = await fetch(`${baseURL}${path}`, {
    method: options.method || "GET",
    headers: headers(options),
    body: options.json === undefined ? undefined : JSON.stringify(options.json),
  });
  const expectedStatus = options.expectedStatus || 200;
  const text = await response.text();

  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}, expected ${expectedStatus}: ${text}`);
  }

  return text ? JSON.parse(text) : undefined;
}

async function requestText(path, options = {}) {
  const response = await fetch(`${baseURL}${path}`, {
    headers: headers(options),
  });
  const text = await response.text();
  const expectedStatus = options.expectedStatus || 200;
  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}, expected ${expectedStatus}: ${text}`);
  }
  return text;
}

function headers(options) {
  const result = {
    "x-forwarded-for": process.env.SMOKE_ACTOR_KEY || `smoke-${suffix}`,
    "x-slotboard-smoke-actor": process.env.SMOKE_ACTOR_KEY || `smoke-${suffix}`,
  };
  if (options.json !== undefined) {
    result["content-type"] = "application/json";
  }
  if (options.token) {
    result.authorization = `Bearer ${options.token}`;
  }
  if (options.webhookSecret) {
    result["x-slotboard-webhook-secret"] = options.webhookSecret;
  }
  return result;
}

function tokenFromLink(link) {
  const token = new URL(link).pathname.split("/").filter(Boolean).at(-1);
  assert(token, `expected token in link ${link}`);
  return token;
}

function isoDateAfterDays(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
