import {
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

const html = renderEmailHtml({
  eyebrow: "Shape test",
  title: "Email shape",
  body: "<p>Email body.</p>",
  primaryCta: { href: "https://mytimes.co", label: "Open mytimes" },
  detailRows,
});
assert(!html.includes("&mdash;"), "expected rendered email HTML to avoid em dash entities");
assert(!html.includes("#FFFFFF"), "expected rendered email HTML to avoid pure white");

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

console.log(JSON.stringify({
  ok: true,
  checked: [
    "organizer-cancellation-reopened-copy",
    "organizer-cancellation-closed-copy",
    "participant-cancellation-closed-copy",
    "event-created-duration-and-expiry-details",
    "resend-calendar-content-type",
    "email-html-brand-shape",
    "email-template-punctuation",
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
