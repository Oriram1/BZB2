import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice, invalidatePlans, periodShort } from "@/lib/billing";

type PlanRow = { id: string; name: string; amount: number | string; period_months: number; price_signature: string | null };
type HistoryRow = {
  id: number;
  plan_id: string;
  old_amount: number | string;
  new_amount: number | string;
  source: string;
  changed_at: string;
};

const MIN_AMOUNT = 0.1;
const MAX_AMOUNT = 1000;
// Original prices from the initial billing migration, independent of price history.
const ORIGINAL_PRICES: Readonly<Record<string, number | undefined>> = { quarterly: 30, annual: 100 };

const ERRORS: Record<string, string> = {
  invalid_amount: `הסכום חייב להיות בין ${MIN_AMOUNT} ל-${MAX_AMOUNT} ₪, עם עד שתי ספרות אחרי הנקודה`,
  forbidden: "אין הרשאה לשנות מחירים",
  unauthorized: "צריך להתחבר מחדש",
  signing_not_configured: "מפתח החתימה על המחירים לא הוגדר בשרת",
  update_failed: "השמירה נכשלה. נסו שוב",
};

const parseAmount = (raw: string) => {
  const value = Number(raw.trim());
  if (!raw.trim() || !Number.isFinite(value)) return null;
  if (value < MIN_AMOUNT || value > MAX_AMOUNT) return null;
  return Math.round(value * 100) / 100 === value ? value : null;
};

/**
 * Admin control for the price of each paid plan.
 *
 * The browser only sends the requested amount. The Edge Function re-checks the
 * admin role, bounds the value, signs it and writes it; billing then refuses to
 * charge a price that does not carry that signature. The table below the form
 * is the audit trail, including changes that did not come through this screen.
 */
const PlanPricing = () => {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<{ plan: PlanRow; amount: number; reset?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [plansResult, historyResult] = await Promise.all([
      supabase
        .from("billing_plans")
        .select("id, name, amount, period_months, price_signature")
        .order("amount", { ascending: true }),
      supabase
        .from("billing_plan_price_history")
        .select("id, plan_id, old_amount, new_amount, source, changed_at")
        .order("changed_at", { ascending: false })
        .limit(12),
    ]);
    const rows = (plansResult.data ?? []) as PlanRow[];
    setPlans(rows);
    setHistory((historyResult.data ?? []) as HistoryRow[]);
    setDrafts(Object.fromEntries(rows.map((row) => [row.id, formatPrice(Number(row.amount))])));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!confirm) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
      "admin-set-plan-price",
      { body: { plan_id: confirm.plan.id, amount: confirm.amount } },
    );
    setBusy(false);

    let code = data?.error;
    if (error && !code) {
      try {
        const payload = await (error as { context?: Response }).context?.json();
        code = payload?.error ?? "update_failed";
      } catch {
        code = "update_failed";
      }
    }
    if (code) {
      toast.error(ERRORS[code] ?? "השמירה נכשלה. נסו שוב");
      return;
    }
    toast.success(`המחיר של ${confirm.plan.name} עודכן ל-${formatPrice(confirm.amount)} ₪`);
    setConfirm(null);
    invalidatePlans();
    await load();
  };

  const planName = (id: string) => plans.find((plan) => plan.id === id)?.name ?? id;

  return (
    <section className="space-y-6" aria-labelledby="plan-pricing-title">
      <div>
        <h2 id="plan-pricing-title" className="text-xl font-extrabold">מחירי המנויים</h2>
        <p className="text-sm text-muted-foreground">
          המחיר שנקבע כאן הוא המחיר שמוצג באתר ושנגבה בכרטיס, בהזמנות חדשות ובחידושים הבאים.
          מנויים קיימים יחויבו במחיר החדש בחידוש הבא.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">טוען…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {plans.map((plan) => {
            const draft = drafts[plan.id] ?? "";
            const parsed = parseAmount(draft);
            const unchanged = parsed !== null && parsed === Number(plan.amount);
            const originalAmount = ORIGINAL_PRICES[plan.id];
            return (
              <div key={plan.id} className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-lg font-extrabold">{plan.name}</h3>
                  <span className="text-sm text-muted-foreground">{periodShort(plan.period_months)}</span>
                </div>
                <p className="text-sm">
                  מחיר נוכחי: <strong>{formatPrice(Number(plan.amount))} ₪</strong>
                  {!plan.price_signature && (
                    <span className="mr-2 text-destructive font-bold">· לא חתום: התשלום חסום עד לשמירה</span>
                  )}
                </p>
                <div className="flex gap-2">
                  <Input
                    inputMode="decimal"
                    dir="ltr"
                    value={draft}
                    onChange={(event) => setDrafts((current) => ({ ...current, [plan.id]: event.target.value }))}
                    aria-label={`מחיר ${plan.name} בשקלים`}
                    className="max-w-[9rem]"
                  />
                  <Button
                    disabled={busy || parsed === null || (unchanged && !!plan.price_signature)}
                    onClick={() => parsed !== null && setConfirm({ plan, amount: parsed })}
                  >
                    שמירה
                  </Button>
                </div>
                {originalAmount !== undefined && (
                  <Button
                    variant="outline"
                    className="h-auto min-h-11 whitespace-normal text-start"
                    disabled={busy || (Number(plan.amount) === originalAmount && parsed === originalAmount && !!plan.price_signature)}
                    onClick={() => {
                      if (Number(plan.amount) === originalAmount && plan.price_signature) {
                        setDrafts((current) => ({ ...current, [plan.id]: formatPrice(originalAmount) }));
                      } else {
                        setConfirm({ plan, amount: originalAmount, reset: true });
                      }
                    }}
                  >
                    איפוס למחיר המקורי ({formatPrice(originalAmount)} ₪)
                  </Button>
                )}
                {draft !== "" && parsed === null && (
                  <p className="text-xs text-destructive">
                    סכום בין {MIN_AMOUNT} ל-{MAX_AMOUNT} ₪, עד שתי ספרות אחרי הנקודה
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div>
        <h3 className="text-base font-extrabold mb-2">שינויים אחרונים</h3>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">עוד לא היו שינויי מחיר.</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card text-sm">
            {history.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 p-3">
                <span>
                  {planName(row.plan_id)}: {formatPrice(Number(row.old_amount))} ₪ ← {formatPrice(Number(row.new_amount))} ₪
                </span>
                <span className="text-xs text-muted-foreground">
                  {row.source === "admin_function" ? "אדמין" : "שינוי ישיר בבסיס הנתונים"} ·{" "}
                  {new Date(row.changed_at).toLocaleString("he-IL")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && !busy && setConfirm(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.reset ? "לאפס למחיר המקורי?" : "לשנות את מחיר המנוי?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm &&
                `המחיר של ${confirm.plan.name} ישתנה מ-${formatPrice(Number(confirm.plan.amount))} ₪ ל-${formatPrice(confirm.amount)} ₪. השינוי חל מיד על הזמנות חדשות, ועל חידושים עתידיים של מנויים קיימים.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>חזרה</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              {confirm?.reset ? "איפוס ושמירה" : "כן, לעדכן"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

export default PlanPricing;
