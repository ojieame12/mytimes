/* ─── Time formatting helpers ─────────────────────────────
 * Single source of truth for everywhere we render a Date.
 * All formatters are timezone-aware and use Intl primitives
 * so there is no library footprint to maintain. */

const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function dateTimeFormatter(
  key: string,
  locale: string | string[],
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const existing = FORMATTERS.get(key);
  if (existing) return existing;
  const formatter = new Intl.DateTimeFormat(locale, options);
  FORMATTERS.set(key, formatter);
  return formatter;
}

/** "05:00" — 24-hour clock time in a specific timezone. */
export function formatTimeInTz(date: Date, tz: string): string {
  return dateTimeFormatter(`time:${tz}`, 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  }).format(date);
}

/** "EDT" / "BST" — short tz abbreviation for a given instant + zone. */
export function formatTzAbbrev(date: Date, tz: string): string {
  const parts = dateTimeFormatter(`tz-abbrev:${tz}`, 'en-US', {
    timeZone: tz,
    timeZoneName: 'short',
  }).formatToParts(date);
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
}

/** "GMT+02:00" — stable offset label for the exact instant booked. */
export function formatUtcOffset(date: Date, tz: string): string {
  const parts = dateTimeFormatter(`utc-offset:${tz}`, 'en-US', {
    timeZone: tz,
    timeZoneName: 'longOffset',
  }).formatToParts(date);
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? formatTzAbbrev(date, tz);
}

/** "MON 12 MAY" — uppercase mono-styled day label. */
export function formatDayLabel(date: Date, tz: string): string {
  return dateTimeFormatter(`day-label:${tz}`, 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: tz,
  })
    .format(date)
    .toUpperCase();
}

/** "2026-05-18" — stable key for day grouping in a specific tz. */
export function formatDateKey(date: Date, tz: string): string {
  // en-CA gives ISO-like "2026-05-18" formatting.
  return dateTimeFormatter(`date-key:${tz}`, 'en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: tz,
  }).format(date);
}

export function formatDayPartsInTz(
  date: Date,
  tz: string,
): { weekdayLong: string; weekdayShort: string; day: string; monthShort: string } {
  return {
    weekdayLong: dateTimeFormatter(`weekday-long:${tz}`, 'en-GB', {
      weekday: 'long',
      timeZone: tz,
    }).format(date),
    weekdayShort: dateTimeFormatter(`weekday-short:${tz}`, 'en-GB', {
      weekday: 'short',
      timeZone: tz,
    }).format(date),
    day: dateTimeFormatter(`day-2:${tz}`, 'en-GB', {
      day: '2-digit',
      timeZone: tz,
    }).format(date),
    monthShort: dateTimeFormatter(`month-short:${tz}`, 'en-GB', {
      month: 'short',
      timeZone: tz,
    }).format(date),
  };
}

export function hourInTz(date: Date, tz: string): number {
  const hour = dateTimeFormatter(`hour:${tz}`, 'en-GB', {
    hour: '2-digit',
    hour12: false,
    timeZone: tz,
  }).format(date);
  return Number(hour);
}

/** The viewer's IANA timezone. Falls back to UTC if unavailable. */
export function viewerTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Group time slots into day buckets keyed by viewer-local date. Ordered. */
export function groupSlotsByDay<T extends { startsAt: string }>(
  slots: T[],
  viewerTz: string,
): Array<{ dateKey: string; date: Date; slots: T[] }> {
  const byKey = new Map<string, { dateKey: string; date: Date; slots: T[] }>();
  for (const slot of slots) {
    const d = new Date(slot.startsAt);
    const key = formatDateKey(d, viewerTz);
    const existing = byKey.get(key);
    if (existing) {
      existing.slots.push(slot);
    } else {
      // Anchor `date` to UTC noon of the day — avoids edge cases where
      // a tz shift would flip a Date back to the previous calendar day.
      const [y, m, dd] = key.split('-').map(Number);
      byKey.set(key, {
        dateKey: key,
        date: new Date(Date.UTC(y, m - 1, dd, 12)),
        slots: [slot],
      });
    }
  }
  return Array.from(byKey.values())
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    .map((g) => ({
      ...g,
      slots: g.slots.sort((x, y) => x.startsAt.localeCompare(y.startsAt)),
    }));
}
