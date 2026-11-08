import { toast } from "sonner";

/** Either a PostgREST/RPC error or a `{ message: code }` wrapper around an edge-function error code. */
export type DbError = { code?: string; message?: string } | null | undefined;

/** Postgres SQLSTATE codes the screens react to. */
export const PG_UNIQUE_VIOLATION = "23505";
export const PG_CHECK_VIOLATION = "23514";
export const PG_INSUFFICIENT_PRIVILEGE = "42501";

export const isUniqueViolation = (error: DbError) => error?.code === PG_UNIQUE_VIOLATION;

/**
 * Hebrew text for a database error. RAISE EXCEPTION codes arrive inside the
 * message, so the first key of `messages` that the code or the message contains
 * wins; anything unrecognised gets the generic `fallback`.
 */
export function mapDbError(error: DbError, messages: Record<string, string>, fallback: string): string {
  const key = Object.keys(messages).find((candidate) => error?.code === candidate || error?.message?.includes(candidate));
  return key ? messages[key] : fallback;
}

/** `complete_task` refusals. */
export const COMPLETE_TASK_ERRORS: Record<string, string> = {
  no_accepted_worker: "אפשר לסמן מטלה כהושלמה רק אחרי שנבחר לה עובד",
  task_cancelled: "המטלה בוטלה, אז אי אפשר לסמן אותה כהושלמה",
};

export const CANCEL_TASK_ERRORS: Record<string, string> = {
  task_completed: "המטלה כבר הושלמה, אז אי אפשר לבטל אותה",
};

/** Accepting or rejecting a candidate. */
export const APPLICATION_ERRORS: Record<string, string> = {
  task_positions_full: "כל המקומות במטלה כבר תפוסים",
};

export const REVIEW_ERRORS: Record<string, string> = {
  appeal_pending: "קיים ערעור בבדיקה. אפשר לערוך אחרי שתתקבל החלטה",
};

/** `add-parent-contact` error codes. */
export const PARENT_CONTACT_ERRORS: Record<string, string> = {
  already_added: "הכתובת הזו כבר מקושרת",
  limit_reached: "אפשר לקשר עד 3 כתובות",
  invalid_email: "כתובת המייל לא תקינה",
};

/**
 * Runs an async action and answers its failure with one toast. Returns the
 * result, or undefined when it threw, so callers can stop on `=== undefined`.
 */
export async function runAction<T>(action: () => Promise<T>, failureText: string): Promise<T | undefined> {
  try {
    return await action();
  } catch {
    toast.error(failureText);
    return undefined;
  }
}
