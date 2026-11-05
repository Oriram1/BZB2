import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isStandalone, pushConfigured, pushSupported, subscribeToPush, syncPushSubscription } from "@/lib/push";

export default function PushOnboarding() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const userId = user?.id;

  useEffect(() => {
    setOpen(false);
    if (loading || !userId || !isStandalone() || !pushSupported() || !pushConfigured()) return;
    let cancelled = false;
    const start = async () => {
      try {
        if (await syncPushSubscription() || cancelled) return;
        if (!sessionStorage.getItem(`bzb.push-dismissed:${userId}`)) {
          setBlocked(Notification.permission === "denied");
          setOpen(true);
        }
      } catch {
        if (!cancelled) toast.error("לא הצלחנו לחבר את ההתראות למכשיר. אפשר לנסות שוב בהגדרות ההתראות");
      }
    };
    void start();
    return () => { cancelled = true; };
  }, [loading, userId]);

  const dismiss = () => {
    if (userId) sessionStorage.setItem(`bzb.push-dismissed:${userId}`, "1");
    setOpen(false);
  };
  const enable = async () => {
    setBusy(true);
    try {
      const result = await subscribeToPush();
      if (result.ok) {
        setOpen(false);
        toast.success("מעולה! ההתראות הופעלו במכשיר הזה 🐝");
      } else {
        toast.error(result.reason === "denied" ? "לא אושרו התראות. אפשר לשנות זאת בהגדרות המכשיר" : "לא הצלחנו להפעיל התראות. אפשר לנסות שוב בהגדרות ההתראות");
      }
    } catch {
      toast.error("לא הצלחנו להפעיל התראות. אפשר לנסות שוב בהגדרות ההתראות");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) dismiss(); }}>
      <DialogContent dir="rtl" className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary-ink" aria-hidden="true"><BellRing size={24} /></span>
          <DialogTitle className="text-xl font-extrabold">{blocked ? "ההתראות כבויות במכשיר" : "שנעדכן כשיש חדש? 🐝"}</DialogTitle>
          <DialogDescription className="pt-2 leading-relaxed">
            {blocked ? "כדי לקבל עדכונים על הודעות ומטלות, יש לאפשר התראות ל־BZB בהגדרות המכשיר או הדפדפן. אפשר לחזור לכאן אחר כך." : "הודעה חדשה או עדכון על מטלה? נדאג לספר לכם גם כשהאפליקציה סגורה. בלחיצה על הכפתור תופיע בקשת אישור מהמכשיר."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 pt-2">
          {!blocked && <Button className="flex-1 rounded-full" onClick={() => void enable()} disabled={busy}>כן, לעדכן אותי</Button>}
          <Button className="flex-1 rounded-full" variant="outline" onClick={dismiss} disabled={busy}>{blocked ? "הבנתי" : "לא עכשיו"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
