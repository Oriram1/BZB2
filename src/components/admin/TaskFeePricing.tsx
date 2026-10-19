import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/billing";
import { invalidateTaskFees } from "@/lib/taskFees";

type FeeKey = "task_fee" | "insurance_fee";
type Fees = { task_fee: number; insurance_fee: number; defaults: Record<FeeKey, number> };

const FEES: { key: FeeKey; title: string; hint: string }[] = [
  { key: "task_fee", title: "עמלת פרסום למטלה", hint: "נגבית על כל מטלה מחשבון בלי מנוי, אחרי המטלה החינמית הראשונה." },
  { key: "insurance_fee", title: "ביטוח מטלות", hint: "תוספת אופציונלית למטלה, לכל סוגי החשבונות." },
];

const MAX_AMOUNT = 1000;

const parseAmount = (raw: string) => {
  const value = Number(raw.trim());
  if (!raw.trim() || !Number.isFinite(value) || value < 0 || value > MAX_AMOUNT) return null;
  return Math.round(value * 100) / 100 === value ? value : null;
};

/** Admin control for the per-task fee and the insurance fee, with reset to default. */
const TaskFeePricing = () => {
  const [fees, setFees] = useState<Fees | null>(null);
  const [drafts, setDrafts] = useState<Record<FeeKey, string>>({ task_fee: "", insurance_fee: "" });
  const [busy, setBusy] = useState<FeeKey | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_get_task_fees");
    if (error || !data) {
      toast.error("לא הצלחנו לטעון את העמלות");
      return;
    }
    const next = data as unknown as Fees;
    setFees(next);
    setDrafts({ task_fee: formatPrice(next.task_fee), insurance_fee: formatPrice(next.insurance_fee) });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (key: FeeKey, amount: number | null) => {
    setBusy(key);
    const { error } = await supabase.rpc("admin_set_task_fee", { _key: key, _amount: amount as number });
    setBusy(null);
    if (error) {
      toast.error(error.message.includes("invalid_amount") ? `הסכום חייב להיות בין 0 ל-${MAX_AMOUNT} ₪, עם עד שתי ספרות אחרי הנקודה` : "השמירה נכשלה. נסו שוב");
      return;
    }
    toast.success(amount === null ? "העמלה אופסה לברירת המחדל" : "העמלה עודכנה");
    invalidateTaskFees();
    await load();
  };

  if (!fees) return <p className="text-sm text-muted-foreground">טוען…</p>;

  return (
    <section className="space-y-4" aria-labelledby="task-fee-title">
      <div>
        <h2 id="task-fee-title" className="text-xl font-extrabold">עמלות מטלות</h2>
        <p className="text-sm text-muted-foreground">
          השינוי חל מיד על כל מטלה חדשה. מטלות שכבר נשלחו לאישור נשארות במחיר שנקבע להן.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {FEES.map(({ key, title, hint }) => {
          const parsed = parseAmount(drafts[key]);
          const current = fees[key];
          const def = fees.defaults[key];
          return (
            <div key={key} className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <h3 className="text-lg font-extrabold">{title}</h3>
              <p className="text-xs text-muted-foreground">{hint}</p>
              <p className="text-sm">מחיר נוכחי: <strong>{formatPrice(current)} ₪</strong></p>
              <div className="flex gap-2">
                <Input
                  inputMode="decimal"
                  dir="ltr"
                  value={drafts[key]}
                  onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                  aria-label={`${title} בשקלים`}
                  className="max-w-[9rem]"
                />
                <Button disabled={busy !== null || parsed === null || parsed === current} onClick={() => parsed !== null && void save(key, parsed)}>
                  שמירה
                </Button>
              </div>
              <Button variant="outline" disabled={busy !== null || current === def} onClick={() => void save(key, null)}>
                איפוס לברירת המחדל ({formatPrice(def)} ₪)
              </Button>
              {drafts[key] !== "" && parsed === null && (
                <p className="text-xs text-destructive">סכום בין 0 ל-{MAX_AMOUNT} ₪, עד שתי ספרות אחרי הנקודה</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default TaskFeePricing;
