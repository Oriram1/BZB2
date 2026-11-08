import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { runAction } from "@/lib/errors";

type Appeal = { status: string; decision: string | null; decision_note: string | null };
export function ReviewAppeal({ reviewId }: { reviewId: string }) {
  const [appeal, setAppeal] = useState<Appeal | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from("review_appeals").select("status, decision, decision_note").eq("review_id", reviewId).maybeSingle();
    setFailed(Boolean(error)); if (!error) setAppeal(data); setLoading(false);
  }, [reviewId]);
  useEffect(() => { void load(); }, [load]);
  const send = async () => {
    if (!reason.trim() || busy) return;
    setBusy(true);
    const sent = await runAction(async () => {
      const { error } = await supabase.rpc("appeal_review_decision", { _review_id: reviewId, _reason: reason.trim() });
      if (error) throw error;
      return true;
    }, "לא הצלחנו לשלוח את הערעור");
    if (sent) { toast.success("הערעור נשלח לבדיקה"); setOpen(false); await load(); }
    setBusy(false);
  };
  if (loading) return null;
  if (failed) return <p role="alert" className="mt-2 text-xs text-destructive">לא הצלחנו לטעון את מצב הערעור.</p>;
  return <div className="mt-2">{appeal ? <div className="text-xs text-muted-foreground"><p>{appeal.status === "pending" ? "הערעור ממתין לבדיקה" : appeal.decision === "restore" ? "הערעור התקבל" : "הערעור נדחה"}</p>{appeal.decision_note && <p className="mt-1">{appeal.decision_note}</p>}</div> : <Button size="sm" variant="outline" className="rounded-full" onClick={() => setOpen(true)}>ערעור על ההחלטה</Button>}
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) setOpen(false); }}><DialogContent dir="rtl" className="rounded-2xl sm:max-w-md"><DialogHeader><DialogTitle>ערעור על החלטה</DialogTitle><DialogDescription>אפשר להסביר למה כדאי לבדוק את ההחלטה שוב. ניתן להגיש ערעור אחד.</DialogDescription></DialogHeader><Textarea aria-label="נימוק הערעור" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /><div className="flex gap-2"><Button disabled={!reason.trim() || busy} onClick={() => void send()}>שליחת ערעור</Button><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>ביטול</Button></div></DialogContent></Dialog>
  </div>;
}
