import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CreditCard, Receipt } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import CheckoutConsentDialog from "@/components/billing/CheckoutConsentDialog";
import RefundCancelDialog from "@/components/billing/RefundCancelDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import {
  billingErrorMessage,
  cancelSubscription,
  changePlan,
  previewRefundCancellation,
  formatDate,
  graceEnd,
  isPaidPlan,
  formatPrice,
  usePlans,
  resumeSubscription,
  startCheckout,
} from "@/lib/billing";
import { toast } from "sonner";

type OrderRow = {
  id: string;
  amount: number;
  status: "pending" | "paid" | "failed" | "refunded";
  kind: "initial" | "renewal";
  paid_at: string | null;
  created_at: string;
  document_url: string | null;
};

const ORDER_STATUS: Record<OrderRow["status"], string> = {
  pending: "בתהליך",
  paid: "שולם",
  failed: "נכשל",
  refunded: "זוכה",
};

const Subscription = () => {
  const { user } = useAuth();
  const { subscription, loading, failed, reload } = useSubscription();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [canRefund, setCanRefund] = useState(false);
  const [switchTo, setSwitchTo] = useState<"quarterly" | "annual" | null>(null);

  // Whether the 14-day cancellation applies decides which button is shown.
  const subscriptionStatus = subscription?.status;
  const subscriptionEnd = subscription?.current_period_end;
  useEffect(() => {
    if (subscriptionStatus !== "active") {
      setCanRefund(false);
      return;
    }
    let active = true;
    void previewRefundCancellation().then((result) => {
      if (active) setCanRefund(result.ok);
    });
    return () => {
      active = false;
    };
  }, [subscriptionStatus, subscriptionEnd]);

  useEffect(() => {
    if (!user) return;
    void supabase
      .from("payment_orders")
      .select("id, amount, status, kind, paid_at, created_at, document_url")
      .eq("user_id", user.id)
      .in("status", ["paid", "refunded"])
      .order("created_at", { ascending: false })
      .limit(24)
      .then(({ data }) => setOrders((data ?? []) as OrderRow[]));
  }, [user, subscription?.current_period_end]);

  const { plans } = usePlans();
  const plan = subscription && isPaidPlan(subscription.plan_id) ? plans[subscription.plan_id] ?? null : null;

  const cancel = async () => {
    setBusy(true);
    const result = await cancelSubscription();
    setBusy(false);
    setConfirmCancel(false);
    if (!result.ok) {
      toast.error(billingErrorMessage(result.code));
      return;
    }
    toast.success("המנוי בוטל ולא יתחדש");
    await reload();
  };

  const resume = async () => {
    setBusy(true);
    const result = await resumeSubscription();
    setBusy(false);
    if (!result.ok) {
      toast.error(billingErrorMessage(result.code));
      return;
    }
    toast.success("המנוי ימשיך להתחדש");
    await reload();
  };

  const switchPlan = async () => {
    if (!switchTo) return;
    setBusy(true);
    const result = await changePlan(switchTo);
    setBusy(false);
    setSwitchTo(null);
    if (!result.ok) {
      toast.error(billingErrorMessage(result.code));
      return;
    }
    toast.success(
      result.data.status === "scheduled"
        ? "המעבר ייכנס לתוקף בסוף התקופה הנוכחית"
        : result.data.status === "schedule_cleared"
          ? "המעבר המתוכנן בוטל"
          : "המסלול עודכן",
    );
    await reload();
  };

  const payOverdue = async () => {
    setBusy(true);
    const result = await startCheckout(null);
    if (!result.ok) {
      setBusy(false);
      toast.error(billingErrorMessage(result.code));
      return;
    }
    // Leaves the app for the hosted card page; busy stays on until it does.
    window.location.assign(result.data.url);
  };

  return (
    <div className="min-h-screen bg-muted" dir="rtl">
      <PageHeader title="המנוי שלי" titleIsPageHeading icon={<CreditCard size={18} />} />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {loading ? (
          <Skeleton className="h-48 w-full rounded-2xl" aria-busy="true" />
        ) : failed ? (
          <Card className="border-border">
            <CardContent className="p-6 text-sm text-muted-foreground">
              לא הצלחנו לטעון את פרטי המנוי. נסו לרענן את הדף.
            </CardContent>
          </Card>
        ) : !subscription ? (
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-lg">אין מנוי פעיל</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>אתם במסלול החינמי. מנוי מבטל את העמלה על משימות.</p>
              <Button asChild className="gradient-honey text-primary-foreground border-none rounded-2xl font-extrabold">
                <Link to="/pricing">למסלולים</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center justify-between gap-2">
                <span>מנוי {plan?.name ?? subscription.plan_id}</span>
                {subscription.status === "active" && !subscription.cancel_at_period_end && <Badge>פעיל</Badge>}
                {subscription.status === "active" && subscription.cancel_at_period_end && (
                  <Badge variant="secondary">לא יתחדש</Badge>
                )}
                {subscription.status === "past_due" && <Badge variant="destructive">החיוב נכשל</Badge>}
                {subscription.status === "canceled" && <Badge variant="secondary">בוטל</Badge>}
                {subscription.status === "expired" && <Badge variant="secondary">הסתיים</Badge>}
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4 text-sm">
              {subscription.status === "active" && subscription.is_trial && (
                <p className="rounded-2xl bg-primary/10 p-3 font-bold text-primary-ink">
                  החודש החינם שלכם פעיל עד {formatDate(subscription.current_period_end)}.
                  {plan ? ` אחריו הכרטיס יחויב ב־${formatPrice(plan.price)} ₪, ואפשר לבטל עד אז.` : ""}
                </p>
              )}

              {subscription.status === "active" && subscription.pending_plan_id && (
                <p className="text-muted-foreground">
                  בסוף התקופה תעברו למסלול {plans[subscription.pending_plan_id as "quarterly" | "annual"]?.name ?? subscription.pending_plan_id}.
                </p>
              )}

              {subscription.status === "active" && (
                <p className="text-muted-foreground">
                  {subscription.cancel_at_period_end
                    ? `המנוי פעיל עד ${formatDate(subscription.current_period_end)} ולא יתחדש.`
                    : `המנוי מתחדש ב־${formatDate(subscription.current_period_end)}${plan ? ` בסך ${formatPrice(plan.price)} ₪` : ""}.`}
                </p>
              )}

              {subscription.status === "past_due" && (
                <div className="rounded-2xl bg-destructive/10 border border-destructive/30 p-4 space-y-2">
                  <p className="font-bold flex items-center gap-1.5">
                    <AlertTriangle size={16} />
                    לא הצלחנו לחייב את הכרטיס
                  </p>
                  <p className="text-muted-foreground">
                    המנוי ממשיך לפעול עד {formatDate(graceEnd(subscription.current_period_end))}.
                    {subscription.next_attempt_at &&
                      ` ננסה שוב ב־${formatDate(subscription.next_attempt_at)}, או שאפשר לשלם עכשיו בכרטיס אחר.`}
                  </p>
                  <Button
                    onClick={() => setPayOpen(true)}
                    disabled={busy}
                    className="gradient-honey text-primary-foreground border-none rounded-2xl font-extrabold"
                  >
                    לתשלום ועדכון כרטיס
                  </Button>
                </div>
              )}

              {(subscription.status === "canceled" || subscription.status === "expired") && (
                <div className="space-y-3 text-muted-foreground">
                  <p>המנוי הסתיים. החשבון נשאר פעיל במסלול החינמי.</p>
                  <Button asChild className="gradient-honey text-primary-foreground border-none rounded-2xl font-extrabold">
                    <Link to="/pricing">לחידוש המנוי</Link>
                  </Button>
                </div>
              )}

              {subscription.card_last4 && (subscription.status === "active" || subscription.status === "past_due") && (
                <p className="text-muted-foreground flex items-center gap-1.5">
                  <CreditCard size={15} />
                  כרטיס שמסתיים ב־{subscription.card_last4}
                </p>
              )}

              {subscription.status === "active" && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {subscription.cancel_at_period_end ? (
                    <Button onClick={resume} disabled={busy} className="rounded-2xl font-bold">
                      חזרה למנוי מתחדש
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" onClick={() => setConfirmCancel(true)} disabled={busy} className="rounded-2xl font-bold">
                        ביטול מנוי
                      </Button>
                      {canRefund && !subscription.is_trial && (
                        <Button variant="outline" onClick={() => setRefundOpen(true)} disabled={busy} className="rounded-2xl font-bold">
                          ביטול עם החזר (עד 14 יום)
                        </Button>
                      )}
                    </>
                  )}
                  {!subscription.cancel_at_period_end && isPaidPlan(subscription.plan_id) && (
                    <Button
                      variant="ghost"
                      onClick={() => setSwitchTo(subscription.plan_id === "annual" ? "quarterly" : "annual")}
                      disabled={busy}
                      className="rounded-2xl font-bold"
                    >
                      {subscription.plan_id === "annual" ? "מעבר למסלול רבעוני" : "מעבר למסלול שנתי"}
                    </Button>
                  )}
                </div>
              )}

              {subscription.status === "past_due" && (
                <Button variant="ghost" onClick={() => setConfirmCancel(true)} disabled={busy} className="rounded-2xl text-muted-foreground">
                  ביטול המנוי
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {orders.length > 0 && (
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Receipt size={18} className="text-primary-ink" />
                היסטוריית תשלומים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border text-sm">
                {orders.map((order) => (
                  <li key={order.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span>
                      {formatDate(order.paid_at ?? order.created_at)} · {Number(order.amount).toLocaleString("he-IL")} ₪
                    </span>
                    <span className="flex items-center gap-3 text-muted-foreground">
                      {ORDER_STATUS[order.status]}
                      {order.document_url?.startsWith("https://") && (
                        <a href={order.document_url} target="_blank" rel="noopener noreferrer" className="underline text-primary-ink">
                          חשבונית
                        </a>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>לבטל את המנוי?</AlertDialogTitle>
            <AlertDialogDescription>
              {subscription?.status === "past_due"
                ? "המנוי יסתיים מיד ולא ננסה לחייב שוב."
                : `לא תחויבו שוב. המנוי יישאר פעיל עד ${formatDate(subscription?.current_period_end)}, ואפשר לחזור בו עד אז.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={busy}>חזרה</AlertDialogCancel>
            <AlertDialogAction onClick={cancel} disabled={busy}>
              כן, לבטל
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RefundCancelDialog
        open={refundOpen}
        onOpenChange={setRefundOpen}
        onDone={() => {
          void reload();
        }}
      />

      <AlertDialog open={switchTo !== null} onOpenChange={(open) => !open && setSwitchTo(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מעבר למסלול {switchTo ? plans[switchTo]?.name : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              {switchTo === "annual" && !subscription?.is_trial
                ? "המעבר מיידי. הזמן שנשאר במסלול הנוכחי יקוזז ממחיר המסלול השנתי, ויחויב רק ההפרש."
                : switchTo === "annual"
                  ? "המסלול ישתנה עכשיו. עדיין לא חויבתם, והכרטיס יחויב בסוף החודש החינם."
                  : `המעבר ייכנס לתוקף בסוף התקופה הנוכחית (${formatDate(subscription?.current_period_end)}). לא יהיה חיוב או החזר עכשיו.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={busy}>חזרה</AlertDialogCancel>
            <AlertDialogAction onClick={switchPlan} disabled={busy}>
              אישור
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CheckoutConsentDialog
        open={payOpen}
        overdue
        plan={subscription && isPaidPlan(subscription.plan_id) ? subscription.plan_id : null}
        busy={busy}
        onOpenChange={setPayOpen}
        onConfirm={payOverdue}
      />
    </div>
  );
};

export default Subscription;
