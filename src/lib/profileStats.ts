import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "@/lib/fetchAllPages";

export interface BeeStats {
  applied: number;
  accepted: number;
  completed: number;
  totalEarnings: number;
  estimatedEarnings: boolean;
  missingHours: boolean;
}

export async function loadBeeStats(userId: string): Promise<BeeStats> {
  // Archiving hides work from active lists, but must not erase lifetime totals.
  const { data: applications, error } = await fetchAllPages((from, to) => supabase
    .from("task_applications")
    .select("id, status, task_id, tasks(status, payment, payment_type, duration_hours)")
    .eq("applicant_id", userId)
    .order("id")
    .range(from, to));
  if (error) throw error;

  const accepted = applications.filter((application) => application.status === "accepted");
  if (accepted.some((application) => !application.tasks)) {
    throw new Error("accepted_task_not_readable");
  }
  const completedTasks = new Map(accepted
    .filter((application) => application.tasks?.status === "completed")
    .map((application) => [application.task_id, application.tasks!]));
  let totalEarnings = 0;
  let estimatedEarnings = false;
  let missingHours = false;
  for (const task of completedTasks.values()) {
    if (task.payment_type === "hour") {
      // No actual-hours ledger exists. Do not present an hourly rate as a total.
      if (task.duration_hours === null || task.duration_hours <= 0) {
        missingHours = true;
        continue;
      }
      estimatedEarnings = true;
      totalEarnings += Number(task.payment) * task.duration_hours;
    } else {
      totalEarnings += Number(task.payment);
    }
  }
  return {
    applied: applications.length,
    accepted: accepted.length,
    completed: completedTasks.size,
    totalEarnings,
    estimatedEarnings,
    missingHours,
  };
}

export async function loadPublishedTaskCounts(userId: string) {
  const { data: tasks, error } = await fetchAllPages((from, to) => supabase
    .from("tasks")
    .select("status, archived_at")
    .eq("creator_id", userId)
    .order("id")
    .range(from, to));
  if (error) throw error;
  return {
    total: tasks.length,
    open: tasks.filter((task) => task.status === "open" && task.archived_at === null).length,
    inProgress: tasks.filter((task) => task.status === "in_progress" && task.archived_at === null).length,
    completed: tasks.filter((task) => task.status === "completed").length,
    cancelled: tasks.filter((task) => task.status === "cancelled").length,
  };
}
