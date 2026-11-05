import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Review = { id: string; rating: number; body: string | null; reviewee_id: string };

/** Public, moderated ratings between members - never fabricated testimonials. */
export default function LandingReviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    void supabase.from("reviews")
      .select("id, rating, body, reviewee_id")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(3)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setState("error"); return; }
        setReviews(data ?? []);
        setState("ready");
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="bg-card px-4 py-20" dir="rtl" aria-labelledby="community-reviews-title">
      <div className="mx-auto max-w-5xl">
        <div className="mb-9 max-w-xl">
          <p className="mb-2 text-sm font-bold text-primary-ink">הקהילה שלנו</p>
          <h2 id="community-reviews-title" className="text-3xl font-extrabold text-foreground sm:text-4xl">מילים שאומרים כאן אחד על השני</h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">דירוגים וביקורות שמשתמשים השאירו זה לזה אחרי השלמת מטלות, ואושרו לפרסום.</p>
        </div>
        {state === "loading" ? (
          <p className="text-sm text-muted-foreground" role="status">טוענים דירוגים...</p>
        ) : state === "error" ? (
          <p className="text-sm text-muted-foreground">לא הצלחנו לטעון את הדירוגים כרגע.</p>
        ) : reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">עדיין אין דירוגים שאושרו לפרסום.</p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-3">
            {reviews.map((review) => (
              <li key={review.id} className="flex min-w-0 flex-col rounded-2xl border border-border bg-background p-6">
                <div className="flex items-center gap-1" aria-label={`${review.rating} מתוך 5 כוכבים`}>
                  {Array.from({ length: 5 }, (_, index) => <Star key={index} size={16} className={index < review.rating ? "fill-primary text-primary-ink" : "text-muted-foreground/40"} aria-hidden="true" />)}
                </div>
                <p className="mt-5 flex-1 whitespace-pre-wrap break-words text-base leading-7 text-foreground">
                  {review.body?.trim() || <span className="text-muted-foreground">דירוג ללא ביקורת כתובה</span>}
                </p>
                <Link to={`/profile/${review.reviewee_id}`} className="mt-6 inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-bold text-primary-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  לפרופיל שקיבל את הדירוג <ArrowLeft size={15} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
