import { supabase } from "@/integrations/supabase/client";
import { logUserActivity } from "@/lib/activityLog";
import type { DbError } from "@/lib/errors";

/** Statuses of a task someone has been picked for and that is not finished yet. */
export const ACTIVE_TASK_STATUSES = ["accepted", "in_progress"] as const;

/** Archiving is this app's delete. Returns null on success, the error otherwise. */
export async function archiveTask(userId: string, task: { id: string; name: string }): Promise<DbError> {
  const { error } = await supabase.rpc("archive_task", { _task_id: task.id, _user_id: userId });
  if (error) return error;
  logUserActivity(userId, "task_deleted", { entityType: "task", entityId: task.id, details: { name: task.name } });
  return null;
}
