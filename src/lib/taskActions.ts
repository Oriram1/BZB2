import { supabase } from "@/integrations/supabase/client";

const COMPLETION_REFUSALS: Record<string, string> = {
  no_accepted_worker: "אפשר לסמן מטלה כהושלמה רק אחרי שנבחר לה עובד",
  task_cancelled: "המטלה בוטלה, אז אי אפשר לסמן אותה כהושלמה",
};

/** Marks a task completed. Returns the text to show the publisher on refusal, or null on success. */
export async function completeTask(taskId: string): Promise<string | null> {
  const { error } = await supabase.rpc("complete_task", { _task_id: taskId });
  if (!error) return null;
  const reason = Object.keys(COMPLETION_REFUSALS).find((key) => error.message.includes(key));
  return reason ? COMPLETION_REFUSALS[reason] : "לא הצלחנו לסמן את המטלה כהושלמה";
}
