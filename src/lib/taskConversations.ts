import { supabase } from "@/integrations/supabase/client";

export async function ensureAcceptedTaskConversation(taskId: string, applicantId: string) {
  const { data: task, error: taskError } = await supabase.from("tasks")
    .select("status, archived_at").eq("id", taskId).maybeSingle();
  if (taskError) throw taskError;
  if (!task || task.status === "completed" || task.status === "cancelled" || task.archived_at) {
    throw new Error("task_closed");
  }
  const { data, error } = await supabase.rpc("ensure_accepted_task_conversation", {
    _task_id: taskId,
    _applicant_id: applicantId,
  });

  if (error || !data) {
    throw error ?? new Error("conversation_not_created");
  }

  return data;
}
