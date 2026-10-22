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
type Result<T> = { ok: true; data: T; code?: undefined } | { ok: false; code: string; data?: undefined };

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<Result<T>> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let code = "network_error";
    try {
      const response = (error as { context?: Response }).context;
      const payload = response ? await response.json() : null;
      if (payload?.error) code = String(payload.error);
    } catch {
      /* keep the generic code */
    }
    return { ok: false, code };
  }
  if (data && typeof data === "object" && "error" in data) return { ok: false, code: String((data as { error: unknown }).error) };
  return { ok: true, data: data as T };
}

/** Opens Cardcom's page to save a card without charging it. */
export async function startTaskCardSetup(): Promise<PageResult> {
  const result = await invoke<{ url: string }>("task-pay", { action: "card_setup" });
  if (!result.ok) return { ok: false, code: result.code };
  return { ok: true, url: result.data.url };
}

/** Charges the saved card again for a task that is waiting for payment. */
export function retryTaskPayment(taskId: string) {
  return invoke<{ state: TaskPublishState; charge: string }>("task-pay", { action: "retry", task_id: taskId });
}

/** Opens Cardcom's page to pay a waiting task with a different card. */
export async function payTaskWithNewCard(taskId: string): Promise<PageResult> {
  const result = await invoke<{ url: string }>("task-pay", { action: "new_card", task_id: taskId });
  if (!result.ok) return { ok: false, code: result.code };
  return { ok: true, url: result.data.url };
}

/** A one-time hosted charge; wallets require activation on the Cardcom terminal. */
export async function payTaskOnce(taskId: string): Promise<PageResult> {
  const result = await invoke<{ url: string }>("task-pay", { action: "wallet", task_id: taskId });
  if (!result.ok) return { ok: false, code: result.code };
  return { ok: true, url: result.data.url };
}

/** Admin: approve or reject a task in the review queue. */
export function reviewTask(taskId: string, approve: boolean, note?: string) {
  return invoke<{ state: TaskPublishState; charge?: string }>("task-review", { task_id: taskId, approve, note });
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

export const billingErrorText = (code: string) => {
  switch (code) {
    case "payment_unavailable":
      return "שירות התשלום לא זמין כרגע. אפשר לנסות שוב בעוד כמה דקות";
    case "network_error":
      return "לא הצלחנו להתחבר לשירות התשלום. בדקו את החיבור ונסו שוב";
    case "not_found":
      return "המטלה לא נמצאה או שאין הרשאה לתשלום";
    case "card_required":
      return "צריך לשמור כרטיס אשראי קודם";
    case "too_many_attempts":
      return "יותר מדי ניסיונות, אפשר לנסות שוב בעוד שעה";
    case "billing_disabled":
      return "התשלומים לא פעילים כרגע";
    case "not_waiting_for_payment":
      return "המטלה כבר לא ממתינה לתשלום";
    default:
      return "משהו השתבש, נסו שוב בעוד רגע";
  }
};
