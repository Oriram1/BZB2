import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ReviewResponse = { review_id: string; body: string; status: "pending" | "approved" | "rejected" };

export function ReviewResponseEditor({ reviewId, response, onSaved }: { reviewId: string; response?: ReviewResponse; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(response?.body ?? "");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("submit_review_response", { _review_id: reviewId, _body: body.trim() });
      if (error) throw error;
      setEditing(false);
      toast.success("התגובה נשלחה לאישור");
      onSaved();
    } catch {
      toast.error("לא הצלחנו לשמור את התגובה. אפשר לנסות שוב");
    } finally { setBusy(false); }
  };
  return <div className="mt-3 border-t border-border pt-3">
    {response && !editing && <div className="text-sm"><p className="font-semibold">התגובה שלי</p><p className="whitespace-pre-wrap break-words">{response.body}</p><p className="mt-1 text-xs text-muted-foreground">{response.status === "approved" ? "פורסמה" : response.status === "rejected" ? "לא אושרה" : "ממתינה לאישור"}</p></div>}
    {editing ? <div className="space-y-2"><Textarea aria-label="תגובה לביקורת" value={body} maxLength={500} onChange={(event) => setBody(event.target.value)} placeholder="מה תרצו להשיב?" /><div className="flex gap-2"><Button size="sm" disabled={!body.trim() || busy} onClick={() => void submit()}>שליחת תגובה</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => { setBody(response?.body ?? ""); setEditing(false); }}>ביטול</Button></div><p className="text-xs text-muted-foreground">התגובה תופיע לאחר אישור מנהל.</p></div> : <Button size="sm" variant="outline" className="mt-2 rounded-full" onClick={() => { setBody(response?.body ?? ""); setEditing(true); }}>{response ? "עריכת תגובה" : "תגובה לביקורת"}</Button>}
  </div>;
}
