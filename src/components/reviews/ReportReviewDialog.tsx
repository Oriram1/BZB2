import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const REPORT_REASONS: Record<string, string> = { abuse: "תוכן פוגעני", privacy: "פרטים אישיים", spam: "ספאם או פרסום", coercion: "איום או לחץ", irrelevant: "לא קשור למטלה", other: "סיבה אחרת" };
export function ReportReviewDialog({ reviewId, onClose }: { reviewId: string; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!reason || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("report_review", { _review_id: reviewId, _reason: reason, _details: details.trim() || null });
      if (error) { if (error.code === "23505") { toast.info("כבר דיווחתם על הביקורת הזאת"); onClose(); return; } throw error; }
      toast.success("הדיווח נשלח לבדיקה"); onClose();
    } catch { toast.error("לא הצלחנו לשלוח את הדיווח"); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}><DialogContent dir="rtl" className="rounded-2xl sm:max-w-md"><DialogHeader><DialogTitle>דיווח על ביקורת</DialogTitle><DialogDescription>מנהל יבדוק את הדיווח. הביקורת לא תוסר אוטומטית.</DialogDescription></DialogHeader><label className="text-sm font-semibold">סיבת הדיווח <select className="mt-1 w-full rounded-lg border border-border bg-background p-2" value={reason} onChange={(event) => setReason(event.target.value)}><option value="">בחירת סיבה</option>{Object.entries(REPORT_REASONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><Textarea aria-label="פרטים נוספים לדיווח" value={details} maxLength={500} onChange={(event) => setDetails(event.target.value)} placeholder="פרטים נוספים (לא חובה)" /><div className="flex gap-2"><Button disabled={!reason || busy} onClick={() => void send()}>שליחת דיווח</Button><Button variant="outline" disabled={busy} onClick={onClose}>ביטול</Button></div></DialogContent></Dialog>;
}
