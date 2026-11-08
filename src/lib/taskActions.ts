import { supabase } from "@/integrations/supabase/client";
import { COMPLETE_TASK_ERRORS, mapDbError } from "@/lib/errors";

/** Marks a task completed. Returns the text to show the publisher on refusal, or null on success. */
export async function completeTask(taskId: string): Promise<string | null> {
  const { error } = await supabase.rpc("complete_task", { _task_id: taskId });
  if (!error) return null;
  return mapDbError(error, COMPLETE_TASK_ERRORS, "לא הצלחנו לסמן את המטלה כהושלמה");
}
