import type { BookingIcsInput } from "./types.js";

export type BookingCalendarLinksInput = BookingIcsInput & {
  calendarURL: string;
  manageURL?: string | undefined;
  location?: string | undefined;
};

export type BookingCalendarLinks = {
  googleUrl: string;
  outlookUrl: string;
  office365Url: string;
  appleUrl: string;
  icsUrl: string;
};

export function createBookingCalendarLinks(input: BookingCalendarLinksInput): BookingCalendarLinks {
  const startCompact = formatCompactUtc(input.startsAt);
  const endCompact = formatCompactUtc(input.endsAt);
  const startIso = formatIsoUtc(input.startsAt);
  const endIso = formatIsoUtc(input.endsAt);
  const details = calendarDetails(input);
  const location = input.location ?? "";

  return {
    googleUrl: urlWithParams("https://calendar.google.com/calendar/render", {
      action: "TEMPLATE",
      text: input.title,
      dates: `${startCompact}/${endCompact}`,
      details,
      location,
    }),
    outlookUrl: outlookComposeUrl("https://outlook.live.com/calendar/0/deeplink/compose", {
      title: input.title,
      startsAt: startIso,
      endsAt: endIso,
      details,
      location,
    }),
    office365Url: outlookComposeUrl("https://outlook.office.com/calendar/0/deeplink/compose", {
      title: input.title,
      startsAt: startIso,
      endsAt: endIso,
      details,
      location,
    }),
    appleUrl: toWebcalURL(input.calendarURL),
    icsUrl: input.calendarURL,
  };
}

function outlookComposeUrl(baseURL: string, input: {
  title: string;
  startsAt: string;
  endsAt: string;
  details: string;
  location: string;
}): string {
  return urlWithParams(baseURL, {
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: input.title,
    startdt: input.startsAt,
    enddt: input.endsAt,
    body: input.details,
    location: input.location,
  });
}

function calendarDetails(input: BookingCalendarLinksInput): string {
  return [
    input.description,
    `Organizer: ${input.organizerName} <${input.organizerEmail}>`,
    `Participant: ${input.participantName} <${input.participantEmail}>`,
    input.manageURL ? `Manage or cancel: ${input.manageURL}` : undefined,
  ].filter((line): line is string => Boolean(line)).join("\n\n");
}

function urlWithParams(baseURL: string, params: Record<string, string>): string {
  const url = new URL(baseURL);
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
}

function toWebcalURL(calendarURL: string): string {
  if (/^https?:\/\//i.test(calendarURL)) {
    return calendarURL.replace(/^https?:\/\//i, "webcal://");
  }

  try {
    const url = new URL(calendarURL);
    if (url.protocol === "webcal:") {
      return calendarURL;
    }
    return calendarURL;
  } catch {
    return calendarURL;
  }
}

function formatCompactUtc(value: Date | string): string {
  return formatIsoUtc(value).replace(/[-:]/g, "");
}

function formatIsoUtc(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}
