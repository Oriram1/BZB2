import { useEffect, useState } from "react";
import { TAGS_FOR_PUBLISHER, TAGS_FOR_WORKER } from "@/lib/reviewTags";
import { Star } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface ReviewDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
  taskId: string;
  taskName: string;
  revieweeId: string;
  revieweeName: string;
  initialReview?: { id: string; rating: number; body: string | null; tags?: string[] };
}

export default function ReviewDialog({ open, onClose, onSubmitted, taskId, taskName, revieweeId, revieweeName, initialReview }: ReviewDialogProps) {
  const { user } = useAuth();
  const [rating, setRating] = useState(initialReview?.rating ?? 0);
  const [hovered, setHovered] = useState(0);
  const [body, setBody] = useState(initialReview?.body ?? "");
  const [loading, setLoading] = useState(false);
  const [tags, setTags] = useState<string[]>(initialReview?.tags ?? []);
  const [options, setOptions] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    void supabase.from("tasks").select("creator_id").eq("id", taskId).maybeSingle().then(({ data }) => {
      if (!cancelled && data) setOptions(data.creator_id === user.id ? TAGS_FOR_WORKER : TAGS_FOR_PUBLISHER);
    });
    return () => { cancelled = true; };
  }, [open, user, taskId]);
  const toggleTag = (tag: string) => setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : current.length < 4 ? [...current, tag] : current);

  const submit = async () => {
    if (!user || rating === 0) return;
    setLoading(true);
    const { error } = initialReview
      ? await supabase.rpc("edit_unpublished_review", { _review_id: initialReview.id, _rating: rating, _body: body.trim() || null, _tags: tags })
      : await supabase.from("reviews").insert({
        task_id: taskId, reviewer_id: user.id, reviewee_id: revieweeId,
        rating, body: body.trim() || null, tags,
      });
    setLoading(false);
    if (error) {
      if (error.code === "23505") {
        toast.info("כבר דירגת את המטלה הזאת");
        onSubmitted?.();
        onClose();
      } else if (error.message.includes("appeal_pending")) {
        toast.error("קיים ערעור בבדיקה. אפשר לערוך אחרי שתתקבל החלטה");
      } else {
        toast.error("לא הצלחנו לשלוח את הדירוג");
      }
      return;
    }
    onSubmitted?.();
    toast.success(initialReview ? "הדירוג עודכן ויעבור בדיקה מחדש" : "הדירוג נשלח. ביקורת תקינה מתפרסמת אוטומטית כששני הצדדים דירגו או אחרי 14 יום");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>{initialReview ? "עריכת הדירוג" : `דרג את ${revieweeName}`}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">מטלה: {taskName}</p>
        <p className="text-sm text-muted-foreground">ביקורת תקינה מתפרסמת אוטומטית כששני הצדדים דירגו, או בתום 14 יום מסיום המטלה. דירוג נמוך או תוכן חשוד נבדקים על ידי אדם.</p>
        <div className="flex gap-1 justify-center py-2" role="group" aria-label="דירוג בכוכבים">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              type="button"
              aria-label={`${s} כוכבים`}
              onMouseEnter={() => setHovered(s)}
              onMouseLeave={() => setHovered(0)}
              onClick={() => setRating(s)}
              className="p-1"
            >
              <Star
                size={32}
                className={s <= (hovered || rating) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}
              />
            </button>
          ))}
        </div>
        {Object.keys(options).length > 0 && (
          <div role="group" aria-label="תגיות משוב (לא חובה)" className="flex flex-wrap gap-2">
            {Object.entries(options).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={tags.includes(key)} onClick={() => toggleTag(key)}
                className={`rounded-full border px-3 py-1 text-sm ${tags.includes(key) ? "border-primary bg-primary/15 font-semibold" : "border-border text-muted-foreground"}`}>
                {label}
              </button>
            ))}
          </div>
        )}
        <Textarea
          placeholder="כתוב ביקורת (אופציונלי)..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={500}
        />
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={submit} disabled={rating === 0 || loading}>
            {loading ? "שולח..." : initialReview ? "שמירת השינויים" : "שלח דירוג"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
