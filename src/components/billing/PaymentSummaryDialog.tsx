import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/format";

interface Props {
  open: boolean;
  title: string;
  amount: number;
  description: string;
  savesCard: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export default function PaymentSummaryDialog({ open, title, amount, description, savesCard, busy, onOpenChange, onConfirm }: Props) {
  return <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
    <DialogContent className="max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl" dir="rtl">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <dl className="space-y-3 rounded-2xl bg-muted p-4 text-sm">
        <div className="flex justify-between gap-3"><dt>סה״כ לתשלום עכשיו</dt><dd className="font-bold">{formatCurrency(amount)}</dd></div>
        <div><dt className="font-bold">שמירת הכרטיס</dt><dd>{savesCard ? "הכרטיס יישמר אצל חברת הסליקה לחיובים עתידיים." : "הכרטיס לא יישמר. זהו תשלום חד-פעמי."}</dd></div>
      </dl>
      <p className="text-xs text-muted-foreground">דף Cardcom ייפתח בכרטיסייה נפרדת. המסך הזה יישאר פתוח.</p>
      <DialogFooter className="gap-2">
        <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>חזרה</Button>
        <Button disabled={busy} onClick={onConfirm}>{busy ? "פותחים דף מאובטח..." : "פתיחת דף מאובטח"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
