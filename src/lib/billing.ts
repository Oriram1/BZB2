import { useQuery } from "@tanstack/react-query";
import { invokeFunction } from "@/lib/invokeFunction";
import { paymentErrorText } from "@/lib/paymentErrors";
import { queryClient } from "@/lib/queryClient";
import { supabase } from "@/integrations/supabase/client";

export type PlanId = "quarterly" | "annual";

type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

type PlanInfo = { name: string; price: number; periodMonths: number };

/** What the screens say about a plan's cadence comes from its period, so a price change is the only edit needed: "ל-3 חודשים" / "לשנה". */
export const periodShort = (months: number) => {
  if (months === 12) return "לשנה";
  if (months === 1) return "לחודש";
  return `ל-${months} חודשים`;
};

type PlanRow = { id: string; name: string; amount: number | string; period_months: number; active: boolean };

const plansQueryKey = ["billing-plans"] as const;

type Plans = Partial<Record<PlanId, PlanInfo>>;
const NO_PLANS: Plans = {};

async function fetchPlans(): Promise<Plans> {
  const { data, error } = await supabase
    .from("billing_plans")
    .select("id, name, amount, period_months, active")
    .eq("active", true);
  if (error) throw error;
  const result: Plans = {};
  for (const row of (data ?? []) as PlanRow[]) {
    if (!isPaidPlan(row.id)) continue;
    result[row.id] = {
      name: row.name,
      price: Number(row.amount),
      periodMonths: row.period_months,
    };
  }
  return result;
}

/** Forget what was loaded, e.g. after an admin changes a price. */
export const invalidatePlans = () => queryClient.invalidateQueries({ queryKey: plansQueryKey });

/**
 * The plans as the server has them. The price shown here and the amount
 * charged come from the same `billing_plans` row, and the charge additionally
 * verifies that row's signature, so this is for display only: it cannot change
 * what a card is charged.
 */
export function usePlans() {
  const { data, isPending } = useQuery({ queryKey: plansQueryKey, queryFn: fetchPlans, staleTime: Infinity, retry: false });
  return { plans: data ?? NO_PLANS, loading: isPending };
}

export const isPaidPlan = (value: string | null | undefined): value is PlanId =>
  value === "quarterly" || value === "annual";


/**
 * Opens a hosted payment page. `planId` is ignored by the server for a
 * subscription that is past due — it pays the plan they already have.
 */
export const startCheckout = (planId: PlanId | null) =>
  invokeFunction<{ url: string; order_id: string }>("billing-create-checkout", {
    plan_id: planId,
    accept_renewal: true,
  });

/** What `billing-confirm` reports. The flags apply to a charge (a task payment or saved card), never to a subscription order. */
export type Confirmation = {
  status: PaymentStatus;
  taskId?: string | null;
  trial?: boolean;
  trialRefused?: boolean;
  cardUpdated?: boolean;
  awaitingReview?: boolean;
  failureReason?: string;
};

export const confirmOrder = (orderId: string) =>
  invokeFunction<Confirmation>("billing-confirm", { order_id: orderId });

/** A task payment or a saved card (not a subscription order). */
export const confirmCharge = (chargeId: string) =>
  invokeFunction<Confirmation>("billing-confirm", { charge_id: chargeId });

/** Replace the saved card without renewing or charging the subscription. */
export const updateSubscriptionCard = () =>
  invokeFunction<{ url: string; charge_id: string }>("task-pay", { action: "update_card" });

/** The free month: saves a card on Cardcom's page, charges nothing now. */
export const startTrial = (planId: PlanId) =>
  invokeFunction<{ url: string; charge_id: string }>("billing-start-trial", { plan_id: planId, accept_renewal: true });

export const changePlan = (planId: PlanId) =>
  invokeFunction<{ status: "upgraded" | "scheduled" | "changed" | "schedule_cleared"; charged?: number; credit?: number; effective?: string }>(
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
  invokeFunction<CancelPreview>("billing-cancel-refund", { action: "preview" });

export const confirmRefundCancellation = (deleteTaskIds: string[]) =>
  invokeFunction<{ status: "refunded"; refunded: number; difference_charged: number; tasks_kept: number; tasks_removed: number }>(
    "billing-cancel-refund",
    { action: "confirm", delete_task_ids: deleteTaskIds },
  );

export const cancelSubscription = () =>
  invokeFunction<{ status: string; cancel_at_period_end: boolean; ends_at?: string }>("billing-cancel", {});

export const resumeSubscription = () =>
  invokeFunction<{ status: string; cancel_at_period_end: boolean }>("billing-cancel", { resume: true });



/** One line of the payment history: a subscription payment or any other charge. */
export type HistoryRow = {
  id: string;
  label: string;
  amount: number;
  status: PaymentStatus;
  date: string;
  document_url: string | null;
};

type OrderInput = { id: string; amount: number | string; status: PaymentStatus; kind: string; paid_at: string | null; created_at: string; document_url: string | null };
type ChargeInput = { id: string; amount: number | string; status: PaymentStatus; purpose: string; paid_at: string | null; created_at: string; document_url: string | null };

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
