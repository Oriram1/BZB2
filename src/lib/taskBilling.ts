import { invokeFunction } from "@/lib/invokeFunction";
import { paymentErrorText } from "@/lib/paymentErrors";
import { supabase } from "@/integrations/supabase/client";

/** Where an unsent task form waits while the person saves a card on Cardcom. */
export const TASK_DRAFT_KEY = "bzb.pendingTaskDraft";

export type PublishQuote = {
  due: number;
  task_fee: number;
  insurance_fee: number;
  free_slot: boolean;
  subscriber: boolean;
  has_card: boolean;
  /** Last four digits of the saved card, when there is one. */
  card_last4?: string | null;
  pending_payment_count: number;
  /** True while per-task billing is switched off: tasks go live as before. */
  billing_off?: boolean;
};

export type TaskPublishState =
  | "live"
  | "pending_review"
  | "awaiting_charge"
  | "pending_payment"
  | "draft"
  | "rejected"
  | "hidden";

export const publishStateLabel: Record<TaskPublishState, string> = {
  live: "פורסמה",
  pending_review: "ממתינה לאישור",
  awaiting_charge: "מאושרת, בתהליך חיוב",
  pending_payment: "ממתינה לתשלום",
  draft: "טיוטה",
  rejected: "לא אושרה",
  hidden: "מוסתרת",
};

// Both keys exist on both arms: the project does not compile with strict null
// checks, so a plain union would not narrow and `result.code` would not resolve.
type PageResult = { ok: true; url: string; code?: undefined } | { ok: false; code: string; url?: undefined };

async function hostedPage(body: Record<string, unknown>): Promise<PageResult> {
  const result = await invokeFunction<{ url: string }>("task-pay", body);
  return result.ok ? { ok: true, url: result.data.url } : { ok: false, code: result.code };
}

/** Opens Cardcom's page to save a card without charging it. */
export const startTaskCardSetup = () => hostedPage({ action: "card_setup" });

/** Charges the saved card again for a task that is waiting for payment. */
export function retryTaskPayment(taskId: string) {
  return invokeFunction<{ state: TaskPublishState; charge: string }>("task-pay", { action: "retry", task_id: taskId });
}

/** Opens Cardcom's page to pay a waiting task with a different card. */
export const payTaskWithNewCard = (taskId: string) => hostedPage({ action: "new_card", task_id: taskId });

/** A one-time hosted charge; wallets require activation on the Cardcom terminal. */
export const payTaskOnce = (taskId: string, method: "wallet" | "bit" = "wallet") => hostedPage({ action: method, task_id: taskId });

/** Admin: approve or reject a task in the review queue. */
export function reviewTask(taskId: string, approve: boolean, note?: string) {
  return invokeFunction<{ state: TaskPublishState; charge?: string }>("task-review", { task_id: taskId, approve, note });
}

/** Sends a draft or rejected task back into the review queue. */
export async function resubmitTask(taskId: string) {
  const { data, error } = await supabase.rpc("resubmit_draft_task", { _task_id: taskId });
  if (error) return { ok: false as const, code: error.message, due: undefined };
  const result = data as { ok: boolean; error?: string; due?: number } | null;
  return result?.ok
    ? { ok: true as const, due: result.due ?? 0, code: undefined }
    : { ok: false as const, code: result?.error ?? "failed", due: undefined };
}


/** Current price of publishing a task for this user, or null when it cannot be read. */
export async function fetchPublishQuote(insurance: boolean): Promise<PublishQuote | null> {
  const { data, error } = await supabase.rpc("my_publish_quote", { _insurance: insurance });
  if (error || !data) return null;
  return data as unknown as PublishQuote;
}
