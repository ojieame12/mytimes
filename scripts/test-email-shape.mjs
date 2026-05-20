import {
  adminLinkEmailCopy,
  buildBookingConfirmationEmailMessage,
  cancellationParticipantEmailShape,
  eventCreatedDetailRows,
  renderEmailHtml,
  resendAttachmentPayloads,
} from "../apps/slots-api/src/email.ts";
import { readFileSync } from "node:fs";

const organizerReopened = cancellationParticipantEmailShape({
  cancelledBy: "organizer",
  eventTitle: "Design Lead Round",
  organizerName: "Mina",
  reopenedSlot: true,
  rebookURL: "https://mytimes.co/b/abc",
});
assert(
  organizerReopened.body.includes("available again on the board"),
  "expected reopened organizer cancellation to say the time is available",
);
assert(
  organizerReopened.primaryCta?.label === "Pick another time",
  "expected reopened organizer cancellation to offer a rebooking CTA",
);

const organizerClosed = cancellationParticipantEmailShape({
  cancelledBy: "organizer",
  eventTitle: "Design Lead Round",
  organizerName: "Mina",
  reopenedSlot: false,
});
assert(
  !/open again|available again/i.test(`${organizerClosed.body} ${organizerClosed.textLine}`),
  "expected closed organizer cancellation not to imply the slot reopened",
);
assert(
  organizerClosed.body.includes("stayed closed"),
  "expected closed organizer cancellation to explain the slot stayed closed",
);

const participantClosed = cancellationParticipantEmailShape({
  cancelledBy: "participant",
  eventTitle: "Design Lead Round",
  organizerName: "Mina",
  reopenedSlot: false,
});
assert(
  participantClosed.textLine === "This time stayed closed on the board.",
  "expected participant closed cancellation to use truthful text copy",
);

const detailRows = eventCreatedDetailRows({
  title: "Design Lead Round",
  organizerName: "Mina",
  durationMinutes: 30,
  expiresAt: "2026-06-01T12:00:00.000Z",
});
assert(
  detailRows.some(([label, value]) => label === "Slot length" && value === "30 minutes"),
  "expected event-created detail rows to include slot length",
);
assert(
  detailRows.some(([label]) => label === "Expires"),
  "expected event-created detail rows to include expiry",
);

const attachments = resendAttachmentPayloads([
  {
    filename: "slotboard-booking.ics",
    contentType: "text/calendar; method=REQUEST; charset=utf-8",
    content: "BEGIN:VCALENDAR\nEND:VCALENDAR",
  },
]);
assert(
  attachments?.[0]?.content_type === "text/calendar; method=REQUEST; charset=utf-8",
  "expected Resend attachment payload to preserve MIME content type",
);
assert(Boolean(attachments?.[0]?.content), "expected Resend attachment payload to include encoded content");

const recoveryAdminCopy = adminLinkEmailCopy({
  reason: "recovery",
  eventTitle: "Design Lead Round",
});
assert(
  recoveryAdminCopy.subject === "Admin link recovery: Design Lead Round",
  "expected recovery admin email to keep recovery subject",
);

const selfRotatedAdminCopy = adminLinkEmailCopy({
  reason: "self_rotation",
  eventTitle: "Design Lead Round",
});
assert(
  selfRotatedAdminCopy.subject === "Admin URL rotated: Design Lead Round",
  "expected self-rotated admin email to use rotation subject",
);
assert(
  selfRotatedAdminCopy.footerNote.includes("organizer dashboard"),
  "expected self-rotated admin email to name the organizer dashboard",
);

const accountRotatedAdminCopy = adminLinkEmailCopy({
  reason: "account_rotation",
  eventTitle: "Design Lead Round",
});
assert(
  accountRotatedAdminCopy.subject === "Private admin URL replaced: Design Lead Round",
  "expected account-rotated admin email to use replacement subject",
);
assert(
  accountRotatedAdminCopy.htmlIntro.includes("Your signed-in dashboard stays open"),
  "expected account-rotated admin email to explain account session remains valid",
);

const html = renderEmailHtml({
  eyebrow: "Shape test",
  title: "Email shape",
  body: "<p>Email body.</p>",
  primaryCta: { href: "https://mytimes.co", label: "Open mytimes" },
  calendarCtas: [
    { href: "https://calendar.google.com/calendar/render?action=TEMPLATE", label: "Google Calendar" },
    { href: "https://outlook.live.com/calendar/0/deeplink/compose", label: "Outlook.com" },
    { href: "webcal://mytimes.co/api/slotboard/manage/test/calendar.ics", label: "Apple / iCal" },
  ],
  secondaryCta: { href: "https://mytimes.co/api/slotboard/manage/test/calendar.ics", label: "Add to calendar" },
  detailRows,
});
assert(!html.includes("&mdash;"), "expected rendered email HTML to avoid em dash entities");
assert(!html.includes("#FFFFFF"), "expected rendered email HTML to avoid pure white");
assert(html.includes("Add to calendar"), "expected rendered email HTML to support secondary calendar CTA");
assert(html.includes("Google Calendar"), "expected rendered email HTML to support calendar action buttons");
assert(html.includes("Outlook.com"), "expected rendered email HTML to include Outlook calendar action");
assert(html.includes("Apple / iCal"), "expected rendered email HTML to include Apple calendar action");
assert(
  html.includes("/api/slotboard/manage/test/calendar.ics"),
  "expected rendered email HTML to include hosted calendar link",
);

const bookingConfirmation = buildBookingConfirmationEmailMessage({
  event: {
    id: "event-email-shape",
    title: "Design Lead Round",
    description: "Portfolio review.",
    organizerName: "Mina Kapoor",
    organizerEmail: "mina@example.com",
    avatarStyle: "notionists",
    timezone: "Africa/Johannesburg",
    durationMinutes: 30,
    intervalMinutes: 30,
    allowMultipleBookings: false,
    status: "active",
    planKey: "free",
    paymentStatus: "not_required",
    bookingLimit: 25,
    slotLimit: 60,
    createdAt: "2026-05-17T10:00:00.000Z",
    updatedAt: "2026-05-17T10:00:00.000Z",
  },
  slot: {
    id: "slot-email-shape",
    eventId: "event-email-shape",
    startsAt: "2026-05-18T08:00:00.000Z",
    endsAt: "2026-05-18T08:30:00.000Z",
    state: "booked",
  },
  booking: {
    id: "booking-email-shape",
    eventId: "event-email-shape",
    slotId: "slot-email-shape",
    participantName: "Anya Gupta",
    participantEmail: "anya@example.com",
    participantTimezone: "Africa/Johannesburg",
    participantLocale: "en-ZA",
    notes: "I may join from a phone.",
    status: "active",
    bookedAt: "2026-05-17T10:05:00.000Z",
    icsSequence: 0,
  },
  manageURL: "https://mytimes.co/m/test-manage-token",
  calendarURL: "https://mytimes.co/api/slotboard/manage/test-manage-token/calendar.ics",
});
assert(
  bookingConfirmation.text.includes("Google Calendar: https://calendar.google.com/calendar/render?"),
  "expected booking confirmation text to include Google Calendar URL",
);
assert(
  bookingConfirmation.text.includes("Outlook.com: https://outlook.live.com/calendar/0/deeplink/compose?"),
  "expected booking confirmation text to include Outlook.com calendar URL",
);
assert(
  bookingConfirmation.text.includes("Office 365: https://outlook.office.com/calendar/0/deeplink/compose?"),
  "expected booking confirmation text to include Office 365 calendar URL",
);
assert(
  bookingConfirmation.text.includes("Apple / iCal: webcal://mytimes.co/api/slotboard/manage/test-manage-token/calendar.ics"),
  "expected booking confirmation text to include Apple webcal URL",
);
assert(
  bookingConfirmation.html.includes("Google Calendar") &&
    bookingConfirmation.html.includes("Outlook.com") &&
    bookingConfirmation.html.includes("Office 365") &&
    bookingConfirmation.html.includes("Apple / iCal"),
  "expected booking confirmation HTML to include explicit calendar provider CTAs",
);
assert(
  bookingConfirmation.attachments?.[0]?.content.includes("METHOD:REQUEST"),
  "expected booking confirmation to keep the .ics attachment",
);

const emailSource = readFileSync(new URL("../apps/slots-api/src/email.ts", import.meta.url), "utf8");
assert(!emailSource.includes("&mdash;"), "expected email templates to avoid em dash entities");
assert(!emailSource.includes("—"), "expected email templates to avoid em dash glyphs");
assert(emailSource.includes('| "password_reset"'), "expected password_reset email type to be registered");
assert(emailSource.includes("sendPasswordResetEmail"), "expected password reset email sender to exist");
assert(emailSource.includes('| "email_verification"'), "expected email_verification email type to be registered");
assert(emailSource.includes("sendEmailVerificationEmail"), "expected email verification email sender to exist");
assert(
  emailSource.includes('aliases: ["10", "password-reset"]'),
  "expected password reset to be available in the email design-test batch",
);
assert(
  emailSource.includes('aliases: ["11", "email-verification", "verification"]'),
  "expected email verification to be available in the email design-test batch",
);
assert(
  emailSource.includes("Reset your mytimes password"),
  "expected password reset email subject to be branded",
);
assert(
  emailSource.includes("Verify your mytimes account"),
  "expected email verification email subject to be branded",
);
assert(
  emailSource.includes("calendarURL"),
  "expected booking email senders to accept hosted calendar URLs",
);
assert(
  emailSource.includes("Add to calendar"),
  "expected booking confirmation emails to include Add to calendar copy",
);
assert(
  emailSource.includes("calendarCtas"),
  "expected booking confirmation emails to render multiple calendar CTA buttons",
);
assert(
  emailSource.includes("Remove from calendar"),
  "expected cancellation emails to include Remove from calendar copy",
);

console.log(JSON.stringify({
  ok: true,
  checked: [
    "organizer-cancellation-reopened-copy",
    "organizer-cancellation-closed-copy",
    "participant-cancellation-closed-copy",
    "event-created-duration-and-expiry-details",
    "resend-calendar-content-type",
    "admin-link-email-reason-copy",
    "email-html-brand-shape",
    "email-secondary-calendar-cta",
    "email-calendar-provider-deeplinks",
    "booking-confirmation-calendar-message",
    "email-template-punctuation",
    "email-calendar-cta-copy",
    "password-reset-email-registration",
    "password-reset-design-test-variant",
    "email-verification-email-registration",
    "email-verification-design-test-variant",
  ],
}, null, 2));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
