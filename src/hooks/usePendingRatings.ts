import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { reviewWindowOpen } from "@/lib/reviewWindow";
import { useAuth } from "@/contexts/AuthContext";

export interface PendingRating { taskId: string; taskName: string; revieweeId: string; revieweeName: string }

/** Completed tasks where the user worked with someone and has not rated them yet. */
export function usePendingRatings() {
  const { user } = useAuth();
  const [items, setItems] = useState<PendingRating[]>([]);

  const load = useCallback(async () => {
    if (!user) { setItems([]); return; }
    const { data: convs } = await supabase.from("conversations")
      .select("task_id, participant_1, participant_2")
      .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
      .not("task_id", "is", null);
    if (!convs?.length) { setItems([]); return; }
    const taskIds = [...new Set(convs.map((c) => c.task_id as string))];
    const [{ data: tasks }, { data: reviews }] = await Promise.all([
      supabase.from("tasks").select("id, name, review_window_started_at").in("id", taskIds).eq("status", "completed").is("archived_at", null),
      supabase.from("reviews").select("task_id, reviewee_id").eq("reviewer_id", user.id).in("task_id", taskIds),
    ]);
    const names = new Map((tasks ?? []).filter((t) => reviewWindowOpen(t.review_window_started_at)).map((t) => [t.id, t.name]));
    const done = new Set((reviews ?? []).map((r) => `${r.task_id}:${r.reviewee_id}`));
    const pending = convs
      .filter((c) => names.has(c.task_id as string))
      .map((c) => ({ taskId: c.task_id as string, revieweeId: c.participant_1 === user.id ? c.participant_2 : c.participant_1 }))
      .filter((p) => !done.has(`${p.taskId}:${p.revieweeId}`));
    if (!pending.length) { setItems([]); return; }
    const { data: profiles } = await supabase.from("profiles")
      .select("user_id, first_name, last_name").in("user_id", [...new Set(pending.map((p) => p.revieweeId))]);
    const who = new Map((profiles ?? []).map((p) => [p.user_id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()]));
    setItems(pending.map((p) => ({ ...p, taskName: names.get(p.taskId) ?? "", revieweeName: who.get(p.revieweeId) || "משתמש" })));
  }, [user]);

  useEffect(() => { void load(); }, [load]);
  return { items, reload: load };
}
