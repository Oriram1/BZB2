import { useCallback, useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { billingErrorText, publishStateLabel, reviewTask, type TaskPublishState } from "@/lib/taskBilling";

interface QueueTask {
  id: string;
  name: string;
  short_desc: string;
  payment: number;
  payment_due: number;
  payment_mode: string;
  charged_at: string | null;
  insurance: boolean;
  uses_free_slot: boolean;
  publish_state: TaskPublishState;
  created_at: string;
  creator_id: string;
  creator_name: string;
}

/**
 * The task review queue. A task waits here until an admin decides; approving a
 * paid task charges the owner's saved card right then, and the task goes live
 * only if that charge passes. A task whose charge failed stays visible with a
 * clear marker, so nobody wonders why an approved task is not live.
 */
export default function TaskReviewPanel() {
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tasks")
      .select("id, name, short_desc, payment, payment_due, insurance, uses_free_slot, publish_state, created_at, creator_id, payment_mode, charged_at")
      .in("publish_state", ["pending_review", "awaiting_charge", "pending_payment"])
      .order("created_at", { ascending: true });
    if (error) {
      toast.error("שגיאה בטעינת המשימות לאישור");
      setLoading(false);
      return;
    }
    const rows = data ?? [];
    const ids = [...new Set(rows.map((row) => row.creator_id))];
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("user_id, first_name, last_name").in("user_id", ids)
      : { data: [] };
    const nameOf = new Map((profiles ?? []).map((p) => [p.user_id, `${p.first_name} ${p.last_name}`.trim()]));
    setTasks(
      rows.map((row) => ({
        ...(row as unknown as QueueTask),
        creator_name: nameOf.get(row.creator_id) || "משתמש",
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (task: QueueTask, approve: boolean) => {
    setBusy(task.id);
    const result = await reviewTask(task.id, approve, approve ? undefined : notes[task.id]);
    setBusy(null);
    if (!result.ok) {
      toast.error(billingErrorText(result.code));
      return;
    }
    if (!approve) toast.success(task.charged_at ? "המשימה נדחתה. נפתחה בקשת החזר אוטומטי" : "המשימה נדחתה. לא חויבו");
    else if (result.data.state === "live") toast.success("המשימה אושרה ופורסמה");
    else toast.error("המשימה אושרה אבל החיוב לא עבר. היא ממתינה לתשלום");
    void load();
  };

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-lg font-extrabold">משימות לאישור</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        מטלה ששולמה מראש תפורסם באישור ללא חיוב נוסף. הכרטיס השמור יחויב רק אם המפרסם בחר בו. דחיית מטלה ששולמה מראש יוצרת בקשת החזר אוטומטי.
      </p>

      {loading ? (
        <p className="py-8 text-center text-muted-foreground">טוען…</p>
      ) : tasks.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">אין משימות שממתינות</p>
      ) : (
        <ul className="space-y-3">
          {tasks.map((task) => {
            const waitingPayment = task.publish_state !== "pending_review";
            return (
              <li key={task.id} className="rounded-2xl border border-border p-4" data-testid="review-row">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-extrabold">{task.name}</p>
                    <p className="text-sm text-muted-foreground">{task.short_desc}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {task.creator_name} · תשלום למבצע {task.payment} ₪
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={waitingPayment ? "destructive" : "secondary"} className="rounded-full">
                      {waitingPayment ? "ממתינה לתשלום" : publishStateLabel[task.publish_state]}
                    </Badge>
                    <span className="text-xs font-bold">
                      {Number(task.payment_due) > 0
                        ? `${task.charged_at ? "שולם מראש" : task.payment_mode === "one_time" ? "לתשלום חד-פעמי" : "לחיוב בכרטיס השמור"}: ${Number(task.payment_due)} ₪${task.insurance ? " (כולל ביטוח)" : ""}`
                        : task.uses_free_slot
                          ? "המטלה החינמית"
                          : "ללא חיוב"}
                    </span>
                  </div>
                </div>

                {waitingPayment ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    אושרה, ממתינה שהמפרסם ישלם. לא צריך לעשות כלום.
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      disabled={busy === task.id}
                      onClick={() => decide(task, true)}
                      className="rounded-full font-bold gap-1"
                    >
                      <Check size={15} /> אישור
                    </Button>
                    <Input
                      value={notes[task.id] ?? ""}
                      onChange={(e) => setNotes((current) => ({ ...current, [task.id]: e.target.value }))}
                      placeholder="הערה בדחייה (לא חובה)"
                      className="h-9 max-w-[16rem] rounded-full text-sm"
                      aria-label="הערה בדחייה"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === task.id}
                      onClick={() => decide(task, false)}
                      className="rounded-full font-bold gap-1"
                    >
                      <X size={15} /> דחייה
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
