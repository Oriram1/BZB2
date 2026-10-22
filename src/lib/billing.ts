import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PlanId = "quarterly" | "annual";

export type PlanInfo = { name: string; price: number; periodMonths: number; period: string };

/** Everything the screens say about a cadence comes from the plan's period, so a price change is the only edit needed. */
export const periodLabel = (months: number) => {
  if (months === 12) return "שנה";
  if (months === 1) return "חודש";
  return `${months} חודשים`;
};

/** Short form for a price line: "₪30 ל-3 חודשים" reads as "ל-3 חודשים" / "לשנה". */
export const periodShort = (months: number) => {
  if (months === 12) return "לשנה";
  if (months === 1) return "לחודש";
  return `ל-${months} חודשים`;
};

/** `29.9` -> "29.90", `30` -> "30": no trailing zeros unless there are agorot. */
export const formatPrice = (price: number) =>
  Number.isInteger(price) ? String(price) : price.toFixed(2);

type PlanRow = { id: string; name: string; amount: number | string; period_months: number; active: boolean };

let plansCache: Partial<Record<PlanId, PlanInfo>> | null = null;
let plansRequest: Promise<Partial<Record<PlanId, PlanInfo>>> | null = null;

const loadPlans = () => {
  plansRequest ??= (async () => {
    const { data } = await supabase
      .from("billing_plans")
      .select("id, name, amount, period_months, active")
      .eq("active", true);
    const result: Partial<Record<PlanId, PlanInfo>> = {};
    for (const row of (data ?? []) as PlanRow[]) {
      if (!isPaidPlan(row.id)) continue;
      result[row.id] = {
        name: row.name,
        price: Number(row.amount),
        periodMonths: row.period_months,
        period: periodLabel(row.period_months),
      };
    }
    plansCache = result;
    return result;
  })().catch(() => {
    // Allow a later screen to try again instead of caching a failure.
    plansRequest = null;
    return {} as Partial<Record<PlanId, PlanInfo>>;
  });
  return plansRequest;
};

/** Forget what was loaded, e.g. after an admin changes a price. */
export const invalidatePlans = () => {
  plansCache = null;
  plansRequest = null;
};

/**
 * The plans as the server has them. The price shown here and the amount
 * charged come from the same `billing_plans` row, and the charge additionally
 * verifies that row's signature, so this is for display only: it cannot change
 * what a card is charged.
 */
export function usePlans() {
  const [plans, setPlans] = useState<Partial<Record<PlanId, PlanInfo>>>(plansCache ?? {});
  const [loading, setLoading] = useState(plansCache === null);

  useEffect(() => {
    if (plansCache) return;
    let active = true;
    void loadPlans().then((loaded) => {
      if (!active) return;
      setPlans(loaded);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return { plans, loading };
}

export const isPaidPlan = (value: string | null | undefined): value is PlanId =>
  value === "quarterly" || value === "annual";

/** Days after a period ends that a failed renewal keeps being retried. Mirrors RETRY_OFFSETS_DAYS on the server. */
export const GRACE_DAYS = 14;

const ERROR_MESSAGES: Record<string, string> = {
  consent_required: "צריך לאשר את תנאי החידוש האוטומטי כדי להמשיך",
  unknown_plan: "המסלול לא נמצא",
  tasker_only: "מנויים זמינים למציעי מטלות בלבד",
  already_subscribed: "כבר יש לכם מנוי פעיל",
  too_many_attempts: "יותר מדי ניסיונות תשלום. כדאי לנסות שוב בעוד שעה",
  billing_disabled: "התשלומים עדיין לא נפתחו. נעדכן כשהמנויים יהיו זמינים",
  popup_blocked: "הדפדפן חסם את דף התשלום. יש לאפשר חלונות קופצים לאתר ולנסות שוב",
  network_error: "לא הצלחנו להתחבר לשירות התשלום. בדקו את החיבור ונסו שוב",
  payment_unavailable: "שירות התשלום לא זמין כרגע. נסו שוב בעוד כמה דקות",
  no_active_subscription: "לא נמצא מנוי פעיל",
  cannot_resume: "אי אפשר לחדש את המנוי הזה. אפשר לרכוש מנוי חדש",
  not_found: "ההזמנה לא נמצאה",
  trial_already_used: "החודש החינם כבר נוצל",
  same_plan: "זה כבר המסלול שלכם",
  refund_already_used: "ביטול עם החזר ל־14 יום כבר נוצל, והמנוי הבא הוא עד הסוף",
  window_passed: "עברו יותר מ־14 יום מהתשלום, ולכן אי אפשר לבטל עם החזר",
  charge_failed: "החיוב על המשימות שנשארו נדחה. אפשר לנסות כרטיס אחר",
  nothing_to_refund: "אין תשלום שאפשר להחזיר",
  refund_requires_review: "אי אפשר להשלים את ההחזר אוטומטית כרגע. פנו לתמיכה לבדיקת החיובים",
  no_active_subscription_refund: "אין מנוי פעיל",
};

export const billingErrorMessage = (code: string) =>
  ERROR_MESSAGES[code] ?? "משהו השתבש. נסו שוב";

// Both keys exist on both arms: the project does not compile with strict null
// checks, so a plain union would not narrow and `result.code` would not resolve.
type Result<T> = { ok: true; data: T; code?: undefined } | { ok: false; code: string; data?: undefined };

/** The functions answer failures with `{ error: "<code>" }`; surface that code. */
async function call<T>(name: string, body: Record<string, unknown>): Promise<Result<T>> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return { ok: true, data: data as T };

  let code = "unknown";
  try {
    const response = (error as { context?: Response }).context;
    const payload = response ? await response.json() : null;
    if (typeof payload?.error === "string") code = payload.error;
  } catch {
    // Not a JSON error body (network failure); keep the generic code.
  }
  return { ok: false, code };
}

/**
 * Opens a hosted payment page. `planId` is ignored by the server for a
 * subscription that is past due — it pays the plan they already have.
 */
export const startCheckout = (planId: PlanId | null) =>
  call<{ url: string; order_id: string }>("billing-create-checkout", {
    plan_id: planId,
    accept_renewal: true,
  });

export const confirmOrder = (orderId: string) =>
  call<{ status: "pending" | "paid" | "failed" | "refunded"; failureReason?: string }>("billing-confirm", { order_id: orderId });

export type ChargeStatus = "pending" | "paid" | "failed" | "refunded";

/** A task payment or a saved card (not a subscription order). */
export const confirmCharge = (chargeId: string) =>
  call<{ status: ChargeStatus; taskId?: string | null; trial?: boolean; cardUpdated?: boolean; failureReason?: string }>("billing-confirm", { charge_id: chargeId });

/** Replace the saved card without renewing or charging the subscription. */
export const updateSubscriptionCard = () =>
  call<{ url: string; charge_id: string }>("task-pay", { action: "update_card" });

/** The free month: saves a card on Cardcom's page, charges nothing now. */
export const startTrial = (planId: PlanId) =>
  call<{ url: string; charge_id: string }>("billing-start-trial", { plan_id: planId, accept_renewal: true });

export const changePlan = (planId: PlanId) =>
  call<{ status: "upgraded" | "scheduled" | "changed" | "schedule_cleared"; charged?: number; credit?: number; effective?: string }>(
    "billing-change-plan",
    { plan_id: planId },
  );

export type CancelPreview = {
  eligible: true;
  refund_amount: number;
  task_fee: number;
  tasks: { id: string; name: string; locked: boolean; is_first: boolean }[];
  difference_if_keep_all: number;
};

export const previewRefundCancellation = () =>
  call<CancelPreview>("billing-cancel-refund", { action: "preview" });

export const confirmRefundCancellation = (deleteTaskIds: string[]) =>
  call<{ status: "refunded"; refunded: number; difference_charged: number; tasks_kept: number; tasks_removed: number }>(
    "billing-cancel-refund",
    { action: "confirm", delete_task_ids: deleteTaskIds },
  );

export const cancelSubscription = () =>
  call<{ status: string; cancel_at_period_end: boolean; ends_at?: string }>("billing-cancel", {});

export const resumeSubscription = () =>
  call<{ status: string; cancel_at_period_end: boolean }>("billing-cancel", { resume: true });

export const formatDate = (value: string | null | undefined) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
};

/** Last day a past-due subscription is still honoured. */
export const graceEnd = (periodEnd: string) =>
  new Date(new Date(periodEnd).getTime() + GRACE_DAYS * 86_400_000).toISOString();

export type HistoryStatus = "pending" | "paid" | "failed" | "refunded";

/** One line of the payment history: a subscription payment or any other charge. */
export type HistoryRow = {
  id: string;
  label: string;
  amount: number;
  status: HistoryStatus;
  date: string;
  document_url: string | null;
};

type OrderInput = { id: string; amount: number | string; status: HistoryStatus; kind: string; paid_at: string | null; created_at: string; document_url: string | null };
type ChargeInput = { id: string; amount: number | string; status: HistoryStatus; purpose: string; paid_at: string | null; created_at: string; document_url: string | null };

const ORDER_LABEL: Record<string, string> = { initial: "מנוי: תשלום ראשון", renewal: "חידוש מנוי" };
const CHARGE_LABEL: Record<string, string> = {
  task: "עמלת פרסום מטלה",
  plan_change: "מעבר מסלול",
  cancel_difference: "הפרש על מטלות בביטול",
};

/**
 * Everything the customer was charged, newest first: subscription payments
 * (`payment_orders`) together with task fees, plan changes and the like
 * (`billing_charges`). Showing only the first kind hid money they had paid.
 */
export function mergePaymentHistory(orders: OrderInput[], charges: ChargeInput[], limit = 24): HistoryRow[] {
  const rows: HistoryRow[] = [
    ...orders.map((order) => ({
      id: `order-${order.id}`,
      label: ORDER_LABEL[order.kind] ?? "תשלום מנוי",
      amount: Number(order.amount),
      status: order.status,
      date: order.paid_at ?? order.created_at,
      document_url: order.document_url,
    })),
    ...charges
      .filter((charge) => CHARGE_LABEL[charge.purpose])
      .map((charge) => ({
        id: `charge-${charge.id}`,
        label: CHARGE_LABEL[charge.purpose],
        amount: Number(charge.amount),
        status: charge.status,
        date: charge.paid_at ?? charge.created_at,
        document_url: charge.document_url,
      })),
  ];
  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, limit);
}

export function paymentFailureMessage(reason?: string) {
  switch (reason) {
    case "card_declined": return "חברת האשראי לא אישרה את העסקה. אפשר לנסות כרטיס אחר או לפנות לחברת האשראי.";
    case "verification_failed": return "אימות פרטי העסקה לא הושלם. יש לפנות לתמיכה לפני ניסיון נוסף.";
    case "provider_unavailable": return "שירות הסליקה לא היה זמין. אפשר לנסות שוב בעוד כמה דקות.";
    default: return "לא התקבל אישור להשלמת הפעולה. אפשר לנסות שוב או לפנות לתמיכה אם הבעיה חוזרת.";
  }
}
