import type { BookingIcsInput } from "./types.js";

export function createBookingRequestIcs(input: BookingIcsInput): string {
  return createBookingIcs(input, "REQUEST");
}

export function createBookingCancellationIcs(input: BookingIcsInput): string {
  return createBookingIcs(input, "CANCEL");
}

function createBookingIcs(input: BookingIcsInput, method: "REQUEST" | "CANCEL"): string {
  const sequence = input.sequence ?? 0;
  const statusLines = method === "CANCEL" ? ["STATUS:CANCELLED"] : [];
  const description = [input.description, `Organizer: ${input.organizerName}`].filter(Boolean).join("\\n\\n");

  return foldIcsLines([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//mytimes//EN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(input.bookingId)}@slotboard`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `SEQUENCE:${sequence}`,
    `DTSTART:${formatIcsDate(input.startsAt)}`,
    `DTEND:${formatIcsDate(input.endsAt)}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `ORGANIZER;CN=${escapeIcsParam(input.organizerName)}:mailto:${input.organizerEmail}`,
    `ATTENDEE;CN=${escapeIcsParam(input.participantName)};PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${input.participantEmail}`,
    ...statusLines,
    "END:VEVENT",
    "END:VCALENDAR",
  ]);
}

function formatIcsDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function escapeIcsParam(value: string): string {
  return `"${value.replace(/"/g, "'")}"`;
}

function foldIcsLines(lines: string[]): string {
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

function foldLine(line: string): string {
  if (line.length <= 75) {
    return line;
  }

  const chunks: string[] = [];
  let remaining = line;
  while (remaining.length > 75) {
    chunks.push(remaining.slice(0, 75));
    remaining = ` ${remaining.slice(75)}`;
  }
  chunks.push(remaining);
  return chunks.join("\r\n");
}
