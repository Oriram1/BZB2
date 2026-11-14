import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fetchAllPages } from "@/lib/fetchAllPages";

/** The tasks the signed-in person saved, with an optimistic toggle. */
export function useSavedTasks() {
  const { user } = useAuth();
  const [saved, setSaved] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setSaved(new Set());
      return;
    }
    let active = true;
    void fetchAllPages((from, to) => supabase
      .from("saved_tasks").select("task_id").eq("user_id", user.id).order("created_at").range(from, to))
      .then(({ data }) => {
        if (active) setSaved(new Set((data ?? []).map((row) => row.task_id)));
      });
    return () => {
      active = false;
    };
  }, [user]);

  /** Undo of an unsave: put the task back without reading stale state. */
  const restore = useCallback(async (taskId: string) => {
    setSaved((prev) => new Set(prev).add(taskId));
    const { error } = await supabase.from("saved_tasks").insert({ task_id: taskId });
    if (error) {
      setSaved((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
      toast.error("לא הצלחנו להחזיר את השמירה. כדאי לנסות שוב");
    }
  }, []);

  const toggle = useCallback(async (taskId: string) => {
    if (!user) {
      toast.error("יש להתחבר כדי לשמור מטלות");
      return;
    }
    const wasSaved = saved.has(taskId);
    const apply = (on: boolean) => setSaved((prev) => {
      const next = new Set(prev);
      if (on) next.add(taskId); else next.delete(taskId);
      return next;
    });
    apply(!wasSaved);
    if (wasSaved) toast("המטלה הוסרה מהשמורות", { duration: 6000, action: { label: "ביטול", onClick: () => { void restore(taskId); } } });
    const { error } = wasSaved
      ? await supabase.from("saved_tasks").delete().eq("user_id", user.id).eq("task_id", taskId)
      : await supabase.from("saved_tasks").insert({ task_id: taskId });
    if (error) {
      apply(wasSaved);
      toast.error("לא הצלחנו לעדכן את השמירה. כדאי לנסות שוב");
    }
  }, [user, saved, restore]);

  return { saved, toggle };
}
