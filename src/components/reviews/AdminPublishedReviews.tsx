import { useCallback, useEffect, useState } from "react";
import { Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { fetchNames } from "@/lib/people";
import { toast } from "sonner";

type Published = { id: string; rating: number; body: string | null; published_at: string; reviewee_id: string; reviewer_id: string; task_name: string | null };

/** Latest published reviews, with a takedown that records a reason the author sees. */
export default function AdminPublishedReviews() {
  const [rows, setRows] = useState<Published[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("reviews")
      .select("id, rating, body, published_at, reviewee_id, reviewer_id, tasks!task_id (name)")
      .eq("status", "approved").not("published_at", "is", null)
      .order("published_at", { ascending: false }).limit(25);
    if (error) { setFailed(true); setLoading(false); return; }
    const list = (data ?? []).map((r) => ({ ...r, published_at: r.published_at as string, task_name: (r.tasks as { name: string } | null)?.name ?? null }));
    const ids = [...new Set(list.flatMap((r) => [r.reviewer_id, r.reviewee_id]))];
    setNames(await fetchNames(ids));
    setRows(list); setFailed(false); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const remove = async (id: string) => {
    if (!reason.trim() || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_remove_review", { _review_id: id, _reason: reason.trim() });
    setBusy(false);
    if (error) { toast.error("לא הצלחנו להסיר את הביקורת"); return; }
    toast.success("הביקורת הוסרה והכותב קיבל הודעה");
    setRemoving(null); setReason(""); await load();
  };

  return (
    <Card className="space-y-3 p-5">
      <h2 className="text-lg font-extrabold">ביקורות שפורסמו</h2>
      <p className="text-sm text-muted-foreground">אפשר להסיר ביקורת שפורסמה אם היא מפרה את המדיניות. הכותב יראה את הסיבה ויוכל לערער.</p>
      {loading ? <p className="text-sm text-muted-foreground">טוען...</p> : failed ? <p role="alert" className="text-sm text-destructive">לא הצלחנו לטעון ביקורות שפורסמו.</p> : rows.length === 0 ? <p className="text-sm text-muted-foreground">אין ביקורות שפורסמו</p> : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="space-y-2 rounded-xl border p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{names.get(r.reviewer_id) ?? "משתמש"}</span><span className="text-muted-foreground">←</span><span className="font-semibold">{names.get(r.reviewee_id) ?? "משתמש"}</span>{r.task_name && <span className="text-muted-foreground">| {r.task_name}</span>}</div>
              <div className="flex gap-0.5" role="img" aria-label={`${r.rating} כוכבים`}>{[1, 2, 3, 4, 5].map((s) => <Star key={s} size={14} aria-hidden="true" className={s <= r.rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"} />)}</div>
              {r.body && <p className="whitespace-pre-wrap break-words">{r.body}</p>}
              {removing === r.id ? (
                <div className="flex flex-wrap gap-2"><Input aria-label="סיבה להסרת הביקורת" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="סיבה שהכותב יראה" /><Button size="sm" variant="destructive" disabled={!reason.trim() || busy} onClick={() => void remove(r.id)}>אישור הסרה</Button><Button size="sm" variant="outline" onClick={() => { setRemoving(null); setReason(""); }}>ביטול</Button></div>
              ) : (
                <Button size="sm" variant="outline" className="text-red-600 border-red-300" onClick={() => { setRemoving(r.id); setReason(""); }}><Trash2 size={14} className="me-1" aria-hidden="true" />הסרת ביקורת</Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
