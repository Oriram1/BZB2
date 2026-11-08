// No imports: the Vite client reads this file through the @shared alias.

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

/** Days after the period ended that each renewal attempt is made. */
export const RETRY_OFFSETS_DAYS = [0, 3, 7, 14] as const;

/** Length of the free month, in days. */
export const TRIAL_DAYS = 30;

/** What a task costs when `billing_settings` has no `task_fee` row. */
export const DEFAULT_TASK_FEE = 3;

/** Pending subscription orders one account may open per hour. */
export const MAX_PENDING_ORDERS_PER_HOUR = 5;
/** Charge rows (task, card setup, plan change) one account may open per hour. */
export const MAX_CHARGES_PER_HOUR = 15;

/** Where a billing notification about a task sends the owner. */
export const PUBLISHED_TASKS_LINK = "/my-tasks?tab=published";

export const round2 = (value: number) => Math.round(value * 100) / 100;

/** Last instant a failed renewal is still retried; access holds until then. */
export function graceEnd(periodEnd: Date | string): Date {
  const lastOffset = RETRY_OFFSETS_DAYS[RETRY_OFFSETS_DAYS.length - 1];
  return new Date(new Date(periodEnd).getTime() + lastOffset * DAY_MS);
}

/** `MMYY` expiry → whether the card is past its last valid instant, in UTC. */
export function cardExpired(expiry: string | null | undefined, now = new Date()) {
  if (!expiry || !/^\d{4}$/.test(expiry)) return false;
  const month = Number(expiry.slice(0, 2));
  const year = 2000 + Number(expiry.slice(2));
  if (month < 1 || month > 12) return false;
  return now.getTime() >= Date.UTC(year, month, 1);
}
