export const TASK_STATUS_LABELS: Record<string, string> = {
  open: "פתוחה להצעות",
  accepted: "התקבלה",
  in_progress: "בביצוע",
  completed: "הושלמה",
  cancelled: "בוטלה",
};

export const taskStatusLabel = (status: string) => TASK_STATUS_LABELS[status] ?? status;
