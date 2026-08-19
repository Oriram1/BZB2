import { useState } from "react";
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
  taskId: string;
  taskName: string;
  revieweeId: string;
  revieweeName: string;
}

export default function ReviewDialog({ open, onClose, taskId, taskName, revieweeId, revieweeName }: ReviewDialogProps) {
  const { user } = useAuth();
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!user || rating === 0) return;
    setLoading(true);
    const { error } = await supabase.from("reviews").insert({
      task_id: taskId,
      reviewer_id: user.id,
      reviewee_id: revieweeId,
      rating,
      body: body.trim() || null,
    });
    setLoading(false);
    if (error) {
      if (error.message.includes("unique")) {
        toast.info("כבר דירגת את המטלה הזאת");
      } else {
        toast.error("לא הצלחנו לשלוח את הדירוג");
      }
      onClose();
      return;
    }
    toast.success("הדירוג נשלח ויפורסם לאחר אישור");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>דרג את {revieweeName}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">מטלה: {taskName}</p>
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
            {loading ? "שולח..." : "שלח דירוג"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
