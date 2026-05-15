import type {
  AvailabilityInput,
  BlockedRangeInput,
  ClockTime,
  GeneratedSlot,
  ISODate,
} from "./types.js";

const DEFAULT_ALLOWED_DURATIONS = new Set([15, 30, 45, 60, 90]);
const MAX_DAYS = 370;
const MAX_SLOTS = 1000;

export function generateAvailabilitySlots(input: AvailabilityInput): GeneratedSlot[] {
  validateAvailabilityInput(input);

  const intervalMinutes = input.intervalMinutes ?? input.durationMinutes;
  const weekdays = new Set(input.weekdays);
  const blockedRanges = normalizeBlockedRanges(input.blockedRanges ?? []);
  const excludedSlotStarts = new Set(input.excludedSlotStarts ?? []);
  const slots: GeneratedSlot[] = [];

  for (const sourceDate of enumerateDates(input.startDate, input.endDate)) {
    const weekday = getWeekday(sourceDate);
    if (!weekdays.has(weekday)) {
      continue;
    }

    const dayStart = minutesFromClock(input.dailyStart);
    const dayEnd = minutesFromClock(input.dailyEnd);

    for (
      let startMinute = dayStart;
      startMinute + input.durationMinutes <= dayEnd;
      startMinute += intervalMinutes
    ) {
      const endMinute = startMinute + input.durationMinutes;
      if (overlapsAnyBlockedRange(startMinute, endMinute, blockedRanges)) {
        continue;
      }

      const sourceStartTime = clockFromMinutes(startMinute);
      const sourceEndTime = clockFromMinutes(endMinute);

      const startsAt = zonedWallTimeToUtc(sourceDate, sourceStartTime, input.timezone).toISOString();
      if (excludedSlotStarts.has(startsAt)) {
        continue;
      }

      slots.push({
        startsAt,
        endsAt: zonedWallTimeToUtc(sourceDate, sourceEndTime, input.timezone).toISOString(),
        sourceDate,
        sourceStartTime,
        sourceEndTime,
        timezone: input.timezone,
      });

      if (slots.length > MAX_SLOTS) {
        throw new Error(`Availability generated more than ${MAX_SLOTS} slots`);
      }
    }
  }

  return slots;
}

function validateAvailabilityInput(input: AvailabilityInput): void {
  if (!isIsoDate(input.startDate) || !isIsoDate(input.endDate)) {
    throw new Error("startDate and endDate must use YYYY-MM-DD");
  }
  if (input.endDate < input.startDate) {
    throw new Error("endDate must be on or after startDate");
  }
  if (!isClockTime(input.dailyStart) || !isClockTime(input.dailyEnd)) {
    throw new Error("dailyStart and dailyEnd must use HH:mm");
  }
  if (minutesFromClock(input.dailyEnd) <= minutesFromClock(input.dailyStart)) {
    throw new Error("dailyEnd must be after dailyStart");
  }
  if (!DEFAULT_ALLOWED_DURATIONS.has(input.durationMinutes)) {
    throw new Error("durationMinutes must be one of 15, 30, 45, 60, or 90");
  }
  const intervalMinutes = input.intervalMinutes ?? input.durationMinutes;
  if (!DEFAULT_ALLOWED_DURATIONS.has(intervalMinutes)) {
    throw new Error("intervalMinutes must be one of 15, 30, 45, 60, or 90");
  }
  if (input.weekdays.length === 0 || input.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error("weekdays must contain integers from 0 (Sunday) to 6 (Saturday)");
  }
  if (input.excludedSlotStarts?.some((value) => !isIsoDateTime(value))) {
    throw new Error("excludedSlotStarts must contain ISO date-time strings");
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: input.timezone }).format(new Date());
  } catch {
    throw new Error("timezone must be a valid IANA timezone");
  }
}

function normalizeBlockedRanges(ranges: BlockedRangeInput[]): Array<[number, number]> {
  return ranges.map((range) => {
    if (!isClockTime(range.start) || !isClockTime(range.end)) {
      throw new Error("blockedRanges must use HH:mm");
    }
    const start = minutesFromClock(range.start);
    const end = minutesFromClock(range.end);
    if (end <= start) {
      throw new Error("blocked range end must be after start");
    }
    return [start, end];
  });
}

function overlapsAnyBlockedRange(
  startMinute: number,
  endMinute: number,
  ranges: Array<[number, number]>,
): boolean {
  return ranges.some(([blockedStart, blockedEnd]) => startMinute < blockedEnd && endMinute > blockedStart);
}

function* enumerateDates(startDate: ISODate, endDate: ISODate): Generator<ISODate> {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
  if (days > MAX_DAYS) {
    throw new Error(`Date range cannot exceed ${MAX_DAYS} days`);
  }

  for (let i = 0; i <= days; i += 1) {
    const next = new Date(start.getTime() + i * 86_400_000);
    yield formatIsoDate(next);
  }
}

function zonedWallTimeToUtc(date: ISODate, time: ClockTime, timeZone: string): Date {
  const target = parseWallParts(date, time);
  let utcMillis = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);

  for (let i = 0; i < 3; i += 1) {
    const local = getZonedParts(new Date(utcMillis), timeZone);
    const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
    const targetAsUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
    utcMillis -= localAsUtc - targetAsUtc;
  }

  const resolved = getZonedParts(new Date(utcMillis), timeZone);
  if (!sameWallParts(resolved, target)) {
    throw new Error(`Wall time ${date} ${time} is not representable in ${timeZone}`);
  }
  if (hasAmbiguousWallTime(target, utcMillis, timeZone)) {
    throw new Error(`Wall time ${date} ${time} is ambiguous in ${timeZone}`);
  }

  return new Date(utcMillis);
}

function hasAmbiguousWallTime(target: WallParts, utcMillis: number, timeZone: string): boolean {
  let matches = 0;
  const seen = new Set<number>();
  const searchWindowMinutes = 180;

  for (let offset = -searchWindowMinutes; offset <= searchWindowMinutes; offset += 1) {
    const candidateMillis = utcMillis + offset * 60_000;
    if (seen.has(candidateMillis)) {
      continue;
    }
    seen.add(candidateMillis);
    if (sameWallParts(getZonedParts(new Date(candidateMillis), timeZone), target)) {
      matches += 1;
      if (matches > 1) {
        return true;
      }
    }
  }

  return false;
}

function sameWallParts(left: WallParts, right: WallParts): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  );
}

function getZonedParts(date: Date, timeZone: string): WallParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const hour = Number(parts.hour === "24" ? "0" : parts.hour);

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
  };
}

function getWeekday(date: ISODate): number {
  return parseIsoDate(date).getUTCDay();
}

function parseIsoDate(date: ISODate): Date {
  const { year, month, day } = parseDateParts(date);
  return new Date(Date.UTC(year, month - 1, day));
}

function parseWallParts(date: ISODate, time: ClockTime): WallParts {
  const { year, month, day } = parseDateParts(date);
  const { hour, minute } = parseClockParts(time);
  return { year, month, day, hour, minute };
}

function formatIsoDate(date: Date): ISODate {
  return date.toISOString().slice(0, 10) as ISODate;
}

function isIsoDate(value: string): value is ISODate {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isClockTime(value: string): value is ClockTime {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isIsoDateTime(value: string): boolean {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function minutesFromClock(value: ClockTime): number {
  const { hour, minute } = parseClockParts(value);
  return hour * 60 + minute;
}

function clockFromMinutes(value: number): ClockTime {
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` as ClockTime;
}

type WallParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function parseDateParts(date: ISODate): Pick<WallParts, "year" | "month" | "day"> {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error("Invalid ISO date");
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function parseClockParts(time: ClockTime): Pick<WallParts, "hour" | "minute"> {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) {
    throw new Error("Invalid clock time");
  }
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}
