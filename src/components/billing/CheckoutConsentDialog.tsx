import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PAID_PLANS, type PlanId } from "@/lib/billing";

interface Props {
  open: boolean;
  plan: PlanId | null;
  busy: boolean;
  /** Paying an overdue renewal rather than buying a new plan. */
  overdue?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

/**
 * The step before any card page opens. Renewal is automatic, so the customer
 * has to see the price, the cadence and how to stop it, and tick a box, before
 * they are sent to pay. The server refuses to create a payment without this.
 */
const CheckoutConsentDialog = ({ open, plan, busy, overdue = false, onOpenChange, onConfirm }: Props) => {
  const [agreed, setAgreed] = useState(false);
  const info = plan ? PAID_PLANS[plan] : null;

  // Never carry a previous tick into the next purchase.
  useEffect(() => {
    if (!open) setAgreed(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-md rounded-3xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-extrabold">
            {overdue ? "תשלום עבור החידוש" : `מנוי ${info?.name ?? ""}`}
          </DialogTitle>
          <DialogDescription className="text-center text-base pt-1">
            {info ? `${info.price} ₪ ל${info.period}` : ""}
          </DialogDescription>
        </DialogHeader>

        <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pr-5">
          <li>המנוי מתחדש אוטומטית בסוף כל תקופה, בכרטיס שתזינו עכשיו, עד שתבטלו.</li>
          <li>שולחים תזכורת במייל ובהודעה לפני כל חיוב.</li>
          <li>אפשר לבטל בכל עת מתוך האפליקציה. המנוי נשאר פעיל עד סוף התקופה ששולמה, ולא מתבצע החזר יחסי.</li>
          <li>פרטי הכרטיס מוזנים בדף מאובטח של חברת הסליקה ולא נשמרים אצלנו.</li>
        </ul>

        <div className="flex items-start gap-3 rounded-2xl border border-border p-3">
          <Checkbox
            id="renewal-consent"
            checked={agreed}
            onCheckedChange={(value) => setAgreed(value === true)}
            className="mt-1"
          />
          <label htmlFor="renewal-consent" className="text-sm font-medium cursor-pointer">
            קראתי ואני מאשר/ת חידוש אוטומטי, ואת{" "}
            <Link to="/terms" className="underline text-primary-ink" target="_blank">
              התקנון
            </Link>
            .
          </label>
        </div>

        <DialogFooter className="flex flex-col sm:flex-col gap-2">
          <Button
            onClick={onConfirm}
            disabled={!agreed || busy}
            className="w-full py-6 text-base font-extrabold gradient-honey text-primary-foreground rounded-2xl border-none"
          >
            {busy ? <Loader2 className="animate-spin" size={18} /> : "המשך לתשלום"}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy} className="w-full rounded-2xl">
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CheckoutConsentDialog;
