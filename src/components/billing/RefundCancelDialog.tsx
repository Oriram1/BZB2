import { useEffect, useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  billingErrorMessage,
  confirmRefundCancellation,
  previewRefundCancellation,
  type CancelPreview,
} from "@/lib/billing";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
};

/**
 * Cancelling within 14 days of paying, with a refund.
 *
 * Before the refund the person decides about every task they have: drop it, or
 * keep it. Kept tasks cost the task fee each (the first task ever stays free),
 * and a task a worker already took cannot be dropped. The difference is charged
 * first, and only then is the refund made.
 */
export default function RefundCancelDialog({ open, onOpenChange, onDone }: Props) {
  const [preview, setPreview] = useState<CancelPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dropped, setDropped] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    void previewRefundCancellation().then((result) => {
      if (!active) return;
      setLoading(false);
      if (!result.ok) {
        toast.error(billingErrorMessage(result.code));
        onOpenChange(false);
        return;
      }
      setPreview(result.data);
      // Start from "drop what can be dropped", the cheapest outcome.
      setDropped(new Set(result.data.tasks.filter((task) => !task.locked && !task.is_first).map((task) => task.id)));
    });
    return () => {
      active = false;
    };
  }, [open, onOpenChange]);

  const difference = useMemo(() => {
    if (!preview) return 0;
    const kept = preview.tasks.filter((task) => !dropped.has(task.id) && !task.is_first);
    return Math.round(kept.length * preview.task_fee * 100) / 100;
  }, [preview, dropped]);

  const toggle = (id: string, drop: boolean) =>
    setDropped((current) => {
      const next = new Set(current);
      if (drop) next.add(id);
      else next.delete(id);
      return next;
    });

  const confirm = async () => {
    setBusy(true);
    const result = await confirmRefundCancellation([...dropped]);
    setBusy(false);
    if (!result.ok) {
      toast.error(billingErrorMessage(result.code));
      return;
    }
    toast.success("המנוי בוטל והסכום יוחזר לכרטיס");
    onOpenChange(false);
    onDone();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>ביטול מנוי עם החזר</AlertDialogTitle>
          <AlertDialogDescription>
            בתוך 14 יום מהתשלום אפשר לבטל ולקבל את הכסף בחזרה. ההחזר הזה אפשרי פעם אחת בלבד, ומנוי נוסף שתקנו יהיה עד הסוף.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {loading || !preview ? (
          <p className="py-6 text-center text-sm text-muted-foreground">בודקים…</p>
        ) : (
          <div className="space-y-4 text-sm">
            <p>
              סכום להחזר: <strong>{Number(preview.refund_amount).toLocaleString("he-IL")} ₪</strong>
            </p>

            {preview.tasks.length > 0 && (
              <div className="space-y-2">
                <p className="font-bold">מה לעשות עם המטלות שלכם?</p>
                <p className="text-muted-foreground">
                  כל מטלה שנשארת עולה {preview.task_fee} ₪, חוץ מהמטלה הראשונה שלכם שנשארת חינם. מטלה שמבצע כבר קיבל אי אפשר למחוק.
                </p>
                <ul className="divide-y divide-border rounded-2xl border border-border">
                  {preview.tasks.map((task) => (
                    <li key={task.id} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="truncate font-bold">{task.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {task.is_first ? "המטלה הראשונה, נשארת חינם" : task.locked ? "כבר התקבלה, נשארת וחויבת" : `נשארת ב־${preview.task_fee} ₪`}
                        </p>
                      </div>
                      {!task.is_first && !task.locked && (
                        <label className="flex shrink-0 items-center gap-2 text-sm font-bold">
                          <Checkbox
                            checked={dropped.has(task.id)}
                            onCheckedChange={(value) => toggle(task.id, value === true)}
                          />
                          למחוק
                        </label>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="rounded-2xl bg-muted p-3">
              {difference > 0
                ? `לפני ההחזר נחייב ${difference.toLocaleString("he-IL")} ₪ על המטלות שנשארות, ואז נחזיר את סכום המנוי.`
                : "אין חיוב על מטלות, והסכום יוחזר במלואו."}
            </p>
          </div>
        )}

        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel disabled={busy}>חזרה</AlertDialogCancel>
          <Button onClick={confirm} disabled={busy || loading || !preview} className="rounded-2xl font-bold">
            {busy ? "מבטלים…" : "ביטול והחזר"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
