import {
  createBookingCancellationIcs,
  createBookingRequestIcs,
} from "@fresh-feel/slotboard-core";
import { getPool } from "./db.js";
import { loadEnv } from "./env.js";
import { logError, logInfo } from "./logger.js";
import type { BookingDTO, EventDTO, SlotDTO } from "./slotboard.js";

export type EmailType =
  | "booking_confirmation"
  | "organizer_booking_notice"
  | "booking_cancellation"
  | "organizer_cancellation_notice"
  | "event_links"
  | "admin_link_recovery"
  | "manage_link_recovery"
  | "my_boards_link"
  | "password_reset"
  | "email_verification"
  | "email_test";

export type EmailDeliveryResult = {
  emailType: EmailType;
  status: "sent" | "failed";
  provider: "console" | "resend" | "postmark";
  deliveryLogId?: string | undefined;
  providerMessageId?: string | undefined;
  error?: string | undefined;
};

export type BookingClaimedEmailResult = {
  participantConfirmation: EmailDeliveryResult;
  organizerNotice: EmailDeliveryResult;
};

export type EventCreatedEmailResult = {
  organizerLinks: EmailDeliveryResult;
};

export type EmailAttachment = {
  filename: string;
  contentType: string;
  content: string;
};

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string | undefined;
  attachments?: EmailAttachment[] | undefined;
};

type DeliveryContext = {
  eventId: string | null;
  bookingId?: string | undefined;
  emailType: EmailType;
  recipientEmail: string;
  message: EmailMessage;
};

type ProviderDelivery = {
  providerMessageId?: string | undefined;
};

export async function sendBookingClaimedEmails(input: {
  event: EventDTO;
  slot: SlotDTO;
  booking: BookingDTO;
  manageURL: string;
}): Promise<BookingClaimedEmailResult> {
  const organizerSlotLabel = formatSlotWindow(input.slot, input.event.timezone);
  const participantTextLines = participantTimeTextLines(input.slot, input.event.timezone, input.booking);
  const participantTimeBlock = buildTimeBlock(input.slot, input.event.timezone, input.booking);
  const organizerTimeBlock = buildOrganizerTimeBlock(input.slot, input.event.timezone, input.booking);
  const ics = createBookingRequestIcs({
    bookingId: input.booking.id,
    sequence: input.booking.icsSequence,
    startsAt: input.slot.startsAt,
    endsAt: input.slot.endsAt,
    title: input.event.title,
    description: input.event.description,
    organizerName: input.event.organizerName,
    organizerEmail: input.event.organizerEmail,
    participantName: input.booking.participantName,
    participantEmail: input.booking.participantEmail,
  });

  const participantDetailRows: Array<[string, string]> = [
    ["Event", input.event.title],
    ["Organizer", `${input.event.organizerName} (${input.event.organizerEmail})`],
    ["Duration", `${input.event.durationMinutes} minutes`],
  ];
  if (input.booking.notes) {
    participantDetailRows.push(["Your note", input.booking.notes]);
  }

  const organizerDetailRows: Array<[string, string]> = [
    ["Event", input.event.title],
    ["Participant", input.booking.participantName],
    ["Email", input.booking.participantEmail],
    ["Time", organizerSlotLabel],
    ["Booking ref", input.booking.id],
  ];
  if (input.booking.notes) {
    organizerDetailRows.push(["Participant note", input.booking.notes]);
  }

  const [participantConfirmation, organizerNotice] = await Promise.all([
    deliverLoggedEmail({
      eventId: input.event.id,
      bookingId: input.booking.id,
      emailType: "booking_confirmation",
      recipientEmail: input.booking.participantEmail,
      message: {
        to: input.booking.participantEmail,
        subject: `You're booked: ${input.event.title}`,
        text: [
          `You're booked for ${input.event.title}.`,
          ...participantTextLines,
          `Organizer: ${input.event.organizerName}`,
          input.booking.notes ? `Your note: ${input.booking.notes}` : "",
          `Manage or cancel your booking: ${input.manageURL}`,
          "A calendar invite is attached.",
        ].filter(Boolean).join("\n\n"),
        html: renderEmailHtml({
          eyebrow: "Booking confirmed",
          title: `Confirmed with ${escapeHtml(firstName(input.event.organizerName))}.`,
          preheader: buildPreheader([
            participantTimeBlock.primary.timeRange,
            participantTimeBlock.primary.timezone,
            `${input.event.durationMinutes} min with ${input.event.organizerName}`,
            "calendar attached",
          ]),
          timeBlock: participantTimeBlock,
          timeBlockStyle: "hero",
          personLockup: {
            role: "Organizer",
            name: input.event.organizerName,
            email: input.event.organizerEmail,
          },
          body: `<p style="margin:0 0 18px 0;font-family:${FONT_DISPLAY};font-size:17px;line-height:1.55;color:${COLOR_BODY};letter-spacing:-0.003em"><strong style="font-weight:600">${input.event.durationMinutes} minutes</strong> on <strong style="font-weight:600">${escapeHtml(input.event.title)}</strong>. A calendar invite is attached. Drop it in and you're set.</p>`,
          pullQuote: input.booking.notes
            ? { text: input.booking.notes, attribution: "your note, on booking" }
            : undefined,
          primaryCta: { href: input.manageURL, label: "Manage booking" },
          whatsNext: [
            `Add the attached <strong style="font-weight:600">.ics</strong> to your calendar; you'll get a reminder automatically.`,
            `Need to reschedule or cancel? Use the <strong style="font-weight:600">Manage booking</strong> link above. It's the only way.`,
            `Replying to this email reaches ${escapeHtml(firstName(input.event.organizerName))} directly.`,
          ],
          footerNote: `Sent because you booked a time on ${escapeHtml(firstName(input.event.organizerName))}'s mytimes board.`,
          manageURL: input.manageURL,
        }),
        replyTo: input.event.organizerEmail,
        attachments: [
          {
            filename: "slotboard-booking.ics",
            contentType: "text/calendar; method=REQUEST; charset=utf-8",
            content: ics,
          },
        ],
      },
    }),
    deliverLoggedEmail({
      eventId: input.event.id,
      bookingId: input.booking.id,
      emailType: "organizer_booking_notice",
      recipientEmail: input.event.organizerEmail,
      message: {
        to: input.event.organizerEmail,
        subject: `New booking: ${input.event.title}`,
        text: [
          `${input.booking.participantName} booked a slot for ${input.event.title}.`,
          `Time: ${organizerSlotLabel}`,
          `Participant: ${input.booking.participantEmail}`,
          input.booking.notes ? `Notes: ${input.booking.notes}` : "",
        ].filter(Boolean).join("\n\n"),
        html: renderEmailHtml({
          eyebrow: "New booking",
          title: `${escapeHtml(firstName(input.booking.participantName))} grabbed a slot.`,
          preheader: buildPreheader([
            organizerTimeBlock.primary.timeRange,
            organizerTimeBlock.primary.timezone,
            `${input.booking.participantName} on ${input.event.title}`,
          ]),
          timeBlock: organizerTimeBlock,
          timeBlockStyle: "hero",
          personLockup: {
            role: "Participant",
            name: input.booking.participantName,
            email: input.booking.participantEmail,
          },
          body: `<p style="margin:0 0 18px 0;font-family:${FONT_DISPLAY};font-size:17px;line-height:1.55;color:${COLOR_BODY};letter-spacing:-0.003em">Someone just claimed a time on your <strong style="font-weight:600">${escapeHtml(input.event.title)}</strong> board.</p>`,
          pullQuote: input.booking.notes
            ? { text: input.booking.notes, attribution: `from ${firstName(input.booking.participantName)}` }
            : undefined,
          whatsNext: [
            `Their slot is on your calendar automatically once they add the invite.`,
            `Replying to this email reaches ${escapeHtml(firstName(input.booking.participantName))} directly.`,
          ],
          footerNote: `Sent because you're the organizer of ${escapeHtml(input.event.title)}.`,
        }),
        replyTo: input.booking.participantEmail,
      },
    }),
  ]);
  return {
    participantConfirmation,
    organizerNotice,
  };
}

export async function sendEventCreatedEmail(input: {
  event: {
    id: string;
    title: string;
    organizerName: string;
    organizerEmail: string;
    durationMinutes?: number | undefined;
    expiresAt?: string | undefined;
  };
  publicURL: string;
  adminURL: string;
}): Promise<EventCreatedEmailResult> {
  const detailRows = eventCreatedDetailRows(input.event);

  const organizerLinks = await deliverLoggedEmail({
    eventId: input.event.id,
    emailType: "event_links",
    recipientEmail: input.event.organizerEmail,
    message: {
      to: input.event.organizerEmail,
      subject: `Your mytimes board is live: ${input.event.title}`,
      text: [
        `Your booking board is ready: ${input.event.title}.`,
        `Share this public link with participants: ${input.publicURL}`,
        `Keep this private admin link safe: ${input.adminURL}`,
        "Anyone with the admin link can manage this board.",
      ].join("\n\n"),
      html: renderEmailHtml({
        eyebrow: "Board created",
        title: "Your board is live.",
        preheader: buildPreheader([
          input.event.title,
          "two links below",
          "share the public one, save the admin one",
        ]),
        body: [
          `<p style="margin:0 0 18px 0;font-family:${FONT_DISPLAY};font-size:17px;line-height:1.55;color:${COLOR_BODY};letter-spacing:-0.003em">Two links below. The first is public; share it with anyone who needs to book a time. The second is yours.</p>`,
          renderLinkCard({
            variant: "public",
            label: "Public participant link",
            url: input.publicURL,
            caption: "Share this with the people who need to book a slot.",
          }),
          renderLinkCard({
            variant: "admin",
            label: "Private admin link",
            url: input.adminURL,
            caption: "Save this somewhere safe. It's how you manage this board; anyone with it can edit, cancel, or close it.",
          }),
        ].join(""),
        primaryCta: { href: input.adminURL, label: "Open board admin" },
        whatsNext: [
          `Share the <strong style="font-weight:600">public link</strong> with anyone who needs to book a time.`,
          `Save the <strong style="font-weight:600">admin link</strong> somewhere safe. It's how you run the board.`,
          `You'll get an email each time someone books, with their note and time.`,
        ],
        footerNote: "Sent because you just created a mytimes board.",
      }),
      replyTo: input.event.organizerEmail,
    },
  });

  return { organizerLinks };
}

export function eventCreatedDetailRows(input: {
  title: string;
  organizerName: string;
  durationMinutes?: number | undefined;
  expiresAt?: string | undefined;
}): Array<[string, string]> {
  const detailRows: Array<[string, string]> = [
    ["Board", input.title],
    ["Organizer", input.organizerName],
  ];
  if (typeof input.durationMinutes === "number") {
    detailRows.push(["Slot length", `${input.durationMinutes} minutes`]);
  }
  if (input.expiresAt) {
    detailRows.push(["Expires", formatDateTime(new Date(input.expiresAt))]);
  }
  return detailRows;
}

export async function sendBookingCancellationEmails(input: {
  event: EventDTO;
  slot: SlotDTO;
  booking: BookingDTO;
  cancelledBy: "participant" | "organizer";
  reopenedSlot: boolean;
  rebookURL?: string | undefined;
  adminURL?: string | undefined;
  openSlotCount?: number | undefined;
}): Promise<void> {
  const organizerSlotLabel = formatSlotWindow(input.slot, input.event.timezone);
  const participantTextLines = participantTimeTextLines(input.slot, input.event.timezone, input.booking);
  const participantTimeBlock = buildTimeBlock(input.slot, input.event.timezone, input.booking);
  const organizerTimeBlock = buildOrganizerTimeBlock(input.slot, input.event.timezone, input.booking);
  const ics = createBookingCancellationIcs({
    bookingId: input.booking.id,
    sequence: input.booking.icsSequence,
    startsAt: input.slot.startsAt,
    endsAt: input.slot.endsAt,
    title: input.event.title,
    description: input.event.description,
    organizerName: input.event.organizerName,
    organizerEmail: input.event.organizerEmail,
    participantName: input.booking.participantName,
    participantEmail: input.booking.participantEmail,
  });

  const participantShape = cancellationParticipantEmailShape({
    cancelledBy: input.cancelledBy,
    eventTitle: input.event.title,
    organizerName: input.event.organizerName,
    reopenedSlot: input.reopenedSlot,
    rebookURL: input.rebookURL,
  });

  const deliveries: Promise<EmailDeliveryResult>[] = [
    deliverLoggedEmail({
      eventId: input.event.id,
      bookingId: input.booking.id,
      emailType: "booking_cancellation",
      recipientEmail: input.booking.participantEmail,
      message: {
        to: input.booking.participantEmail,
        subject: `Cancelled: ${input.event.title}`,
        text: [
          `Your booking for ${input.event.title} was cancelled by ${input.cancelledBy === "organizer" ? "the organizer" : "you"}.`,
          ...participantTextLines,
          participantShape.textLine,
          input.rebookURL ? `Board link: ${input.rebookURL}` : "",
        ].filter(Boolean).join("\n\n"),
        html: renderEmailHtml({
          eyebrow: "Booking cancelled",
          title: input.cancelledBy === "organizer"
            ? `${escapeHtml(firstName(input.event.organizerName))} cancelled.`
            : "Your time is open again.",
          preheader: buildPreheader([
            "cancelled",
            participantTimeBlock.primary.timeRange,
            participantTimeBlock.primary.timezone,
            input.rebookURL ? "rebook below" : undefined,
          ]),
          timeBlock: {
            ...participantTimeBlock,
            primary: { ...participantTimeBlock.primary, label: "Was" },
          },
          timeBlockStyle: "muted",
          personLockup: {
            role: "Organizer",
            name: input.event.organizerName,
          },
          body: participantShape.body,
          primaryCta: participantShape.primaryCta,
          whatsNext: input.rebookURL
            ? [
                `Pick another time on the board if you'd like to rebook.`,
                `If you didn't mean to cancel, reach out to ${escapeHtml(firstName(input.event.organizerName))} directly.`,
              ]
            : undefined,
          footerNote: "A cancellation invite is attached so your calendar stays in sync.",
        }),
        replyTo: input.event.organizerEmail,
        attachments: [
          {
            filename: "slotboard-booking-cancelled.ics",
            contentType: "text/calendar; method=CANCEL; charset=utf-8",
            content: ics,
          },
        ],
      },
    }),
  ];

  if (input.cancelledBy === "participant") {
    const openSlotsLine = input.reopenedSlot && typeof input.openSlotCount === "number"
      ? ` The board now shows ${input.openSlotCount} open slot${input.openSlotCount === 1 ? "" : "s"}.`
      : "";
    const organizerBody = input.reopenedSlot
      ? `Their time is available again.${openSlotsLine ? " The board now shows <strong style=\"color:#27272A\">" + (input.openSlotCount) + "</strong> open slot" + (input.openSlotCount === 1 ? "" : "s") + "." : ""}`
      : "Their time is no longer held, but the slot stayed closed on the board.";
    deliveries.push(
      deliverLoggedEmail({
        eventId: input.event.id,
        bookingId: input.booking.id,
        emailType: "organizer_cancellation_notice",
        recipientEmail: input.event.organizerEmail,
        message: {
          to: input.event.organizerEmail,
          subject: `Booking cancelled: ${input.event.title}`,
          text: [
            `${input.booking.participantName} cancelled their booking for ${input.event.title}.`,
            `Time: ${organizerSlotLabel}`,
            `Participant: ${input.booking.participantEmail}`,
            input.reopenedSlot
              ? `Their time is available again.${openSlotsLine}`
              : "Their time is no longer held, but the slot stayed closed on the board.",
          ].join("\n\n"),
          html: renderEmailHtml({
            eyebrow: "Booking cancelled",
            title: `${escapeHtml(firstName(input.booking.participantName))} cancelled.`,
            preheader: buildPreheader([
              input.booking.participantName,
              "cancelled",
              organizerTimeBlock.primary.timeRange,
              organizerTimeBlock.primary.timezone,
            ]),
            timeBlock: {
              ...organizerTimeBlock,
              primary: { ...organizerTimeBlock.primary, label: "Freed up" },
            },
            timeBlockStyle: "muted",
            personLockup: {
              role: "Participant",
              name: input.booking.participantName,
              email: input.booking.participantEmail,
            },
            body: `<p style="margin:0 0 18px 0;font-family:${FONT_DISPLAY};font-size:17px;line-height:1.55;color:${COLOR_BODY};letter-spacing:-0.003em">${organizerBody}</p>`,
            primaryCta: input.adminURL ? { href: input.adminURL, label: "Open board admin" } : undefined,
            footerNote: `Sent because you're the organizer of ${escapeHtml(input.event.title)}.`,
          }),
          replyTo: input.booking.participantEmail,
        },
      }),
    );
  }

  await Promise.all(deliveries);
}

export function cancellationParticipantEmailShape(input: CancellationParticipantEmailShapeInput): {
  body: string;
  textLine: string;
  primaryCta?: EmailButton | undefined;
} {
  if (input.cancelledBy === "organizer") {
    if (input.reopenedSlot) {
      return {
        body: `<p style="${BODY_PARAGRAPH_STYLE}"><strong style="color:#27272A">${escapeHtml(input.organizerName)}</strong> cancelled this slot. The time is available again on the board${input.rebookURL ? ", so you can pick another one if you need to." : "."}</p>`,
        textLine: "The time is available again on the board.",
        primaryCta: input.rebookURL ? { href: input.rebookURL, label: "Pick another time" } : undefined,
      };
    }

    return {
      body: `<p style="${BODY_PARAGRAPH_STYLE}"><strong style="color:#27272A">${escapeHtml(input.organizerName)}</strong> cancelled this slot. This time stayed closed on the board. Reply to the organizer if you need a different time.</p>`,
      textLine: "This time stayed closed on the board. Reply to the organizer if you need a different time.",
      primaryCta: input.rebookURL ? { href: input.rebookURL, label: "View board" } : undefined,
    };
  }

  if (input.reopenedSlot) {
    return {
      body: `<p style="${BODY_PARAGRAPH_STYLE}">Your booking for <strong style="color:#27272A">${escapeHtml(input.eventTitle)}</strong> has been cancelled. The time is available again on the board.</p>`,
      textLine: "The time is available again on the board.",
      primaryCta: input.rebookURL ? { href: input.rebookURL, label: "View board" } : undefined,
    };
  }

  return {
    body: `<p style="${BODY_PARAGRAPH_STYLE}">Your booking for <strong style="color:#27272A">${escapeHtml(input.eventTitle)}</strong> has been cancelled. This time stayed closed on the board.</p>`,
    textLine: "This time stayed closed on the board.",
    primaryCta: input.rebookURL ? { href: input.rebookURL, label: "View board" } : undefined,
  };
}

export async function sendManagedBookingDetailsEmail(input: {
  event: EventDTO;
  slot: SlotDTO;
  booking: BookingDTO;
  manageURL: string;
}): Promise<EmailDeliveryResult> {
  const cancelled = input.booking.status === "cancelled";
  const participantTextLines = participantTimeTextLines(input.slot, input.event.timezone, input.booking);
  const participantTimeBlock = buildTimeBlock(input.slot, input.event.timezone, input.booking);
  const ics = cancelled
    ? createBookingCancellationIcs({
      bookingId: input.booking.id,
      sequence: 1,
      startsAt: input.slot.startsAt,
      endsAt: input.slot.endsAt,
      title: input.event.title,
      description: input.event.description,
      organizerName: input.event.organizerName,
      organizerEmail: input.event.organizerEmail,
      participantName: input.booking.participantName,
      participantEmail: input.booking.participantEmail,
    })
    : createBookingRequestIcs({
      bookingId: input.booking.id,
      startsAt: input.slot.startsAt,
      endsAt: input.slot.endsAt,
      title: input.event.title,
      description: input.event.description,
      organizerName: input.event.organizerName,
      organizerEmail: input.event.organizerEmail,
      participantName: input.booking.participantName,
      participantEmail: input.booking.participantEmail,
    });

  const detailRows: Array<[string, string]> = [
    ["Event", input.event.title],
    ["Organizer", `${input.event.organizerName} (${input.event.organizerEmail})`],
    ["Duration", `${input.event.durationMinutes} minutes`],
  ];
  if (input.booking.notes) {
    detailRows.push(["Your note", input.booking.notes]);
  }

  return deliverLoggedEmail({
    eventId: input.event.id,
    bookingId: input.booking.id,
    emailType: cancelled ? "booking_cancellation" : "booking_confirmation",
    recipientEmail: input.booking.participantEmail,
    message: {
      to: input.booking.participantEmail,
      subject: cancelled ? `Cancelled booking: ${input.event.title}` : `Your booking: ${input.event.title}`,
      text: [
        cancelled
          ? `This booking for ${input.event.title} is cancelled.`
          : `You're booked for ${input.event.title}.`,
        ...participantTextLines,
        `Organizer: ${input.event.organizerName}`,
        `Manage your booking: ${input.manageURL}`,
      ].join("\n\n"),
      html: renderEmailHtml({
        eyebrow: cancelled ? "Cancelled booking" : "Your booking",
        title: cancelled ? "This booking is cancelled." : "Here's your booking again.",
        preheader: buildPreheader([
          cancelled ? "cancelled" : "your booking",
          participantTimeBlock.primary.timeRange,
          participantTimeBlock.primary.timezone,
          `with ${input.event.organizerName}`,
        ]),
        timeBlock: participantTimeBlock,
        timeBlockStyle: cancelled ? "muted" : "hero",
        personLockup: {
          role: "Organizer",
          name: input.event.organizerName,
          email: input.event.organizerEmail,
        },
        body: cancelled
          ? `<p style="margin:0 0 18px 0;font-family:${FONT_DISPLAY};font-size:17px;line-height:1.55;color:${COLOR_BODY};letter-spacing:-0.003em">This booking for <strong style="font-weight:600">${escapeHtml(input.event.title)}</strong> has already been cancelled. Sending a copy for your records.</p>`
          : `<p style="margin:0 0 18px 0;font-family:${FONT_DISPLAY};font-size:17px;line-height:1.55;color:${COLOR_BODY};letter-spacing:-0.003em">Fresh copy of your booking on <strong style="font-weight:600">${escapeHtml(input.event.title)}</strong>, with the link to manage or cancel it.</p>`,
        primaryCta: { href: input.manageURL, label: cancelled ? "View booking" : "Manage booking" },
        footerNote: "Sent because you asked us to resend your booking details.",
        manageURL: input.manageURL,
      }),
      replyTo: input.event.organizerEmail,
      attachments: [
        {
          filename: cancelled ? "slotboard-booking-cancelled.ics" : "slotboard-booking.ics",
          contentType: `text/calendar; method=${cancelled ? "CANCEL" : "REQUEST"}; charset=utf-8`,
          content: ics,
        },
      ],
    },
  });
}

export async function sendAdminRecoveryEmail(input: {
  event: EventDTO;
  adminURL: string;
}): Promise<EmailDeliveryResult> {
  return deliverLoggedEmail({
    eventId: input.event.id,
    emailType: "admin_link_recovery",
    recipientEmail: input.event.organizerEmail,
    message: {
      to: input.event.organizerEmail,
      subject: `Admin link recovery: ${input.event.title}`,
      text: [
        `A new admin link was requested for ${input.event.title}.`,
        `Open admin dashboard: ${input.adminURL}`,
        "This link replaces the previous admin link for this board.",
      ].join("\n\n"),
      html: renderEmailHtml({
        eyebrow: "Admin link recovery",
        title: "Here's a fresh admin link.",
        preheader: buildPreheader([
          "fresh admin link",
          input.event.title,
          "replaces the previous one",
        ]),
        body: [
          `<p style="margin:0 0 18px 0;font-family:${FONT_DISPLAY};font-size:17px;line-height:1.55;color:${COLOR_BODY};letter-spacing:-0.003em">Someone requested a new admin link for <strong style="font-weight:600">${escapeHtml(input.event.title)}</strong>. If that was you, this one replaces the previous.</p>`,
          renderLinkCard({
            variant: "admin",
            label: "Private admin link",
            url: input.adminURL,
            caption: "Save this somewhere safe. Anyone with it can manage this board.",
          }),
        ].join(""),
        primaryCta: { href: input.adminURL, label: "Open board admin" },
        whatsNext: [
          `Save this link somewhere safe. It's the only way to manage <strong style="font-weight:600">${escapeHtml(input.event.title)}</strong>.`,
          `The previous admin link has been replaced and no longer works.`,
        ],
        footerNote: "If you didn't request this, you can safely ignore this email.",
      }),
      replyTo: input.event.organizerEmail,
    },
  });
}

export async function sendManageLinkRecoveryEmail(input: {
  event: EventDTO;
  slot: SlotDTO;
  booking: BookingDTO;
  manageURL: string;
}): Promise<EmailDeliveryResult> {
  const participantTextLines = participantTimeTextLines(input.slot, input.event.timezone, input.booking);
  const participantTimeBlock = buildTimeBlock(input.slot, input.event.timezone, input.booking);

  const detailRows: Array<[string, string]> = [
    ["Event", input.event.title],
    ["Organizer", `${input.event.organizerName} (${input.event.organizerEmail})`],
    ["Duration", `${input.event.durationMinutes} minutes`],
  ];

  return deliverLoggedEmail({
    eventId: input.event.id,
    bookingId: input.booking.id,
    emailType: "manage_link_recovery",
    recipientEmail: input.booking.participantEmail,
    message: {
      to: input.booking.participantEmail,
      subject: `Your booking link: ${input.event.title}`,
      text: [
        `Here is your booking management link for ${input.event.title}.`,
        ...participantTextLines,
        `Manage or cancel your booking: ${input.manageURL}`,
      ].join("\n\n"),
      html: renderEmailHtml({
        eyebrow: "Booking link",
        title: "Your manage link is back.",
        preheader: buildPreheader([
          "manage link",
          participantTimeBlock.primary.timeRange,
          participantTimeBlock.primary.timezone,
          input.event.title,
        ]),
        timeBlock: participantTimeBlock,
        timeBlockStyle: "hero",
        personLockup: {
          role: "Organizer",
          name: input.event.organizerName,
          email: input.event.organizerEmail,
        },
        body: `<p style="margin:0 0 18px 0;font-family:${FONT_DISPLAY};font-size:17px;line-height:1.55;color:${COLOR_BODY};letter-spacing:-0.003em">Use the link below to manage or cancel your booking on <strong style="font-weight:600">${escapeHtml(input.event.title)}</strong>.</p>`,
        primaryCta: { href: input.manageURL, label: "Manage booking" },
        footerNote: "Sent because you asked us to resend your booking management link.",
        manageURL: input.manageURL,
      }),
      replyTo: input.event.organizerEmail,
    },
  });
}

export async function sendMyBoardsLinkEmail(input: {
  organizerEmail: string;
  boardsURL: string;
  boardCount: number;
  expiresAt: Date;
}): Promise<EmailDeliveryResult> {
  const countLabel = `${input.boardCount} board${input.boardCount === 1 ? "" : "s"}`;
  const expiryLabel = formatDateTime(input.expiresAt);
  return deliverLoggedEmail({
    eventId: null,
    emailType: "my_boards_link",
    recipientEmail: input.organizerEmail,
    message: {
      to: input.organizerEmail,
      subject: "Your mytimes boards link",
      text: [
        `Here is your private mytimes boards link for ${countLabel}.`,
        `Open your boards: ${input.boardsURL}`,
        `This link expires ${expiryLabel}.`,
        "Anyone with this link can request fresh admin links for boards tied to this email.",
      ].join("\n\n"),
      html: renderEmailHtml({
        eyebrow: "Boards link",
        title: "Your boards, in one place.",
        preheader: buildPreheader([
          countLabel,
          "private link",
          "expires in 24 hours",
        ]),
        body: [
          `<p style="margin:0 0 18px 0;font-family:${FONT_DISPLAY};font-size:17px;line-height:1.55;color:${COLOR_BODY};letter-spacing:-0.003em">Click below to see every board you've created with this email: <strong style="font-weight:600">${escapeHtml(countLabel)}</strong> in total. Link works for 24 hours.</p>`,
          renderLinkCard({
            variant: "admin",
            label: "Your private boards link",
            url: input.boardsURL,
            caption: "Anyone with this link can request fresh admin links for boards tied to this email. Keep it private.",
          }),
        ].join(""),
        primaryCta: { href: input.boardsURL, label: "Open my boards" },
        footerNote: "If you didn't request this, you can safely ignore this email; the link only works for the email it was sent to.",
      }),
    },
  });
}

export async function sendPasswordResetEmail(input: {
  organizerEmail: string;
  resetURL: string;
  expiresInMinutes: number;
}): Promise<EmailDeliveryResult> {
  const expiryLabel = `${input.expiresInMinutes} minute${input.expiresInMinutes === 1 ? "" : "s"}`;
  return deliverLoggedEmail({
    eventId: null,
    emailType: "password_reset",
    recipientEmail: input.organizerEmail,
    message: {
      to: input.organizerEmail,
      subject: "Reset your mytimes password",
      text: [
        "Use this private link to reset your mytimes password.",
        `Reset password: ${input.resetURL}`,
        `This link expires in ${expiryLabel}.`,
        "If you did not request this, you can ignore this email.",
      ].join("\n\n"),
      html: renderEmailHtml({
        eyebrow: "Password reset",
        title: "Reset your password.",
        preheader: buildPreheader([
          "private reset link",
          `expires in ${expiryLabel}`,
        ]),
        body: [
          `<p style="margin:0 0 18px 0;font-family:${FONT_DISPLAY};font-size:17px;line-height:1.55;color:${COLOR_BODY};letter-spacing:-0.003em">Use the private link below to set a new password for your mytimes account. It expires in <strong style="font-weight:600">${escapeHtml(expiryLabel)}</strong>.</p>`,
          renderLinkCard({
            variant: "admin",
            label: "Private reset link",
            url: input.resetURL,
            caption: "Anyone with this link can reset your mytimes password until it expires. Keep it private.",
          }),
        ].join(""),
        primaryCta: { href: input.resetURL, label: "Reset password" },
        footerNote: "If you didn't request this, you can safely ignore this email.",
      }),
    },
  });
}

export async function sendEmailVerificationEmail(input: {
  organizerEmail: string;
  verificationURL: string;
  expiresInMinutes: number;
}): Promise<EmailDeliveryResult> {
  const expiryLabel = `${input.expiresInMinutes} minute${input.expiresInMinutes === 1 ? "" : "s"}`;
  return deliverLoggedEmail({
    eventId: null,
    emailType: "email_verification",
    recipientEmail: input.organizerEmail,
    message: {
      to: input.organizerEmail,
      subject: "Verify your mytimes account",
      text: [
        "Use this private link to verify your mytimes organizer account.",
        `Verify email: ${input.verificationURL}`,
        `This link expires in ${expiryLabel}.`,
        "If you did not create this account, you can ignore this email.",
      ].join("\n\n"),
      html: renderEmailHtml({
        eyebrow: "Email verification",
        title: "Verify your email.",
        preheader: buildPreheader([
          "private verification link",
          `expires in ${expiryLabel}`,
        ]),
        body: [
          `<p style="margin:0 0 18px 0;font-family:${FONT_DISPLAY};font-size:17px;line-height:1.55;color:${COLOR_BODY};letter-spacing:-0.003em">Use the private link below to verify your mytimes organizer account. It expires in <strong style="font-weight:600">${escapeHtml(expiryLabel)}</strong>.</p>`,
          renderLinkCard({
            variant: "admin",
            label: "Private verification link",
            url: input.verificationURL,
            caption: "Anyone with this link can verify this mytimes account until it expires. Keep it private.",
          }),
        ].join(""),
        primaryCta: { href: input.verificationURL, label: "Verify email" },
        footerNote: "If you didn't create this account, you can safely ignore this email.",
      }),
    },
  });
}

// Fires each design-system email variant at a single recipient so we can
// visually verify rendering in real inboxes (Gmail, Outlook, Apple Mail).
// Optionally filtered to one variant by id or alias.
export async function sendEmailDesignTestBatch(input: {
  recipientEmail: string;
  variant?: string | undefined;
}): Promise<{ sent: Array<{ id: string; label: string; status: "sent" | "failed"; error?: string }>; }> {
  const recipient = input.recipientEmail;
  const eventId = "evt_design_test_vision";
  const slotId = "slot_design_test";
  const bookingId = "bkg_design_test_casey";

  const mockEvent: EventDTO = {
    id: eventId,
    title: "Vision Assessment",
    description: "60-minute deep-dive on roadmap and team strategy.",
    organizerName: "Emily Carter",
    organizerEmail: recipient,
    avatarStyle: "notionists",
    timezone: "Europe/London",
    durationMinutes: 60,
    intervalMinutes: 60,
    allowMultipleBookings: false,
    status: "active",
    planKey: "event_pass",
    paymentStatus: "paid",
    paidAt: "2026-05-10T12:00:00Z",
    expiresAt: "2026-08-13T23:59:59Z",
    bookingLimit: 1,
    slotLimit: 10,
    createdAt: "2026-05-10T12:00:00Z",
    updatedAt: "2026-05-10T12:00:00Z",
  };

  const mockSlot: SlotDTO = {
    id: slotId,
    eventId,
    startsAt: "2026-05-18T08:00:00Z",
    endsAt: "2026-05-18T09:00:00Z",
    state: "booked",
    bookingId,
  };

  const mockBooking: BookingDTO = {
    id: bookingId,
    eventId,
    slotId,
    participantName: "Casey Rivera",
    participantEmail: recipient,
    participantTimezone: "Africa/Johannesburg",
    notes: "On a phone for the first 5 minutes.",
    status: "active",
    bookedAt: "2026-05-12T10:30:00Z",
    icsSequence: 0,
  };

  const manageURL = "https://mytimes.co/m/k3J9-2Xm-4Tn8";
  const publicURL = "https://mytimes.co/b/vision-assessment-2026";
  const adminURL = "https://mytimes.co/admin/k3J9-2Xm-4Tn8";
  const boardsURL = "https://mytimes.co/my-boards?token=design-test";

  type Step = { id: string; aliases: string[]; label: string; run: () => Promise<unknown> };

  const steps: Step[] = [
    {
      id: "01",
      aliases: ["1", "booking-confirmation", "confirmation"],
      label: "Booking confirmation (+ organizer notice)",
      run: () => sendBookingClaimedEmails({ event: mockEvent, slot: mockSlot, booking: mockBooking, manageURL }),
    },
    {
      id: "02",
      aliases: ["2", "event-created", "board-created"],
      label: "Event created",
      run: () => sendEventCreatedEmail({ event: mockEvent, publicURL, adminURL }),
    },
    {
      id: "03",
      aliases: ["3", "cancellation-participant"],
      label: "Cancellation (participant + organizer notice)",
      run: () => sendBookingCancellationEmails({ event: mockEvent, slot: mockSlot, booking: mockBooking, cancelledBy: "participant", reopenedSlot: true, rebookURL: publicURL, adminURL, openSlotCount: 4 }),
    },
    {
      id: "04",
      aliases: ["4", "admin-recovery"],
      label: "Admin link recovery",
      run: () => sendAdminRecoveryEmail({ event: mockEvent, adminURL }),
    },
    {
      id: "05",
      aliases: ["5", "my-boards-link"],
      label: "My boards link",
      run: () => sendMyBoardsLinkEmail({ organizerEmail: recipient, boardsURL, boardCount: 3, expiresAt: new Date("2026-05-15T14:32:00Z") }),
    },
    {
      id: "08",
      aliases: ["8", "managed-booking-resend"],
      label: "Managed booking details",
      run: () => sendManagedBookingDetailsEmail({ event: mockEvent, slot: mockSlot, booking: mockBooking, manageURL }),
    },
    {
      id: "09",
      aliases: ["9", "manage-link-recovery"],
      label: "Manage link recovery",
      run: () => sendManageLinkRecoveryEmail({ event: mockEvent, slot: mockSlot, booking: mockBooking, manageURL }),
    },
    {
      id: "10",
      aliases: ["10", "password-reset"],
      label: "Password reset",
      run: () => sendPasswordResetEmail({
        organizerEmail: recipient,
        resetURL: "https://mytimes.co/reset-password?token=reset_design_token",
        expiresInMinutes: 60,
      }),
    },
    {
      id: "11",
      aliases: ["11", "email-verification", "verification"],
      label: "Email verification",
      run: () => sendEmailVerificationEmail({
        organizerEmail: recipient,
        verificationURL: "https://mytimes.co/api/auth/verify-email?token=verify_design_token&callbackURL=https%3A%2F%2Fmytimes.co%2Fverify-email",
        expiresInMinutes: 60,
      }),
    },
    {
      id: "12",
      aliases: ["12", "operational-test"],
      label: "Operational test",
      run: () => sendOperationalTestEmail({ recipientEmail: recipient }),
    },
  ];

  const filter = input.variant?.toLowerCase();
  const toRun = filter
    ? steps.filter((s) => s.id === filter || s.aliases.includes(filter))
    : steps;

  if (filter && toRun.length === 0) {
    const known = steps.map((s) => s.id).join(", ");
    throw new Error(`unknown variant "${input.variant}". choose from: ${known}`);
  }

  const results: Array<{ id: string; label: string; status: "sent" | "failed"; error?: string }> = [];
  for (const step of toRun) {
    try {
      await step.run();
      results.push({ id: step.id, label: step.label, status: "sent" });
    } catch (error) {
      results.push({
        id: step.id,
        label: step.label,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
    // Pace sends to avoid provider rate limits.
    if (toRun.length > 1) await new Promise((r) => setTimeout(r, 600));
  }

  return { sent: results };
}

export async function sendOperationalTestEmail(input: {
  recipientEmail: string;
}): Promise<EmailDeliveryResult> {
  return deliverLoggedEmail({
    eventId: null,
    emailType: "email_test",
    recipientEmail: input.recipientEmail,
    message: {
      to: input.recipientEmail,
      subject: "mytimes email test",
      text: [
        "This is a mytimes transactional email test.",
        "If you received this, the configured production email provider can deliver mail from the API service.",
      ].join("\n\n"),
      html: renderEmailHtml({
        eyebrow: "System check",
        title: "Email is up.",
        preheader: "Provider delivery reached this inbox.",
        body: `<p style="margin:0 0 18px 0;font-family:${FONT_DISPLAY};font-size:17px;line-height:1.55;color:${COLOR_BODY};letter-spacing:-0.003em">If you received this, the configured production email provider can deliver mail from the API service.</p>`,
        footerNote: "This is an operational test message.",
      }),
    },
  });
}

async function deliverLoggedEmail(input: DeliveryContext): Promise<EmailDeliveryResult> {
  const env = loadEnv();
  let logId: string | undefined;

  try {
    logId = await insertEmailLog({
      ...input,
      provider: env.emailProvider,
      status: "queued",
    });
  } catch (error) {
    logError("slotboard_email_log_insert_failed", {
      emailType: input.emailType,
      eventId: input.eventId,
      bookingId: input.bookingId,
      recipientDomain: emailDomain(input.recipientEmail),
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }

  try {
    const delivery = await sendProviderEmail(env, input, logId);
    if (logId) {
      await updateEmailLog(logId, {
        status: "sent",
        providerMessageId: delivery.providerMessageId,
      });
    }
    return {
      emailType: input.emailType,
      status: "sent",
      provider: env.emailProvider,
      deliveryLogId: logId,
      providerMessageId: delivery.providerMessageId,
    };
  } catch (error) {
    const message = errorMessage(error);
    if (logId) {
      await updateEmailLog(logId, {
        status: "failed",
        error: message,
      });
    }
    logError("slotboard_email_failed", {
      emailType: input.emailType,
      eventId: input.eventId,
      bookingId: input.bookingId,
      deliveryLogId: logId,
      recipientDomain: emailDomain(input.recipientEmail),
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      emailType: input.emailType,
      status: "failed",
      provider: env.emailProvider,
      deliveryLogId: logId,
      error: message,
    };
  }
}

async function sendProviderEmail(
  env: ReturnType<typeof loadEnv>,
  input: DeliveryContext,
  logId: string | undefined,
): Promise<ProviderDelivery> {
  const message = input.message;
  if (env.emailProvider === "console") {
    logInfo("slotboard_email_console", {
      emailType: input.emailType,
      eventId: input.eventId,
      bookingId: input.bookingId,
      deliveryLogId: logId,
      recipientDomain: emailDomain(input.recipientEmail),
      attachmentCount: message.attachments?.length ?? 0,
    });
    return { providerMessageId: logId ? `console-${logId}` : undefined };
  }

  if (env.emailProvider === "resend") {
    return sendResendEmail(env, message, logId);
  }

  return sendPostmarkEmail(env, message);
}

async function sendResendEmail(
  env: ReturnType<typeof loadEnv>,
  message: EmailMessage,
  logId: string | undefined,
): Promise<ProviderDelivery> {
  if (!env.resendApiKey) {
    throw new Error("Resend API key is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.resendApiKey}`,
      "content-type": "application/json",
      ...(logId ? { "idempotency-key": logId } : {}),
    },
    body: JSON.stringify({
      from: env.senderEmail,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
      reply_to: message.replyTo,
      attachments: resendAttachmentPayloads(message.attachments),
    }),
  });
  const body = await responseJson(response);
  if (!response.ok) {
    throw new Error(providerError("Resend", response.status, body));
  }
  return {
    providerMessageId: stringField(body, "id"),
  };
}

export function resendAttachmentPayloads(attachments: EmailAttachment[] | undefined): Array<{
  filename: string;
  content: string;
  content_type: string;
}> | undefined {
  return attachments?.map((item) => ({
    filename: item.filename,
    content: toBase64(item.content),
    content_type: item.contentType,
  }));
}

async function sendPostmarkEmail(
  env: ReturnType<typeof loadEnv>,
  message: EmailMessage,
): Promise<ProviderDelivery> {
  if (!env.postmarkServerToken) {
    throw new Error("Postmark server token is not configured");
  }

  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-postmark-server-token": env.postmarkServerToken,
    },
    body: JSON.stringify({
      From: env.senderEmail,
      To: message.to,
      Subject: message.subject,
      TextBody: message.text,
      HtmlBody: message.html,
      ReplyTo: message.replyTo,
      MessageStream: env.postmarkMessageStream,
      Attachments: message.attachments?.map((item) => ({
        Name: item.filename,
        Content: toBase64(item.content),
        ContentType: item.contentType,
      })),
    }),
  });
  const body = await responseJson(response);
  if (!response.ok) {
    throw new Error(providerError("Postmark", response.status, body));
  }
  return {
    providerMessageId: stringField(body, "MessageID"),
  };
}

async function insertEmailLog(input: DeliveryContext & {
  provider: string;
  status: "queued" | "sent" | "failed";
}): Promise<string> {
  const result = await getPool().query<{ id: string }>(
    `
      insert into slotboard.email_delivery_logs (
        event_id,
        booking_id,
        email_type,
        recipient_email,
        provider,
        status
      )
      values ($1, $2, $3, $4, $5, $6)
      returning id
    `,
    [
      input.eventId,
      input.bookingId ?? null,
      input.emailType,
      input.recipientEmail,
      input.provider,
      input.status,
    ],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Email log insert did not return an id");
  }
  return row.id;
}

async function updateEmailLog(logId: string, input: {
  status: "sent" | "failed";
  providerMessageId?: string | undefined;
  error?: string | undefined;
}): Promise<void> {
  await getPool().query(
    `
      update slotboard.email_delivery_logs
      set status = $2,
          provider_message_id = $3,
          error = $4
      where id = $1
    `,
    [
      logId,
      input.status,
      input.providerMessageId ?? null,
      input.error?.slice(0, 2000) ?? null,
    ],
  );
}

async function responseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function providerError(provider: string, status: number, body: unknown): string {
  if (typeof body === "string") {
    return `${provider} returned ${status}: ${body}`;
  }
  if (body && typeof body === "object") {
    const message = stringField(body, "message") ?? stringField(body, "Message") ?? stringField(body, "error");
    if (message) {
      return `${provider} returned ${status}: ${message}`;
    }
  }
  return `${provider} returned ${status}`;
}

// =============================================================================
// Email template rendering
// =============================================================================

// Display + body use Nunito (rounded geometric sans, free, self-hosted) when
// the recipient's client honours <style>-block @font-face declarations,
// Apple Mail, Gmail desktop, Outlook iOS/Android. Outlook desktop and Gmail
// mobile fall back to the system sans stack, which still reads cleanly.
const FONT_DISPLAY = "'Nunito',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif";
const FONT_BODY = "'Nunito',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif";
const FONT_MONO = "'SF Mono',Menlo,Monaco,Consolas,'Courier New',monospace";

// Palette kept in sync with the product's peach editorial vocabulary.
const COLOR_PAGE_BG = "#FBF6EE";
const COLOR_CARD_BG = "#FEFCFA";
const COLOR_BODY = "#27272A";
const COLOR_MUTED = "#71717A";
const COLOR_BRAND = "#F05A28";
const COLOR_HAIRLINE = "#E4E4E7";
const COLOR_PEACH_PANEL = "#FFF1E3";
const COLOR_PEACH_PANEL_SOFT = "#FCF4EB";
const COLOR_ADMIN_PANEL = "#27272A";
const COLOR_ADMIN_TEXT = "#FBF6EE";

const BODY_PARAGRAPH_STYLE =
  `margin:0 0 16px 0;font-family:${FONT_BODY};font-size:15px;line-height:1.55;color:${COLOR_MUTED}`;

type EmailButton = {
  href: string;
  label: string;
};

type CancellationParticipantEmailShapeInput = {
  cancelledBy: "participant" | "organizer";
  eventTitle: string;
  organizerName: string;
  reopenedSlot: boolean;
  rebookURL?: string | undefined;
};

type TimeBlockData = {
  primary: {
    label: string;
    weekday: string;
    date: string;
    timeRange: string;
    timezone: string;
  };
  secondary?: {
    label: string;
    weekday: string;
    date: string;
    timeRange: string;
    timezone: string;
  } | undefined;
};

type PersonLockup = {
  role: "Organizer" | "Participant" | string;
  name: string;
  email?: string | undefined;
  // DiceBear seed (defaults to name). Avatar is rendered via DiceBear's PNG
  // endpoint so it renders identically in Outlook desktop.
  avatarSeed?: string | undefined;
};

type PullQuote = {
  text: string;
  // E.g. "your note, on booking" or "from Casey".
  attribution?: string | undefined;
};

type TimeBlockStyle = "hero" | "muted";

type RenderEmailOptions = {
  eyebrow: string;
  title: string;
  // Inbox preview text. Falls back to title.
  preheader?: string | undefined;
  timeBlock?: TimeBlockData | undefined;
  // "hero" (default) for confirmation-style; "muted" softens labels and colors
  // for cancellations.
  timeBlockStyle?: TimeBlockStyle | undefined;
  // Person lockup beneath the time block (avatar + name + role + email).
  personLockup?: PersonLockup | undefined;
  body: string;
  // Editorial pull-quote, e.g. for participant notes. Renders with an orange
  // left rule + Georgia italic and survives Outlook intact.
  pullQuote?: PullQuote | undefined;
  primaryCta?: EmailButton | undefined;
  secondaryCta?: EmailButton | undefined;
  // Numbered scaffolding under the CTA. Each string is one step.
  whatsNext?: string[] | undefined;
  detailRows?: Array<[string, string]> | undefined;
  footerNote?: string | undefined;
  manageURL?: string | undefined;
  // Absolute base URL for image assets. Falls back to publicAppURL from env.
  assetBaseURL?: string | undefined;
};

export function renderEmailHtml(opts: RenderEmailOptions): string {
  const assetBaseURL = stripTrailingSlash(opts.assetBaseURL ?? defaultAssetBaseURL());
  const inner = [
    renderBrandRow(assetBaseURL),
    renderHeader(opts.eyebrow, opts.title),
    opts.timeBlock ? renderTimeBlock(opts.timeBlock, opts.timeBlockStyle ?? "hero") : "",
    opts.personLockup ? renderPersonLockup(opts.personLockup) : "",
    `<tr><td style="padding:0 32px 8px 32px">${opts.body}</td></tr>`,
    opts.pullQuote ? renderPullQuote(opts.pullQuote) : "",
    opts.primaryCta ? renderButtonRow(opts.primaryCta) : "",
    opts.secondaryCta ? renderSecondaryLinkRow(opts.secondaryCta) : "",
    opts.whatsNext && opts.whatsNext.length > 0 ? renderWhatsNext(opts.whatsNext) : "",
    opts.detailRows && opts.detailRows.length > 0 ? renderDetailRows(opts.detailRows) : "",
    renderFooter(opts.footerNote, opts.manageURL, assetBaseURL),
  ].join("");

  const preheader = opts.preheader ?? opts.title;

  return [
    "<!doctype html>",
    '<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta http-equiv="X-UA-Compatible" content="IE=edge">',
    `<title>mytimes</title>`,
    // Outlook desktop renders at 120 DPI by default; pin to 96 DPI so width
    // attributes match across clients.
    "<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->",
    // Self-hosted Nunito for clients that honour <style>-block @font-face
    // (Apple Mail, Gmail desktop web, Outlook iOS/Android). Wrapped in a
    // non-MSO conditional so Outlook desktop ignores it cleanly and falls
    // back to the system sans stack.
    `<!--[if !mso]><!-- -->`,
    `<style type="text/css">`,
    `@font-face{font-family:'Nunito';font-style:normal;font-weight:400;font-display:swap;src:url('${assetBaseURL}/fonts/Nunito-400.woff2') format('woff2');}`,
    `@font-face{font-family:'Nunito';font-style:normal;font-weight:600;font-display:swap;src:url('${assetBaseURL}/fonts/Nunito-600.woff2') format('woff2');}`,
    `@font-face{font-family:'Nunito';font-style:normal;font-weight:700;font-display:swap;src:url('${assetBaseURL}/fonts/Nunito-700.woff2') format('woff2');}`,
    `</style>`,
    `<!--<![endif]-->`,
    "</head>",
    `<body style="margin:0;padding:0;background-color:${COLOR_PAGE_BG};color:${COLOR_BODY};font-family:${FONT_BODY};-webkit-font-smoothing:antialiased">`,
    // Hidden preheader: shows in inbox preview alongside the subject line.
    `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${COLOR_PAGE_BG};opacity:0">${escapeHtml(preheader)}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLOR_PAGE_BG};width:100%">`,
    "<tr><td align=\"center\" style=\"padding:32px 16px\">",
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${COLOR_CARD_BG};border:1px solid ${COLOR_HAIRLINE};border-radius:16px;overflow:hidden">`,
    inner,
    "</table>",
    "</td></tr>",
    "</table>",
    "</body></html>",
  ].join("");
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

function buildPreheader(parts: Array<string | undefined>): string {
  return parts.filter((p): p is string => Boolean(p)).join(" · ");
}

function defaultAssetBaseURL(): string {
  try {
    return loadEnv().publicAppURL;
  } catch {
    return "";
  }
}

function renderBrandRow(assetBaseURL: string): string {
  // PNG wordmark works identically across Gmail, Apple Mail, mobile, and
  // Outlook desktop. The @2x source keeps it crisp on retina. If no asset
  // host is configured, fall back to a Georgia text wordmark.
  const mark = assetBaseURL
    ? `<img src="${escapeAttribute(assetBaseURL)}/assets/brand/wordmark-dark@2x.png" alt="mytimes" width="96" height="24" style="display:block;border:0;outline:none;line-height:1;height:24px;width:96px">`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>`
      + `<td style="font-family:${FONT_DISPLAY};font-size:20px;font-weight:700;color:${COLOR_BODY};letter-spacing:-0.01em;line-height:1;mso-line-height-rule:exactly">mytimes</td>`
      + `<td width="6"></td>`
      + `<td><span style="display:inline-block;width:6px;height:6px;background-color:${COLOR_BRAND};border-radius:50%;vertical-align:middle"></span></td>`
      + `</tr></table>`;
  return `<tr><td style="padding:28px 32px 8px 32px">${mark}</td></tr>`;
}

function renderHeader(eyebrow: string, title: string): string {
  return [
    `<tr><td style="padding:32px 32px 12px 32px">`,
    `<div style="font-family:${FONT_BODY};font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${COLOR_BRAND};margin:0 0 14px 0;line-height:1;mso-line-height-rule:exactly">${escapeHtml(eyebrow)}</div>`,
    `<h1 style="margin:0;font-family:${FONT_DISPLAY};font-size:30px;line-height:1.15;mso-line-height-rule:exactly;font-weight:700;color:${COLOR_BODY};letter-spacing:-0.02em">${escapeHtml(title)}</h1>`,
    `</td></tr>`,
  ].join("");
}

function renderTimeBlock(data: TimeBlockData, style: TimeBlockStyle): string {
  const isMuted = style === "muted";
  // Soft cancellations use a lighter peach + muted body for the title.
  const bg = isMuted ? COLOR_PEACH_PANEL_SOFT : COLOR_PEACH_PANEL;
  const titleColor = isMuted ? COLOR_MUTED : COLOR_BODY;
  const timeColor = isMuted ? COLOR_MUTED : COLOR_BODY;

  // Primary row is the hero (date + time). Secondary row is a single muted
  // line beneath ("9:00 BST for Emily").
  const primary = data.primary;
  const secondaryLine = data.secondary
    ? `<div style="font-family:${FONT_BODY};font-size:13px;color:${COLOR_MUTED};line-height:1.45;mso-line-height-rule:exactly"><span style="font-family:${FONT_MONO};color:${isMuted ? COLOR_MUTED : COLOR_BODY}">${escapeHtml(data.secondary.timeRange.split("–")[0] ?? data.secondary.timeRange)}&nbsp;${escapeHtml(data.secondary.timezone)}</span> · ${escapeHtml(data.secondary.label.toLowerCase())}</div>`
    : "";

  return [
    `<tr><td style="padding:8px 32px 24px 32px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${bg}" style="background-color:${bg};border-radius:14px">`,
    `<tr><td style="padding:22px 24px 18px 24px">`,
    `<div style="font-family:${FONT_BODY};font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${COLOR_MUTED};margin:0 0 6px 0;line-height:1;mso-line-height-rule:exactly">${escapeHtml(primary.label)}</div>`,
    `<div style="font-family:${FONT_DISPLAY};font-size:22px;line-height:1.25;mso-line-height-rule:exactly;color:${titleColor};font-weight:600;letter-spacing:-0.01em">${escapeHtml(primary.weekday)}, ${escapeHtml(primary.date)}</div>`,
    `<div style="margin-top:6px;font-family:${FONT_MONO};font-size:22px;line-height:1.25;mso-line-height-rule:exactly;color:${timeColor};font-weight:500;letter-spacing:-0.01em">${escapeHtml(primary.timeRange)}<span style="font-family:${FONT_BODY};font-size:12px;color:${COLOR_MUTED};font-weight:400;letter-spacing:0.04em;margin-left:10px;text-transform:uppercase">${escapeHtml(primary.timezone)}</span></div>`,
    `</td></tr>`,
    data.secondary
      ? `<tr><td style="padding:0 24px 18px 24px">${secondaryLine}</td></tr>`
      : "",
    `</table>`,
    `</td></tr>`,
  ].join("");
}

function renderPersonLockup(person: PersonLockup): string {
  const seed = person.avatarSeed ?? person.name;
  const emailFragment = person.email
    ? ` &middot; <a href="mailto:${escapeAttribute(person.email)}" style="color:${COLOR_MUTED};text-decoration:underline">${escapeHtml(person.email)}</a>`
    : "";
  return [
    `<tr><td style="padding:0 32px 24px 32px">`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0">`,
    `<tr>`,
    `<td valign="middle" width="44" style="padding-right:14px">`,
    `<img src="https://api.dicebear.com/9.x/notionists/png?seed=${encodeURIComponent(seed)}&backgroundColor=fff1e3&size=88" alt="" width="44" height="44" style="display:block;border:1px solid ${COLOR_HAIRLINE};border-radius:50%;background-color:${COLOR_PEACH_PANEL}">`,
    `</td>`,
    `<td valign="middle">`,
    `<div style="font-family:${FONT_DISPLAY};font-size:16px;color:${COLOR_BODY};font-weight:600;letter-spacing:-0.01em;line-height:1.25;mso-line-height-rule:exactly">${escapeHtml(person.name)}</div>`,
    `<div style="margin-top:2px;font-family:${FONT_BODY};font-size:12px;color:${COLOR_MUTED};line-height:1.4;letter-spacing:0.01em;mso-line-height-rule:exactly">${escapeHtml(person.role)}${emailFragment}</div>`,
    `</td>`,
    `</tr>`,
    `</table>`,
    `</td></tr>`,
  ].join("");
}

function renderPullQuote(quote: PullQuote): string {
  const attribution = quote.attribution
    ? `<div style="margin-top:4px;font-family:${FONT_BODY};font-size:11px;line-height:1.4;color:#A1A1AA;letter-spacing:0.02em;text-transform:uppercase;mso-line-height-rule:exactly">${escapeHtml(quote.attribution)}</div>`
    : "";
  return [
    `<tr><td style="padding:0 32px 18px 32px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`,
    `<tr>`,
    `<td width="3" bgcolor="${COLOR_BRAND}" style="background-color:${COLOR_BRAND};width:3px;line-height:1px;font-size:1px">&nbsp;</td>`,
    `<td width="14" style="width:14px">&nbsp;</td>`,
    `<td valign="top">`,
    `<div style="font-family:${FONT_DISPLAY};font-size:15px;line-height:1.55;mso-line-height-rule:exactly;color:${COLOR_BODY};letter-spacing:-0.003em">&ldquo;${escapeHtml(quote.text)}&rdquo;</div>`,
    attribution,
    `</td>`,
    `</tr>`,
    `</table>`,
    `</td></tr>`,
  ].join("");
}

function renderWhatsNext(steps: string[]): string {
  const rows = steps
    .map((step, index) => {
      const isLast = index === steps.length - 1;
      return [
        `<tr>`,
        `<td width="22" valign="top" style="padding-right:10px;font-family:${FONT_DISPLAY};font-size:16px;color:${COLOR_BRAND};line-height:1.55;mso-line-height-rule:exactly">${index + 1}.</td>`,
        `<td valign="top" style="padding-bottom:${isLast ? "0" : "10px"};font-family:${FONT_BODY};font-size:14px;line-height:1.55;mso-line-height-rule:exactly;color:${COLOR_BODY}">${step}</td>`,
        `</tr>`,
      ].join("");
    })
    .join("");
  return [
    `<tr><td style="padding:24px 32px 8px 32px">`,
    `<div style="font-family:${FONT_BODY};font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${COLOR_MUTED};margin:0 0 14px 0;line-height:1;mso-line-height-rule:exactly">What's next</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`,
    `</td></tr>`,
  ].join("");
}

function renderButtonRow(button: EmailButton): string {
  // VML fallback for Outlook 2007-2019 (Word rendering engine) gives a real
  // pill button. Modern clients use the regular anchor.
  const safeHref = escapeAttribute(button.href);
  const safeLabel = escapeHtml(button.label);
  return [
    `<tr><td style="padding:8px 32px 16px 32px">`,
    `<!--[if mso]>`,
    `<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:46px;v-text-anchor:middle;width:230px;" arcsize="100%" stroke="f" fillcolor="${COLOR_BRAND}">`,
    `<w:anchorlock/>`,
    `<center style="color:#FEFCFA;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;">${safeLabel} &rarr;</center>`,
    `</v:roundrect>`,
    `<![endif]-->`,
    `<!--[if !mso]><!-- -->`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0">`,
    `<tr>`,
    `<td bgcolor="${COLOR_BRAND}" style="background-color:${COLOR_BRAND};border-radius:999px">`,
    `<a href="${safeHref}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT_BODY};font-size:15px;font-weight:600;color:#FEFCFA;text-decoration:none;border-radius:999px;letter-spacing:-0.005em;line-height:1">${safeLabel} &rarr;</a>`,
    `</td>`,
    `</tr>`,
    `</table>`,
    `<!--<![endif]-->`,
    `</td></tr>`,
  ].join("");
}

function renderSecondaryLinkRow(button: EmailButton): string {
  return [
    `<tr><td style="padding:0 32px 16px 32px">`,
    `<a href="${escapeAttribute(button.href)}" style="font-family:${FONT_BODY};font-size:13px;font-weight:500;color:${COLOR_BRAND};text-decoration:none;letter-spacing:-0.005em">${escapeHtml(button.label)} &rarr;</a>`,
    `</td></tr>`,
  ].join("");
}

type LinkCardVariant = "public" | "admin";

type LinkCardOptions = {
  variant: LinkCardVariant;
  label: string;
  url: string;
  caption: string;
};

export function renderLinkCard(opts: LinkCardOptions): string {
  const isAdmin = opts.variant === "admin";
  const bg = isAdmin ? COLOR_ADMIN_PANEL : COLOR_PEACH_PANEL;
  const labelColor = isAdmin ? "#FCA589" : COLOR_BRAND;
  const urlColor = isAdmin ? COLOR_ADMIN_TEXT : COLOR_BODY;
  const captionColor = isAdmin ? "rgba(251,246,238,0.72)" : COLOR_MUTED;

  return [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px 0">`,
    `<tr><td bgcolor="${bg}" style="background-color:${bg};border-radius:12px;padding:18px 20px">`,
    `<div style="font-family:${FONT_BODY};font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${labelColor};margin:0 0 8px 0">${escapeHtml(opts.label)}</div>`,
    `<div style="font-family:${FONT_MONO};font-size:13px;line-height:1.4;color:${urlColor};word-break:break-all;margin:0 0 8px 0">`,
    `<a href="${escapeAttribute(opts.url)}" style="color:${urlColor};text-decoration:underline">${escapeHtml(opts.url)}</a>`,
    `</div>`,
    `<div style="font-family:${FONT_BODY};font-size:12px;line-height:1.5;color:${captionColor};margin:0">${opts.caption}</div>`,
    `</td></tr>`,
    `</table>`,
  ].join("");
}

function renderDetailRows(rows: Array<[string, string]>): string {
  const rowHtml = rows
    .map(([label, value], index) => {
      const isLast = index === rows.length - 1;
      const borderStyle = isLast ? "" : `border-bottom:1px solid ${COLOR_HAIRLINE};`;
      return [
        `<tr>`,
        `<td style="${borderStyle}padding:12px 0;font-family:${FONT_BODY};font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${COLOR_MUTED};vertical-align:top;width:40%">${escapeHtml(label)}</td>`,
        `<td style="${borderStyle}padding:12px 0 12px 16px;font-family:${FONT_BODY};font-size:14px;color:${COLOR_BODY};line-height:1.45;vertical-align:top">${escapeHtml(value)}</td>`,
        `</tr>`,
      ].join("");
    })
    .join("");

  return [
    `<tr><td style="padding:8px 32px 16px 32px">`,
    `<div style="height:1px;line-height:1px;background-color:${COLOR_HAIRLINE};margin:0 0 4px 0">&nbsp;</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rowHtml}</table>`,
    `</td></tr>`,
  ].join("");
}

function renderFooter(footerNote: string | undefined, manageURL: string | undefined, assetBaseURL: string): string {
  const noteLine = footerNote ?? "Sent by mytimes.";
  const mark = assetBaseURL
    ? `<img src="${escapeAttribute(assetBaseURL)}/assets/brand/wordmark-dark@2x.png" alt="mytimes" width="64" height="16" style="display:block;border:0;outline:none;line-height:1;height:16px;width:64px">`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>`
      + `<td style="font-family:${FONT_DISPLAY};font-size:13px;font-weight:700;color:${COLOR_BODY};letter-spacing:-0.005em;mso-line-height-rule:exactly">mytimes</td>`
      + `<td width="6"></td>`
      + `<td><span style="display:inline-block;width:4px;height:4px;background-color:${COLOR_BRAND};border-radius:50%;vertical-align:middle"></span></td>`
      + `</tr></table>`;
  const manageCell = manageURL
    ? `<td valign="middle" align="right" style="font-family:${FONT_BODY};font-size:11px;color:#A1A1AA"><a href="${escapeAttribute(manageURL)}" style="color:#A1A1AA;text-decoration:underline">Manage</a></td>`
    : "";
  return [
    `<tr><td style="padding:28px 32px 28px 32px">`,
    `<div style="height:1px;line-height:1px;background-color:${COLOR_HAIRLINE};margin:0 0 18px 0">&nbsp;</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`,
    `<tr>`,
    `<td valign="middle">`,
    mark,
    `<div style="margin-top:10px;font-family:${FONT_BODY};font-size:11px;line-height:1.55;mso-line-height-rule:exactly;color:#A1A1AA;letter-spacing:0.01em">${noteLine}</div>`,
    `</td>`,
    manageCell,
    `</tr>`,
    `</table>`,
    `</td></tr>`,
  ].join("");
}

// =============================================================================
// Time / formatting helpers
// =============================================================================

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(value);
}

function formatSlotWindow(slot: SlotDTO, timezone: string): string {
  const start = new Date(slot.startsAt);
  const end = new Date(slot.endsAt);
  const date = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: timezone,
  }).format(start);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  });
  const tzName = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "short",
  }).formatToParts(start).find((part) => part.type === "timeZoneName")?.value ?? timezone;
  return `${date} · ${time.format(start)}-${time.format(end)} ${tzName}`;
}

type SlotPartsForBlock = {
  weekday: string;
  date: string;
  timeRange: string;
  timezone: string;
};

function formatSlotPartsForBlock(slot: SlotDTO, timezone: string): SlotPartsForBlock {
  const start = new Date(slot.startsAt);
  const end = new Date(slot.endsAt);
  const weekday = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    timeZone: timezone,
  }).format(start);
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: timezone,
  }).format(start);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  });
  const tzName = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "short",
  }).formatToParts(start).find((part) => part.type === "timeZoneName")?.value ?? timezone;
  return {
    weekday,
    date,
    timeRange: `${time.format(start)} – ${time.format(end)}`,
    timezone: tzName,
  };
}

function buildTimeBlock(slot: SlotDTO, eventTimezone: string, booking: BookingDTO): TimeBlockData {
  const participantTimezone = booking.participantTimezone ?? eventTimezone;
  if (participantTimezone === eventTimezone) {
    return {
      primary: {
        label: "When",
        ...formatSlotPartsForBlock(slot, eventTimezone),
      },
    };
  }
  return {
    primary: {
      label: "Your time",
      ...formatSlotPartsForBlock(slot, participantTimezone),
    },
    secondary: {
      label: "Organizer time",
      ...formatSlotPartsForBlock(slot, eventTimezone),
    },
  };
}

function buildOrganizerTimeBlock(slot: SlotDTO, eventTimezone: string, booking: BookingDTO): TimeBlockData {
  const participantTimezone = booking.participantTimezone;
  if (!participantTimezone || participantTimezone === eventTimezone) {
    return {
      primary: {
        label: "When",
        ...formatSlotPartsForBlock(slot, eventTimezone),
      },
    };
  }
  return {
    primary: {
      label: "Your time",
      ...formatSlotPartsForBlock(slot, eventTimezone),
    },
    secondary: {
      label: "Participant time",
      ...formatSlotPartsForBlock(slot, participantTimezone),
    },
  };
}

function participantTimeRows(
  slot: SlotDTO,
  eventTimezone: string,
  booking: BookingDTO,
): Array<[string, string]> {
  const participantTimezone = booking.participantTimezone ?? eventTimezone;
  const participantLabel = formatSlotWindow(slot, participantTimezone);
  const organizerLabel = formatSlotWindow(slot, eventTimezone);

  if (participantTimezone === eventTimezone) {
    return [["Time", organizerLabel]];
  }

  return [
    ["Your time", participantLabel],
    ["Organizer time", organizerLabel],
  ];
}

function participantTimeTextLines(slot: SlotDTO, eventTimezone: string, booking: BookingDTO): string[] {
  return participantTimeRows(slot, eventTimezone, booking).map(([label, value]) => `${label}: ${value}`);
}

function toBase64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function stringField(value: unknown, field: string): string | undefined {
  if (!value || typeof value !== "object" || !(field in value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return typeof record[field] === "string" ? record[field] : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emailDomain(email: string): string {
  return email.split("@").at(1)?.toLowerCase() ?? "unknown";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
