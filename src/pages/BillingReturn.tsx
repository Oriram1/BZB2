import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { confirmOrder } from "@/lib/billing";

type Outcome = "checking" | "paid" | "failed" | "cancelled" | "unknown";

const POLL_MS = 2_000;
const MAX_POLLS = 8;

/**
 * Where Cardcom sends the customer after the card page.
 *
 * The `result` in the address is only a hint about which button they pressed —
 * anyone can type it. The truth comes from the server, which asks Cardcom, so
 * a page reading "success" without a paid order never shows a success.
 */
const BillingReturn = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const orderId = params.get("order");
  const hint = params.get("result");
  const [outcome, setOutcome] = useState<Outcome>("checking");

  useEffect(() => {
    if (!orderId) {
      navigate("/subscription", { replace: true });
      return;
    }

    let cancelled = false;
    // A cancel or failure redirect rarely needs long: the webhook may still be
    // in flight for a success, so only that case is worth waiting on.
    const polls = hint === "success" ? MAX_POLLS : 2;

    const run = async () => {
      for (let attempt = 0; attempt < polls; attempt += 1) {
        const result = await confirmOrder(orderId);
        if (cancelled) return;
        if (result.ok && result.data.status === "paid") return setOutcome("paid");
        if (result.ok && result.data.status === "failed") return setOutcome("failed");
        if (!result.ok && result.code !== "unknown") return setOutcome("unknown");
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
      if (!cancelled) setOutcome(hint === "cancel" ? "cancelled" : hint === "failed" ? "failed" : "unknown");
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [orderId, hint, navigate]);

  return (
    <div className="min-h-screen bg-muted" dir="rtl">
      <PageHeader title="תשלום" />
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-5">
        {outcome === "checking" && (
          <>
            <Loader2 className="mx-auto animate-spin text-primary-ink" size={40} aria-hidden />
            <h1 className="text-2xl font-extrabold">מאמתים את התשלום…</h1>
            <p className="text-muted-foreground">זה לוקח כמה שניות. אל תסגרו את הדף.</p>
          </>
        )}

        {outcome === "paid" && (
          <>
            <CheckCircle2 className="mx-auto text-primary-ink" size={48} aria-hidden />
            <h1 className="text-2xl font-extrabold">התשלום התקבל, תודה! 🐝</h1>
            <p className="text-muted-foreground">המנוי פעיל. שלחנו אישור במייל.</p>
            <Button asChild className="gradient-honey text-primary-foreground border-none rounded-2xl font-extrabold">
              <Link to="/subscription">למנוי שלי</Link>
            </Button>
          </>
        )}

        {(outcome === "failed" || outcome === "cancelled") && (
          <>
            <CircleAlert className="mx-auto text-destructive" size={48} aria-hidden />
            <h1 className="text-2xl font-extrabold">
              {outcome === "cancelled" ? "התשלום בוטל" : "התשלום לא הושלם"}
            </h1>
            <p className="text-muted-foreground">לא חויבתם. אפשר לנסות שוב בכל עת.</p>
            <Button asChild className="rounded-2xl font-extrabold">
              <Link to="/pricing">חזרה למסלולים</Link>
            </Button>
          </>
        )}

        {outcome === "unknown" && (
          <>
            <CircleAlert className="mx-auto text-muted-foreground" size={48} aria-hidden />
            <h1 className="text-2xl font-extrabold">עדיין לא קיבלנו אישור</h1>
            <p className="text-muted-foreground">
              אם חויבתם, המנוי יופיע תוך דקות ספורות ותקבלו הודעה. אפשר לבדוק את מצב המנוי בדף שלו.
            </p>
            <Button asChild className="rounded-2xl font-extrabold">
              <Link to="/subscription">למנוי שלי</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default BillingReturn;
