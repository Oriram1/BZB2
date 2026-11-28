import { supabase } from "@/integrations/supabase/client";

/** Older deployments lack this command until the accompanying migration is applied. */
export async function loadPausedTaskIds(ids: string[]): Promise<{ supported: boolean; ids: string[] }> {
  const { data, error } = await supabase.rpc("visible_paused_task_ids", { _task_ids: ids });
  if (error?.code === "PGRST202") return { supported: false, ids: [] };
  if (error) throw error;
  if (!data) throw new Error("paused_task_ids_missing");
  return { supported: true, ids: data };
}
