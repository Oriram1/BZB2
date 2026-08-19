import { useEffect, useState } from "react";
import { Star, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

interface PendingReview {
  id: string;
  task_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  body: string | null;
  created_at: string;
  task_name: string | null;
  reviewer_name: string | null;
  reviewee_name: string | null;
}

export default function AdminReviewsPanel() {
  const [reviews, setReviews] = useState<PendingReview[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("reviews")
      .select(`
        id, task_id, reviewer_id, reviewee_id, rating, body, created_at,
        tasks!task_id (name),
        reviewer:profiles!reviewer_id (first_name, last_name),
        reviewee:profiles!reviewee_id (first_name, last_name)
      `)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("שגיאה בטעינת ביקורות");
      setLoading(false);
      return;
    }

    setReviews(
      (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        task_id: r.task_id as string,
        reviewer_id: r.reviewer_id as string,
        reviewee_id: r.reviewee_id as string,
        rating: r.rating as number,
        body: r.body as string | null,
        created_at: r.created_at as string,
        task_name: (r.tasks as { name: string } | null)?.name ?? null,
        reviewer_name: r.reviewer
          ? `${(r.reviewer as { first_name: string; last_name: string }).first_name} ${(r.reviewer as { first_name: string; last_name: string }).last_name}`.trim()
          : null,
        reviewee_name: r.reviewee
          ? `${(r.reviewee as { first_name: string; last_name: string }).first_name} ${(r.reviewee as { first_name: string; last_name: string }).last_name}`.trim()
          : null,
      })),
    );
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const decide = async (id: string, status: "approved" | "rejected") => {
    const { error } = await supabase.from("reviews").update({ status }).eq("id", id);
    if (error) { toast.error("שגיאה בעדכון"); return; }
    toast.success(status === "approved" ? "ביקורת אושרה" : "ביקורת נדחתה");
    setReviews((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <Card className="p-5 border-border/80 shadow-sm">
      <h2 className="font-extrabold text-lg mb-1">ביקורות ממתינות לאישור</h2>
      <p className="text-sm text-muted-foreground mb-4">ביקורות שנשלחו ועדיין לא פורסמו</p>
      {loading ? (
        <p className="text-sm text-muted-foreground">טוען...</p>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">אין ביקורות ממתינות</p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="border rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className="font-semibold">{r.reviewer_name ?? r.reviewer_id}</span>
                <span className="text-muted-foreground">→</span>
                <span className="font-semibold">{r.reviewee_name ?? r.reviewee_id}</span>
                {r.task_name && <span className="text-muted-foreground">| {r.task_name}</span>}
              </div>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} size={14} aria-hidden="true"
                    className={s <= r.rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"} />
                ))}
              </div>
              {r.body && <p className="text-sm text-foreground">{r.body}</p>}
              <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("he-IL")}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="text-green-600 border-green-300 hover:bg-green-50"
                  onClick={() => decide(r.id, "approved")}>
                  <Check size={14} className="me-1" /> אשר
                </Button>
                <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50"
                  onClick={() => decide(r.id, "rejected")}>
                  <X size={14} className="me-1" /> דחה
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
