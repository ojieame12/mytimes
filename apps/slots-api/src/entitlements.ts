import { getPool } from "./db.js";

export type PlanKey = "free" | "event_pass" | "company_standby";
export type PaymentStatus = "not_required" | "pending" | "paid" | "failed" | "refunded";

export type EventEntitlement = {
  planKey: PlanKey;
  paymentStatus: PaymentStatus;
  paidAt: Date | null;
  expiresAt: Date | null;
  bookingLimit: number;
  slotLimit: number;
};

export const FREE_BOOKING_LIMIT = 15;
export const FREE_SLOT_LIMIT = 30;
export const FREE_BOOKING_WINDOW_DAYS = 3;
/** @deprecated Use {@link FREE_BOOKING_WINDOW_DAYS}. Retained for in-tree call sites pending a follow-up rename. */
export const FREE_BOOKING_DAY_LIMIT = FREE_BOOKING_WINDOW_DAYS;
export const FREE_RETENTION_DAYS = 3;
export const FREE_ACTIVE_BOARD_LIMIT = 1;

export const EVENT_PASS_BOOKING_LIMIT = 75;
export const EVENT_PASS_SLOT_LIMIT = 200;
export const EVENT_PASS_RETENTION_DAYS = 180;

export const COMPANY_STANDBY_BOOKING_LIMIT = 100_000;
export const COMPANY_STANDBY_SLOT_LIMIT = 100_000;

export function freeEventEntitlement(now = new Date()): EventEntitlement {
  return {
    planKey: "free",
    paymentStatus: "not_required",
    paidAt: null,
    expiresAt: addDays(now, FREE_RETENTION_DAYS),
    bookingLimit: FREE_BOOKING_LIMIT,
    slotLimit: FREE_SLOT_LIMIT,
  };
}

export function eventPassEntitlement(now = new Date()): EventEntitlement {
  return {
    planKey: "event_pass",
    paymentStatus: "paid",
    paidAt: now,
    expiresAt: addDays(now, EVENT_PASS_RETENTION_DAYS),
    bookingLimit: EVENT_PASS_BOOKING_LIMIT,
    slotLimit: EVENT_PASS_SLOT_LIMIT,
  };
}

export function companyStandbyEntitlement(now = new Date()): EventEntitlement {
  return {
    planKey: "company_standby",
    paymentStatus: "paid",
    paidAt: now,
    expiresAt: null,
    bookingLimit: COMPANY_STANDBY_BOOKING_LIMIT,
    slotLimit: COMPANY_STANDBY_SLOT_LIMIT,
  };
}

export async function hasActiveCompanyStandby(input: {
  ownerUserId: string | null;
  ownerEmail?: string | undefined;
}): Promise<boolean> {
  if (!input.ownerUserId && !input.ownerEmail) {
    return false;
  }

  const result = await getPool().query<{ exists: boolean }>(
    `
      select exists (
        select 1
        from slotboard.subscriptions
        where plan_key = 'company_standby'
          and status in ('active', 'trialing')
          and (
            current_period_end is null
            or current_period_end > now()
          )
          and (
            ($1::text is not null and owner_user_id = $1) or
            ($2::text is not null and lower(owner_email) = lower($2))
          )
      ) as exists
    `,
    [input.ownerUserId, input.ownerEmail ?? null],
  );
  return Boolean(result.rows[0]?.exists);
}

export async function readCreationEntitlement(ownerUserId: string | null): Promise<EventEntitlement> {
  if (!ownerUserId) {
    return freeEventEntitlement();
  }

  return (await hasActiveCompanyStandby({ ownerUserId }))
    ? companyStandbyEntitlement()
    : freeEventEntitlement();
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}
