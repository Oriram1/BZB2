/**
 * Billing rules shared by every billing Edge Function.
 *
 * The decisions here are pure (`evaluateLowProfileResult`, `evaluateTransaction`,
 * `planFailure`) so they can be tested without Cardcom or a database. The
 * functions that touch the database are thin around them.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import {
  cardcomConfig,
  expiryMMYY,
  getLpResult,
  type CardcomDocument,
  type LowProfileResult,
  type TransactionInfo,
} from "./cardcom.ts";

/** Days after the period ended that each renewal attempt is made. */
export const RETRY_OFFSETS_DAYS = [0, 3, 7] as const;

export type BillingEvent =
  | "billing_renewal_reminder"
  | "billing_payment_succeeded"
  | "billing_payment_failed"
  | "billing_subscription_canceled"
  | "billing_subscription_ended"
  | "billing_refunded";

export type OrderRow = {
  id: string;
  user_id: string;
  plan_id: string;
  kind: "initial" | "renewal";
  amount: number | string;
  status: "pending" | "paid" | "failed" | "refunded";
  low_profile_id: string | null;
  external_uniq_id: string | null;
  deal_number: number | null;
};

export type SubscriptionRow = {
  id: string;
  user_id: string;
  plan_id: string;
  status: "active" | "past_due" | "canceled" | "expired";
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  renewal_attempts: number;
  next_attempt_at: string | null;
};

export type PaidDetails = {
  dealNumber: number | null;
  token: string | null;
  last4: string | null;
  expiry: string | null;
  documentNumber: number | null;
  documentUrl: string | null;
};

export type Verdict =
  | { kind: "paid"; details: PaidDetails }
  | { kind: "failed"; reason: string; code: number | null }
  | { kind: "pending" }
  /** Same idempotency key seen before: look the earlier attempt up instead. */
  | { kind: "duplicate" };

export function amountsMatch(a: number | string, b: number | string) {
  return Math.abs(Number(a) - Number(b)) < 0.005;
}

/**
 * Decides what a LowProfile result means for the order it was created for.
 * Every check is against OUR record of the order, never against values the
 * caller supplied, so a forged webhook can at worst cause a lookup.
 */
export function evaluateLowProfileResult(
  result: LowProfileResult,
  order: Pick<OrderRow, "id" | "amount">,
  terminal: number,
): Verdict {
  if (result.ReturnValue !== order.id) {
    return { kind: "failed", reason: "order_mismatch", code: result.ResponseCode ?? null };
  }
  if (result.TerminalNumber !== undefined && result.TerminalNumber !== terminal) {
    return { kind: "failed", reason: "terminal_mismatch", code: result.ResponseCode ?? null };
  }

  const tx = result.TranzactionInfo;
  // No card transaction yet: the customer has not finished (or not started).
  if (!tx) return { kind: "pending" };

  if (tx.ResponseCode !== 0) {
    return {
      kind: "failed",
      reason: (tx.Description ?? result.Description ?? "declined").slice(0, 200),
      code: tx.ResponseCode ?? null,
    };
  }
  if (!amountsMatch(tx.Amount ?? -1, order.amount)) {
    return { kind: "failed", reason: "amount_mismatch", code: 0 };
  }

  const token = result.TokenInfo?.Token ?? tx.Token ?? null;
  return {
    kind: "paid",
    details: {
      dealNumber: tx.TranzactionId ?? result.TranzactionId ?? null,
      token,
      last4: tx.Last4CardDigitsString ?? null,
      expiry: expiryMMYY(result.TokenInfo?.CardMonth ?? tx.CardMonth, result.TokenInfo?.CardYear ?? tx.CardYear),
      documentNumber: result.DocumentInfo?.DocumentNumber ?? tx.DocumentNumber ?? null,
      documentUrl: result.DocumentInfo?.DocumentUrl ?? null,
    },
  };
}

/** Same, for a direct token charge (or a lookup by ExternalUniqTranId). */
export function evaluateTransaction(info: TransactionInfo, order: Pick<OrderRow, "amount">): Verdict {
  if (info.ResponseCode === 608) return { kind: "duplicate" };
  if (info.ResponseCode !== 0) {
    return {
      kind: "failed",
      reason: (info.Description ?? "declined").slice(0, 200),
      code: info.ResponseCode ?? null,
    };
  }
  if (info.Amount !== undefined && !amountsMatch(info.Amount, order.amount)) {
    return { kind: "failed", reason: "amount_mismatch", code: 0 };
  }
  return {
    kind: "paid",
    details: {
      dealNumber: info.TranzactionId ?? null,
      token: null,
      last4: info.Last4CardDigitsString ?? null,
      expiry: expiryMMYY(info.CardMonth, info.CardYear),
      documentNumber: info.DocumentNumber ?? null,
      documentUrl: null,
    },
  };
}

/**
 * What happens after a failed renewal attempt. `attemptsSoFar` counts the
 * attempts made BEFORE this one; the schedule is anchored to the period end so
 * retries land on fixed days regardless of when the cron happened to run.
 */
export function planFailure(
  attemptsSoFar: number,
  periodEnd: Date,
): { expired: true } | { expired: false; attempts: number; nextAttemptAt: Date } {
  const attempts = attemptsSoFar + 1;
  if (attempts >= RETRY_OFFSETS_DAYS.length) return { expired: true };
  const next = new Date(periodEnd.getTime() + RETRY_OFFSETS_DAYS[attempts] * 86_400_000);
  return { expired: false, attempts, nextAttemptAt: next };
}

export function buildDocument(params: {
  planName: string;
  amount: number | string;
  orderId: string;
  name?: string | null;
  email?: string | null;
}): CardcomDocument {
  return {
    Name: params.name || undefined,
    Email: params.email || undefined,
    IsSendByEmail: Boolean(params.email),
    ExternalId: params.orderId,
    Products: [{ Description: `מנוי BZB – ${params.planName}`, UnitCost: Number(params.amount), Quantity: 1 }],
  };
}

/** Best effort: a notification must never break the billing path it reports on. */
export async function notifyBilling(
  admin: SupabaseClient,
  userId: string,
  event: BillingEvent,
  data: Record<string, unknown>,
  link = "/subscription",
) {
  const { error } = await admin
    .from("notifications")
    .insert({ user_id: userId, event_type: event, data, link });
  if (error) console.error("billing_notify_failed", { event, error: error.message });
}

export async function loadPlan(admin: SupabaseClient, planId: string) {
  const { data } = await admin
    .from("billing_plans")
    .select("id, name, amount, period_months, renewal_reminder_days, active")
    .eq("id", planId)
    .maybeSingle();
  return data as
    | { id: string; name: string; amount: number | string; period_months: number; renewal_reminder_days: number; active: boolean }
    | null;
}

/** Grants the paid period (idempotently) and tells the user, once. */
export async function applyVerdict(
  admin: SupabaseClient,
  order: OrderRow,
  details: PaidDetails,
): Promise<{ applied: boolean }> {
  const { data, error } = await admin.rpc("apply_paid_order", {
    _order_id: order.id,
    _deal_number: details.dealNumber,
    _token: details.token,
    _card_last4: details.last4,
    _card_expiry: details.expiry,
    _document_number: details.documentNumber,
    _document_url: details.documentUrl,
  });
  if (error) throw error;

  const result = data as
    | { applied: boolean; reason?: string; plan_name?: string; amount?: number; period_end?: string }
    | null;
  if (result?.reason === "period_already_paid") {
    // The customer was charged twice for one period (a recovery payment racing
    // the cron). The second charge is recorded but grants nothing; it needs a
    // refund from an admin.
    console.error("billing_double_charge", { orderId: order.id, userId: order.user_id });
  }
  if (!result?.applied) return { applied: false };

  await notifyBilling(admin, order.user_id, "billing_payment_succeeded", {
    plan_name: result.plan_name,
    amount: result.amount,
    period_end: result.period_end,
    kind: order.kind,
    document_url: details.documentUrl,
  });
  return { applied: true };
}

export async function markOrderFailed(
  admin: SupabaseClient,
  orderId: string,
  reason: string,
  code: number | null,
) {
  // Only a pending order can fail; a paid one must never be walked backwards.
  await admin
    .from("payment_orders")
    .update({ status: "failed", error: reason, response_code: code })
    .eq("id", orderId)
    .eq("status", "pending");
}

/**
 * Asks Cardcom what happened to a hosted-page order and records it. Safe to
 * call from the webhook, the return page and a retry, in any order.
 */
export async function settleLowProfileOrder(
  admin: SupabaseClient,
  order: OrderRow,
): Promise<{ status: OrderRow["status"] }> {
  if (order.status !== "pending" || !order.low_profile_id) return { status: order.status };

  const result = await getLpResult(order.low_profile_id);
  const verdict = evaluateLowProfileResult(result, order, cardcomConfig().terminal);

  if (verdict.kind === "paid") {
    await applyVerdict(admin, order, verdict.details);
    return { status: "paid" };
  }
  if (verdict.kind === "failed") {
    // A paid-but-rejected order (wrong amount, foreign order id) needs a human:
    // money may have moved without a subscription to show for it.
    if (verdict.reason === "amount_mismatch" || verdict.reason === "order_mismatch" || verdict.reason === "terminal_mismatch") {
      console.error("billing_result_rejected", { orderId: order.id, reason: verdict.reason });
    }
    await markOrderFailed(admin, order.id, verdict.reason, verdict.code);
    return { status: "failed" };
  }
  return { status: "pending" };
}
