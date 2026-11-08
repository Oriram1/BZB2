export const TASK_STATUS_LABELS: Record<string, string> = {
  open: "פתוחה להצעות",
  accepted: "התקבלה",
  in_progress: "בביצוע",
  completed: "הושלמה",
  cancelled: "בוטלה",
};

/** True once a task can no longer take applications or messages. */
export const isTaskClosed = (task: { status: string; archived_at: string | null }) =>
  task.status === "completed" || task.status === "cancelled" || task.archived_at !== null;

export const taskStatusLabel = (status: string) => TASK_STATUS_LABELS[status] ?? status;
