/* ═══════════════════════════════════════════════════════════
   Free-tier quotas — hardcoded for now.

   These are the per-board ceilings users hit before the
   hidden board unlock ($19 one-time) becomes the next step.
   The backend will surface live values later; the constants
   here mirror what the marketing copy promises so the
   wizard's LimitIndicator can render without a fetch.
═══════════════════════════════════════════════════════════ */

export const FREE_LIMITS = {
  /** Maximum number of active (non-archived) boards on free. */
  activeBoards: 1,
  /** Bookings accepted per board on free before upgrade is required. */
  bookingsPerBoard: 15,
  /** Maximum generated slots a free board will publish. */
  slotsPerBoard: 30,
  /** Maximum source dates a free board can actively book across. */
  bookingDays: 3,
  /** Fallback expiry in days when no slot window can be derived. */
  retentionDays: 3,
} as const;

export type FreeLimitKey = keyof typeof FREE_LIMITS;
