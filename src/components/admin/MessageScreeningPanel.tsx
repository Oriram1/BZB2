import { useCallback, useEffect, useState } from "react";
import { Check, MessageSquareWarning, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchNames } from "@/lib/people";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

interface FlaggedMessage {
  id: string;
  content: string;
  screening_reason: string | null;
  created_at: string;
  sender_id: string;
  sender_name: string;
}

/**
 * Chat messages the automatic screen held back. Admins see only these, never
 * ordinary conversations. Release shows the message to the other side again.
 */
export default function MessageScreeningPanel() {
  const [items, setItems] = useState<FlaggedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("messages")
      .select("id, content, screening_reason, created_at, sender_id")
      .eq("screening", "flagged")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      toast.error("שגיאה בטעינת הודעות שסומנו");
      setLoading(false);
      return;
    }
    const rows = data ?? [];
    const nameOf = await fetchNames([...new Set(rows.map((row) => row.sender_id))]);
    setItems(rows.map((row) => ({ ...(row as unknown as FlaggedMessage), sender_name: nameOf.get(row.sender_id) || "משתמש" })));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (item: FlaggedMessage, approve: boolean) => {
    setBusy(item.id);
    const { error } = await supabase.rpc("admin_screen_message" as never, { _message_id: item.id, _approve: approve } as never);
    setBusy(null);
    if (error) {
      toast.error("הפעולה נכשלה");
      return;
    }
    toast.success(approve ? "ההודעה שוחררה" : "ההודעה הוסרה");
    void load();
  };

  return (
    <Card className="p-5">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-extrabold"><MessageSquareWarning size={18} /> הודעות צ'אט שסומנו</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        הודעות שה-AI הסתיר מהצד השני. השולח עדיין רואה אותן. כאן מוצגות רק הודעות שסומנו, לא שיחות רגילות.
      </p>
      {loading ? (
        <p className="py-8 text-center text-muted-foreground">טוען…</p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">אין הודעות שסומנו</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-2xl border border-border p-4" data-testid="flagged-message-row">
              <p className="whitespace-pre-wrap break-words text-sm">{item.content}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.sender_name} · <time dateTime={item.created_at} dir="ltr">{new Date(item.created_at).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" })}</time>
              </p>
              {item.screening_reason && (
                <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm"><span className="font-bold">סיבה: </span>{item.screening_reason}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" disabled={busy === item.id} onClick={() => decide(item, true)} className="gap-1 rounded-full font-bold">
                  <Check size={15} /> שחרור
                </Button>
                <Button size="sm" variant="outline" disabled={busy === item.id} onClick={() => decide(item, false)} className="gap-1 rounded-full font-bold">
                  <Trash2 size={15} /> הסרה
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
