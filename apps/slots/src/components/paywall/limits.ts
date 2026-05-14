export const PLAN_LIMITS = {
  free: {
    bookings: 25,
    slots: 60,
  },
  eventPass: {
    bookings: 75,
    slots: 200,
    retentionDays: 180,
  },
} as const;
