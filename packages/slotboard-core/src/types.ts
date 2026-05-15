export type ISODate = `${number}-${number}-${number}`;
export type ClockTime = `${number}:${number}`;

export type BlockedRangeInput = {
  start: ClockTime;
  end: ClockTime;
};

export type AvailabilityInput = {
  startDate: ISODate;
  endDate: ISODate;
  weekdays: number[];
  dailyStart: ClockTime;
  dailyEnd: ClockTime;
  durationMinutes: number;
  intervalMinutes?: number | undefined;
  timezone: string;
  blockedRanges?: BlockedRangeInput[];
  excludedSlotStarts?: string[];
};

export type GeneratedSlot = {
  startsAt: string;
  endsAt: string;
  sourceDate: ISODate;
  sourceStartTime: ClockTime;
  sourceEndTime: ClockTime;
  timezone: string;
};

export type BookingIcsInput = {
  bookingId: string;
  sequence?: number;
  startsAt: Date | string;
  endsAt: Date | string;
  title: string;
  description?: string;
  organizerName: string;
  organizerEmail: string;
  participantName: string;
  participantEmail: string;
};
