import { supabase } from "@/integrations/supabase/client";

export type PlanId = "quarterly" | "annual";

/**
 * What the screens show. The amount actually charged always comes from the
 * `billing_plans` table on the server, so a wrong number here can mislead a
 * reader but never change what a card is charged.
 */
export const PAID_PLANS: Record<PlanId, { name: string; price: number; period: string }> = {
  quarterly: { name: "רבעוני", price: 30, period: "3 חודשים" },
  annual: { name: "שנתי", price: 100, period: "שנה" },
};

export const isPaidPlan = (value: string | null | undefined): value is PlanId =>
  value === "quarterly" || value === "annual";

/** Days after a period ends that a failed renewal keeps being retried. Mirrors RETRY_OFFSETS_DAYS on the server. */
export const GRACE_DAYS = 7;

const ERROR_MESSAGES: Record<string, string> = {
  consent_required: "צריך לאשר את תנאי החידוש האוטומטי כדי להמשיך",
  unknown_plan: "המסלול לא נמצא",
  tasker_only: "מנויים זמינים למציעי מטלות בלבד",
  already_subscribed: "כבר יש לכם מנוי פעיל",
  too_many_attempts: "יותר מדי ניסיונות תשלום. כדאי לנסות שוב בעוד שעה",
  billing_disabled: "התשלומים עדיין לא נפתחו. נעדכן כשהמנויים יהיו זמינים",
  payment_unavailable: "שירות התשלום לא זמין כרגע. נסו שוב בעוד כמה דקות",
  no_active_subscription: "לא נמצא מנוי פעיל",
  cannot_resume: "אי אפשר לחדש את המנוי הזה. אפשר לרכוש מנוי חדש",
  not_found: "ההזמנה לא נמצאה",
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
  call<{ status: "pending" | "paid" | "failed" | "refunded" }>("billing-confirm", { order_id: orderId });

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
