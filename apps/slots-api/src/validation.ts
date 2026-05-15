import type { AvailabilityInput } from "@fresh-feel/slotboard-core";
import { ApiError } from "./errors.js";

export type AvatarStyle = "notionists" | "open-peeps" | "lorelei" | "big-smile";

const AVATAR_STYLES: readonly AvatarStyle[] = ["notionists", "open-peeps", "lorelei", "big-smile"];

export type CreateEventInput = {
  title: string;
  description: string;
  organizerName: string;
  organizerEmail: string;
  avatarStyle: AvatarStyle;
  timezone: string;
  allowMultipleBookings: boolean;
  availability: AvailabilityInput;
};

export type ClaimSlotInput = {
  slotId: string;
  participantName: string;
  participantEmail: string;
  notes: string;
  participantTimezone?: string | undefined;
  participantLocale?: string | undefined;
  participantOffsetAtBooking?: string | undefined;
};

export type UpdateEventInput = {
  title?: string;
  description?: string;
  organizerName?: string;
  organizerEmail?: string;
  avatarStyle?: AvatarStyle;
};

export type CancelBookingInput = {
  reason: string;
  reopenSlot: boolean;
};

export type RescheduleBookingInput = {
  slotId: string;
  notes?: string | undefined;
  participantTimezone?: string | undefined;
  participantLocale?: string | undefined;
  participantOffsetAtBooking?: string | undefined;
};

export type RecoveryInput = {
  organizerEmail: string;
};

export type ManageLinkRecoveryInput = {
  participantEmail: string;
};

export type MyBoardsLinkRequestInput = {
  organizerEmail: string;
};

export type ProductEventInput = {
  name: string;
  actorType: "anonymous" | "organizer" | "participant";
  eventId?: string | undefined;
  bookingId?: string | undefined;
  metadata: Record<string, unknown>;
};

export type EmailTestInput = {
  recipientEmail: string;
};

export type EmailDesignTestInput = {
  recipientEmail: string;
  variant?: string | undefined;
};

export type CustomDomainInput = {
  hostname: string;
};

export function toAvailabilityInput(value: unknown): AvailabilityInput {
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_availability", "Availability must be an object");
  }

  const input: AvailabilityInput = {
    startDate: stringValue(value, "startDate") as AvailabilityInput["startDate"],
    endDate: stringValue(value, "endDate") as AvailabilityInput["endDate"],
    weekdays: numberArray(value, "weekdays"),
    dailyStart: stringValue(value, "dailyStart") as AvailabilityInput["dailyStart"],
    dailyEnd: stringValue(value, "dailyEnd") as AvailabilityInput["dailyEnd"],
    durationMinutes: numberValue(value, "durationMinutes"),
    intervalMinutes: optionalNumber(value, "intervalMinutes"),
    timezone: stringValue(value, "timezone"),
  };

  const ranges = blockedRanges(value.blockedRanges);
  if (ranges) {
    input.blockedRanges = ranges;
  }
  const excludedSlotStarts = optionalStringArray(value, "excludedSlotStarts");
  if (excludedSlotStarts) {
    input.excludedSlotStarts = excludedSlotStarts;
  }

  return input;
}

export function toCreateEventInput(value: unknown): CreateEventInput {
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_event", "Request body must be an object");
  }

  const title = trimmedString(value, "title");
  const organizerName = trimmedString(value, "organizerName");
  const organizerEmail = normalizeEmail(stringValue(value, "organizerEmail"));
  const description = optionalString(value, "description", "");
  const avatarStyle = optionalAvatarStyle(value, "avatarStyle", "notionists");
  const allowMultipleBookings = optionalBoolean(value, "allowMultipleBookings", false);
  const availability = toAvailabilityInput(value.availability);

  if (title.length < 1 || title.length > 160) {
    throw new ApiError(400, "invalid_event", "title must be between 1 and 160 characters");
  }
  if (description.length > 5000) {
    throw new ApiError(400, "invalid_event", "description cannot exceed 5000 characters");
  }
  if (organizerName.length < 1 || organizerName.length > 160) {
    throw new ApiError(400, "invalid_event", "organizerName must be between 1 and 160 characters");
  }
  if (!isPlausibleEmail(organizerEmail)) {
    throw new ApiError(400, "invalid_event", "organizerEmail must be a valid email address");
  }
  if (availability.timezone !== stringValue(value, "timezone")) {
    throw new ApiError(400, "invalid_event", "timezone must match availability.timezone");
  }

  return {
    title,
    description,
    organizerName,
    organizerEmail,
    avatarStyle,
    timezone: availability.timezone,
    allowMultipleBookings,
    availability,
  };
}

export function toClaimSlotInput(value: unknown): ClaimSlotInput {
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_booking", "Request body must be an object");
  }

  const slotId = trimmedString(value, "slotId");
  const participantName = trimmedString(value, "participantName");
  const participantEmail = normalizeEmail(stringValue(value, "participantEmail"));
  const notes = optionalString(value, "notes", "");
  const participantTimezone = optionalString(value, "participantTimezone", "");
  const participantLocale = optionalString(value, "participantLocale", "");
  const participantOffsetAtBooking = optionalString(value, "participantOffsetAtBooking", "");

  if (!isUuid(slotId)) {
    throw new ApiError(400, "invalid_booking", "slotId must be a UUID");
  }
  if (participantName.length < 1 || participantName.length > 160) {
    throw new ApiError(400, "invalid_booking", "participantName must be between 1 and 160 characters");
  }
  if (!isPlausibleEmail(participantEmail)) {
    throw new ApiError(400, "invalid_booking", "participantEmail must be a valid email address");
  }
  if (notes.length > 2000) {
    throw new ApiError(400, "invalid_booking", "notes cannot exceed 2000 characters");
  }
  if (participantTimezone && !isValidTimeZone(participantTimezone)) {
    throw new ApiError(400, "invalid_booking", "participantTimezone must be a valid IANA timezone");
  }
  if (participantLocale.length > 80) {
    throw new ApiError(400, "invalid_booking", "participantLocale cannot exceed 80 characters");
  }
  if (participantOffsetAtBooking.length > 64) {
    throw new ApiError(400, "invalid_booking", "participantOffsetAtBooking cannot exceed 64 characters");
  }

  return {
    slotId,
    participantName,
    participantEmail,
    notes,
    participantTimezone: participantTimezone || undefined,
    participantLocale: participantLocale || undefined,
    participantOffsetAtBooking: participantOffsetAtBooking || undefined,
  };
}

export function toUpdateEventInput(value: unknown): UpdateEventInput {
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_event", "Request body must be an object");
  }

  const patch: UpdateEventInput = {};

  if (value.title !== undefined) {
    const title = optionalString(value, "title", "");
    if (title.length < 1 || title.length > 160) {
      throw new ApiError(400, "invalid_event", "title must be between 1 and 160 characters");
    }
    patch.title = title;
  }

  if (value.description !== undefined) {
    const description = optionalString(value, "description", "");
    if (description.length > 5000) {
      throw new ApiError(400, "invalid_event", "description cannot exceed 5000 characters");
    }
    patch.description = description;
  }

  if (value.organizerName !== undefined) {
    const organizerName = optionalString(value, "organizerName", "");
    if (organizerName.length < 1 || organizerName.length > 160) {
      throw new ApiError(400, "invalid_event", "organizerName must be between 1 and 160 characters");
    }
    patch.organizerName = organizerName;
  }

  if (value.organizerEmail !== undefined) {
    const organizerEmail = normalizeEmail(stringValue(value, "organizerEmail"));
    if (!isPlausibleEmail(organizerEmail)) {
      throw new ApiError(400, "invalid_event", "organizerEmail must be a valid email address");
    }
    patch.organizerEmail = organizerEmail;
  }

  if (value.avatarStyle !== undefined) {
    patch.avatarStyle = optionalAvatarStyle(value, "avatarStyle", "notionists");
  }

  if (Object.keys(patch).length === 0) {
    throw new ApiError(400, "invalid_event", "At least one editable event field is required");
  }

  return patch;
}

export function toCancelBookingInput(value: unknown): CancelBookingInput {
  if (value === undefined || value === null) {
    return {
      reason: "",
      reopenSlot: true,
    };
  }
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_cancellation", "Request body must be an object");
  }
  return {
    reason: optionalString(value, "reason", ""),
    reopenSlot: optionalBoolean(value, "reopenSlot", true),
  };
}

export function toRescheduleBookingInput(value: unknown): RescheduleBookingInput {
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_reschedule", "Request body must be an object");
  }

  const slotId = trimmedString(value, "slotId");
  const notes = value.notes === undefined ? undefined : optionalString(value, "notes", "");
  const participantTimezone = optionalString(value, "participantTimezone", "");
  const participantLocale = optionalString(value, "participantLocale", "");
  const participantOffsetAtBooking = optionalString(value, "participantOffsetAtBooking", "");

  if (!isUuid(slotId)) {
    throw new ApiError(400, "invalid_reschedule", "slotId must be a UUID");
  }
  if (notes !== undefined && notes.length > 2000) {
    throw new ApiError(400, "invalid_reschedule", "notes cannot exceed 2000 characters");
  }
  if (participantTimezone && !isValidTimeZone(participantTimezone)) {
    throw new ApiError(400, "invalid_reschedule", "participantTimezone must be a valid IANA timezone");
  }
  if (participantLocale.length > 80) {
    throw new ApiError(400, "invalid_reschedule", "participantLocale cannot exceed 80 characters");
  }
  if (participantOffsetAtBooking.length > 64) {
    throw new ApiError(400, "invalid_reschedule", "participantOffsetAtBooking cannot exceed 64 characters");
  }

  return {
    slotId,
    notes,
    participantTimezone: participantTimezone || undefined,
    participantLocale: participantLocale || undefined,
    participantOffsetAtBooking: participantOffsetAtBooking || undefined,
  };
}

export function toRecoveryInput(value: unknown): RecoveryInput {
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_recovery", "Request body must be an object");
  }
  const organizerEmail = normalizeEmail(stringValue(value, "organizerEmail"));
  if (!isPlausibleEmail(organizerEmail)) {
    throw new ApiError(400, "invalid_recovery", "organizerEmail must be a valid email address");
  }
  return { organizerEmail };
}

export function toManageLinkRecoveryInput(value: unknown): ManageLinkRecoveryInput {
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_manage_recovery", "Request body must be an object");
  }
  const participantEmail = normalizeEmail(stringValue(value, "participantEmail"));
  if (!isPlausibleEmail(participantEmail)) {
    throw new ApiError(400, "invalid_manage_recovery", "participantEmail must be a valid email address");
  }
  return { participantEmail };
}

export function toMyBoardsLinkRequestInput(value: unknown): MyBoardsLinkRequestInput {
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_my_boards_request", "Request body must be an object");
  }
  const organizerEmail = normalizeEmail(stringValue(value, "organizerEmail"));
  if (!isPlausibleEmail(organizerEmail)) {
    throw new ApiError(400, "invalid_my_boards_request", "organizerEmail must be a valid email address");
  }
  return { organizerEmail };
}

export function toProductEventInput(value: unknown): ProductEventInput {
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_product_event", "Request body must be an object");
  }

  const name = trimmedString(value, "name");
  if (!/^[a-z0-9][a-z0-9_.:-]{0,119}$/i.test(name)) {
    throw new ApiError(
      400,
      "invalid_product_event",
      "name must be 1-120 characters and use letters, numbers, dots, underscores, colons, or hyphens",
    );
  }

  const actorType = optionalString(value, "actorType", "anonymous");
  if (!["anonymous", "organizer", "participant"].includes(actorType)) {
    throw new ApiError(400, "invalid_product_event", "actorType must be anonymous, organizer, or participant");
  }

  const eventId = optionalUuid(value, "eventId");
  const bookingId = optionalUuid(value, "bookingId");
  const metadata = optionalRecord(value, "metadata");

  return {
    name,
    actorType: actorType as ProductEventInput["actorType"],
    eventId,
    bookingId,
    metadata,
  };
}

export function toEmailTestInput(value: unknown): EmailTestInput {
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_email_test", "Request body must be an object");
  }

  const recipientEmail = normalizeEmail(stringValue(value, "recipientEmail"));
  if (!isPlausibleEmail(recipientEmail)) {
    throw new ApiError(400, "invalid_email_test", "recipientEmail must be a valid email address");
  }

  return { recipientEmail };
}

export function toEmailDesignTestInput(value: unknown): EmailDesignTestInput {
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_email_design_test", "Request body must be an object");
  }

  const recipientEmail = normalizeEmail(stringValue(value, "recipientEmail"));
  if (!isPlausibleEmail(recipientEmail)) {
    throw new ApiError(400, "invalid_email_design_test", "recipientEmail must be a valid email address");
  }

  const variantRaw = value["variant"];
  if (variantRaw !== undefined && typeof variantRaw !== "string") {
    throw new ApiError(400, "invalid_email_design_test", "variant must be a string");
  }

  return { recipientEmail, variant: variantRaw };
}

export function toCustomDomainInput(value: unknown): CustomDomainInput {
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_custom_domain", "Request body must be an object");
  }
  const hostname = normalizeHostname(stringValue(value, "hostname"));
  if (!isValidCustomHostname(hostname)) {
    throw new ApiError(
      400,
      "invalid_custom_domain",
      "Use a subdomain like book.company.com. Apex domains, wildcards, ports, and local hosts are not supported.",
    );
  }
  return { hostname };
}

function blockedRanges(value: unknown): AvailabilityInput["blockedRanges"] {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ApiError(400, "invalid_availability", "blockedRanges must be an array");
  }

  return value.map((item) => {
    if (!isRecord(item)) {
      throw new ApiError(400, "invalid_availability", "blockedRanges entries must be objects");
    }
    return {
      start: stringValue(item, "start") as NonNullable<AvailabilityInput["blockedRanges"]>[number]["start"],
      end: stringValue(item, "end") as NonNullable<AvailabilityInput["blockedRanges"]>[number]["end"],
    };
  });
}

function trimmedString(record: Record<string, unknown>, key: string): string {
  return stringValue(record, key).trim();
}

function optionalString(record: Record<string, unknown>, key: string, fallback: string): string {
  const value = record[key];
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_request", `${key} must be a string`);
  }
  return value.trim();
}

function optionalBoolean(record: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = record[key];
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== "boolean") {
    throw new ApiError(400, "invalid_request", `${key} must be a boolean`);
  }
  return value;
}

function optionalAvatarStyle(record: Record<string, unknown>, key: string, fallback: AvatarStyle): AvatarStyle {
  const value = optionalString(record, key, fallback);
  if (!AVATAR_STYLES.includes(value as AvatarStyle)) {
    throw new ApiError(400, "invalid_event", `${key} must be one of: ${AVATAR_STYLES.join(", ")}`);
  }
  return value as AvatarStyle;
}

function optionalStringArray(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ApiError(400, "invalid_request", `${key} must be an array of strings`);
  }
  if (value.length > 1000) {
    throw new ApiError(400, "invalid_request", `${key} cannot contain more than 1000 entries`);
  }
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

function optionalUuid(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || !isUuid(value)) {
    throw new ApiError(400, "invalid_request", `${key} must be a UUID`);
  }
  return value;
}

function optionalRecord(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  if (value === undefined || value === null) {
    return {};
  }
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_request", `${key} must be an object`);
  }
  if (JSON.stringify(value).length > 10000) {
    throw new ApiError(400, "invalid_request", `${key} is too large`);
  }
  return value;
}

export function stringValue(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_request", `${key} must be a string`);
  }
  return value;
}

function numberValue(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number") {
    throw new ApiError(400, "invalid_request", `${key} must be a number`);
  }
  return value;
}

function optionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number") {
    throw new ApiError(400, "invalid_request", `${key} must be a number`);
  }
  return value;
}

function numberArray(record: Record<string, unknown>, key: string): number[] {
  const value = record[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "number")) {
    throw new ApiError(400, "invalid_request", `${key} must be an array of numbers`);
  }
  return value;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeHostname(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const host = trimmed.includes("://")
    ? safeURLHostname(trimmed)
    : trimmed.split("/")[0]?.split("?")[0]?.split("#")[0] ?? "";
  return host.replace(/\.$/, "");
}

function safeURLHostname(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidCustomHostname(hostname: string): boolean {
  if (hostname.length < 4 || hostname.length > 253) {
    return false;
  }
  if (
    hostname === "localhost" ||
    hostname.includes(":") ||
    hostname.includes("*") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(hostname)
  ) {
    return false;
  }
  const labels = hostname.split(".");
  if (labels.length < 3) {
    return false;
  }
  return labels.every((label) =>
    label.length >= 1 &&
    label.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
