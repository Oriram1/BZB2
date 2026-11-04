import { useState } from "react";
import { Star } from "lucide-react";
import ReviewDialog from "@/components/reviews/ReviewDialog";
import { usePendingRatings, type PendingRating } from "@/hooks/usePendingRatings";

/** Shows "rate X" shortcuts for finished work. Pass `onlyUserId` to limit to one person. */
export default function PendingRatingsCard({ onlyUserId }: { onlyUserId?: string }) {
  const { items, reload } = usePendingRatings();
  const [target, setTarget] = useState<PendingRating | null>(null);
  const list = onlyUserId ? items.filter((i) => i.revieweeId === onlyUserId) : items;
  if (!list.length && !target) return null;
  return (
    <section className="rounded-3xl border border-primary/30 bg-primary/5 p-4" dir="rtl" aria-label="דירוגים ממתינים">
      <h2 className="flex items-center gap-1.5 text-sm font-black"><Star size={16} className="fill-primary text-primary" /> דירוגים ממתינים</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">דירוג קצר עוזר לאחרים לבחור עם מי לעבוד</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {list.map((i) => (
          <button key={`${i.taskId}:${i.revieweeId}`} type="button" onClick={() => setTarget(i)}
            className="flex min-h-10 items-center gap-1.5 rounded-full gradient-honey px-3 py-1.5 text-xs font-bold text-primary-foreground">
            <Star size={13} /> {`דרג/י את ${i.revieweeName}`} · {i.taskName}
          </button>
        ))}
      </div>
      {target && (
        <ReviewDialog open onClose={() => setTarget(null)} onSubmitted={() => void reload()}
          taskId={target.taskId} taskName={target.taskName} revieweeId={target.revieweeId} revieweeName={target.revieweeName} />
      )}
    </section>
  );
}
