import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { confirmCharge, confirmOrder, paymentFailureMessage } from "@/lib/billing";
import { TASK_DRAFT_KEY } from "@/lib/taskBilling";

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
  const chargeId = params.get("charge");
  const hint = params.get("result");
  const cardUpdateFlow = params.get("flow") === "card-update";
  const [failureReason, setFailureReason] = useState<string | undefined>();
  const [outcome, setOutcome] = useState<Outcome>("checking");

  const [chargeNote, setChargeNote] = useState<"task" | "task-review" | "card" | "trial" | "card-update" | null>(null);

  useEffect(() => {
    if (!orderId && !chargeId) {
      navigate("/subscription", { replace: true });
      return;
    }

    let cancelled = false;
    // A cancel or failure redirect rarely needs long: the webhook may still be
    // in flight for a success, so only that case is worth waiting on.
    const polls = hint === "success" ? MAX_POLLS : 2;

    const run = async () => {
      for (let attempt = 0; attempt < polls; attempt += 1) {
        // A card typed in for a task, or saved for later (and the free month).
        if (chargeId) {
          const charged = await confirmCharge(chargeId);
          if (cancelled) return;
          if (charged.ok && charged.data.status === "paid") {
            if (charged.data.cardUpdated) setChargeNote("card-update");
            else if (charged.data.trial) setChargeNote("trial");
            else if (charged.data.taskId) setChargeNote(charged.data.awaitingReview ? "task-review" : "task");
            else {
              setChargeNote("card");
              // A task form was waiting for this card: put the person back on it.
              let waiting = false;
              try {
                waiting = Boolean(sessionStorage.getItem(TASK_DRAFT_KEY));
              } catch {
                waiting = false;
              }
              if (waiting) {
                navigate("/create-task?resume=1", { replace: true });
                return;
              }
            }
            return setOutcome("paid");
          }
          if (charged.ok && charged.data.status === "failed") { setFailureReason(charged.data.failureReason); return setOutcome("failed"); }
          if (!charged.ok && charged.code !== "unknown") return setOutcome("unknown");
          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
          continue;
        }
        const result = await confirmOrder(orderId!);
        if (cancelled) return;
        if (result.ok && result.data.status === "paid") return setOutcome("paid");
        if (result.ok && result.data.status === "failed") { setFailureReason(result.data.failureReason); return setOutcome("failed"); }
        if (!result.ok && result.code !== "unknown") return setOutcome("unknown");
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
      if (!cancelled) setOutcome(hint === "cancel" ? "cancelled" : hint === "failed" ? "failed" : "unknown");
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [orderId, chargeId, hint, navigate]);

  return (
    <div className="min-h-screen bg-muted" dir="rtl">
      <PageHeader title={cardUpdateFlow ? "החלפת כרטיס" : "תשלום"} />
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-5">
        {outcome === "checking" && (
          <>
            <Loader2 className="mx-auto animate-spin text-primary-ink" size={40} aria-hidden />
            <h1 className="text-2xl font-extrabold">{cardUpdateFlow ? "מאמתים את הכרטיס…" : "מאמתים את התשלום…"}</h1>
            <p className="text-muted-foreground">זה לוקח כמה שניות. אל תסגרו את הדף.</p>
          </>
        )}

        {outcome === "paid" && (
          <>
            <CheckCircle2 className="mx-auto text-primary-ink" size={48} aria-hidden />
            <h1 className="text-2xl font-extrabold">
              {chargeNote === "card-update" ? "הכרטיס הוחלף בהצלחה" : chargeNote === "card" ? "הכרטיס נשמר 🐝" : chargeNote === "trial" ? "החודש החינם התחיל 🎁" : "התשלום התקבל, תודה! 🐝"}
            </h1>
            <p className="text-muted-foreground">
              {chargeNote === "card-update"
                ? "לא חויבתם. הכרטיס החדש נשמר לחיובים עתידיים. נשלח אישור במייל. מצב המנוי ומועד החידוש לא השתנו."
                : chargeNote === "task"
                ? "המטלה שולמה ועולה לאפליקציה."
                : chargeNote === "task-review"
                ? "התשלום התקבל. המטלה תעלה לאפליקציה אחרי שנאשר אותה. אם לא תאושר, הכסף יוחזר במלואו."
                : chargeNote === "card"
                  ? "לא חויבתם. הכרטיס ישמש רק אחרי שנאשר מטלה בתשלום."
                  : chargeNote === "trial"
                    ? "הכרטיס יחויב רק בסוף החודש, ואפשר לבטל עד אז."
                    : "המנוי פעיל. שלחנו אישור במייל."}
            </p>
            <Button asChild className="gradient-honey text-primary-foreground border-none rounded-2xl font-extrabold">
              <Link to={chargeNote === "task" || chargeNote === "task-review" ? "/my-tasks?tab=published" : "/subscription"}>
                {chargeNote === "task" || chargeNote === "task-review" ? "למטלות שלי" : "למנוי שלי"}
              </Link>
            </Button>
          </>
        )}

        {(outcome === "failed" || outcome === "cancelled") && (
          <>
            <CircleAlert className="mx-auto text-destructive" size={48} aria-hidden />
            <h1 className="text-2xl font-extrabold">
              {cardUpdateFlow ? "החלפת הכרטיס לא הושלמה" : outcome === "cancelled" ? "התשלום בוטל" : "התשלום לא הושלם"}
            </h1>
            <p className="text-muted-foreground">{outcome === "cancelled" ? "הפעולה בוטלה. אפשר לחזור ולנסות שוב." : paymentFailureMessage(failureReason)}</p>
            <Button asChild className="rounded-2xl font-extrabold">
              <Link to={cardUpdateFlow ? "/subscription" : "/pricing"}>{cardUpdateFlow ? "חזרה למנוי שלי" : "חזרה למסלולים"}</Link>
            </Button>
          </>
        )}

        {outcome === "unknown" && (
          <>
            <CircleAlert className="mx-auto text-muted-foreground" size={48} aria-hidden />
            <h1 className="text-2xl font-extrabold">עדיין לא קיבלנו אישור</h1>
            <p className="text-muted-foreground">
              {cardUpdateFlow
                ? "עדיין אין אישור להחלפת הכרטיס. אפשר לבדוק את פרטי הכרטיס במסך המנוי."
                : "אם חויבתם, המנוי יופיע תוך דקות ספורות ותקבלו הודעה. אפשר לבדוק את מצב המנוי בדף שלו."}
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
