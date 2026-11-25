import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ShieldAlert, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchNames } from "@/lib/people";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Screening = "pending_ai" | "flagged" | "blocked";

interface ScreenTask {
  id: string;
  name: string;
  short_desc: string;
  full_desc: string | null;
  screening: Screening;
  screening_reason: string | null;
  created_at: string;
  creator_id: string;
  creator_name: string;
}

const LABEL: Record<Screening, string> = {
  pending_ai: "בבדיקה אוטומטית",
  flagged: "ממתינה לצוות",
  blocked: "נחסמה",
};

/**
 * Tasks the automatic safety screen did not approve. Flagged tasks wait for a
 * person; blocked ones are hidden but can still be released if the AI was wrong.
 */
export default function TaskScreeningPanel() {
  const [tasks, setTasks] = useState<ScreenTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [showBlocked, setShowBlocked] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const states: Screening[] = showBlocked ? ["blocked"] : ["flagged", "pending_ai"];
    const { data, error } = await supabase
      .from("tasks")
      .select("id, name, short_desc, full_desc, screening, screening_reason, created_at, creator_id")
      .in("screening", states)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      toast.error("שגיאה בטעינת בדיקות הבטיחות");
      setLoading(false);
      return;
    }
    const rows = data ?? [];
    const nameOf = await fetchNames([...new Set(rows.map((row) => row.creator_id))]);
    setTasks(rows.map((row) => ({ ...(row as unknown as ScreenTask), creator_name: nameOf.get(row.creator_id) || "משתמש" })));
    setLoading(false);
  }, [showBlocked]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (task: ScreenTask, approve: boolean) => {
    setBusy(task.id);
    const { error } = await supabase.rpc("admin_screen_task" as never, {
      _task_id: task.id,
      _approve: approve,
      _reason: approve ? null : notes[task.id]?.trim() || null,
    } as never);
    setBusy(null);
    if (error) {
      toast.error("הפעולה נכשלה");
      return;
    }
    toast.success(approve ? "המטלה אושרה בבדיקת הבטיחות" : "המטלה נחסמה");
    void load();
  };

  return (
    <Card className="p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-extrabold"><ShieldAlert size={18} /> בדיקת בטיחות מטלות</h2>
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => setShowBlocked((v) => !v)}>
          {showBlocked ? "הצג ממתינות" : "הצג חסומות"}
        </Button>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        מטלות שה-AI לא אישר. הן לא מוצגות לנערים עד שתאשרו. אישור כאן לא עוקף את אישור התשלום, אם נדרש.
      </p>

      {loading ? (
        <p className="py-8 text-center text-muted-foreground">טוען…</p>
      ) : tasks.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">{showBlocked ? "אין מטלות חסומות" : "אין מטלות שממתינות לבדיקה"}</p>
      ) : (
        <ul className="space-y-3">
          {tasks.map((task) => (
            <li key={task.id} className="rounded-2xl border border-border p-4" data-testid="screening-row">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link to={`/task/${task.id}`} className="font-extrabold hover:underline">{task.name}</Link>
                  <p className="text-sm text-muted-foreground">{task.short_desc}</p>
                  {task.full_desc && <p className="mt-1 whitespace-pre-line text-sm line-clamp-4">{task.full_desc}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {task.creator_name} · <time dateTime={task.created_at} dir="ltr">{new Date(task.created_at).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" })}</time>
                  </p>
                </div>
                <Badge variant={task.screening === "blocked" ? "destructive" : "secondary"} className="rounded-full">{LABEL[task.screening]}</Badge>
              </div>
              {task.screening_reason && (
                <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm"><span className="font-bold">סיבה: </span>{task.screening_reason}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={busy === task.id} onClick={() => decide(task, true)} className="gap-1 rounded-full font-bold">
                  <Check size={15} /> אישור
                </Button>
                {task.screening !== "blocked" && (
                  <>
                    <Input
                      value={notes[task.id] ?? ""}
                      onChange={(e) => setNotes((current) => ({ ...current, [task.id]: e.target.value }))}
                      placeholder="סיבת חסימה למפרסם (לא חובה)"
                      className="h-9 max-w-[16rem] rounded-full text-sm"
                      aria-label="סיבת חסימה"
                    />
                    <Button size="sm" variant="outline" disabled={busy === task.id} onClick={() => decide(task, false)} className="gap-1 rounded-full font-bold">
                      <X size={15} /> חסימה
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
