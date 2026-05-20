export const PLAN_LIMITS = {
  free: {
    bookings: 15,
    slots: 30,
    bookingDays: 3,
  },
  eventPass: {
    bookings: 75,
    slots: 200,
    retentionDays: 180,
  },
} as const;
