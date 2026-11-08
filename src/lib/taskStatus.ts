import type { Database } from "@/integrations/supabase/types";

/** The task_status enum, so a screen cannot invent a state the database rejects. */
export type TaskStatus = Database["public"]["Enums"]["task_status"];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  open: "פתוחה להצעות",
  accepted: "התקבלה",
  in_progress: "בביצוע",
  completed: "הושלמה",
  cancelled: "בוטלה",
};

export const taskStatusLabel = (status: string) =>
  (TASK_STATUS_LABELS as Record<string, string>)[status] ?? status;

/** Completed and cancelled are both terminal: a completed task already credited its worker. */
export const isTaskDone = (status: string) => status === "completed" || status === "cancelled";

/** True once a task can no longer take applications or messages. */
export const isTaskClosed = (task: { status: string; archived_at: string | null }) =>
  isTaskDone(task.status) || task.archived_at !== null;
