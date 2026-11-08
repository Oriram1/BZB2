import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { ReviewTags } from "@/components/reviews/ReviewTags";
import { ReportReviewDialog } from "@/components/reviews/ReportReviewDialog";
import PendingRatingsCard from "@/components/reviews/PendingRatingsCard";
import CategoryIcon from "@/components/tasks/CategoryIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, CheckCircle2, UserX, Pencil, Calendar, Star, Flag, CornerDownLeft } from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/format";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { categoryLabel } from "@/lib/categories";
import { formFor, say, SUBJECT, type Gender } from "@shared/gender.ts";
import { primaryRoleLabel } from "@/lib/roles";

interface PublicProfileData {
  user_id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  gender: Gender | null;
  created_at: string;
}

interface Review {
  id: string;
  rating: number;
  body: string | null;
  created_at: string;
  reviewer_id: string;
  reviewee_role: string;
  tags: string[];
}

interface PublicTask {
  id: string;
  name: string;
  short_desc: string;
  category: string;
  payment: number;
  payment_type: string;
  status: string;
}

/**
 * Public profile of another user, reached from a task listing.
 *
 * Deliberately shows no phone number and no address. Both are readable through
 * RLS, but this page is open to anyone — and a large share of the workers here
 * are minors. Only what a stranger needs in order to decide whether to work
 * with this person is shown.
 */
const PublicProfile = () => {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const [profile, setProfile] = useState<PublicProfileData | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [tasks, setTasks] = useState<PublicTask[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsFailed, setReviewsFailed] = useState(false);
  const [responses, setResponses] = useState<{ review_id: string; body: string }[]>([]);
  const [responsesFailed, setResponsesFailed] = useState(false);
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const [reviewRole, setReviewRole] = useState("all");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [reviewSort, setReviewSort] = useState("newest");
  const roleReviews = reviews.filter((review) => reviewRole === "all" || review.reviewee_role === reviewRole);
  const avgRating = roleReviews.length ? roleReviews.reduce((sum, review) => sum + review.rating, 0) / roleReviews.length : null;
  const [loading, setLoading] = useState(true);
  const filteredReviews = roleReviews.filter((review) => reviewFilter === "all" || review.rating === Number(reviewFilter));
  const visibleReviews = [...filteredReviews].sort((a, b) => reviewSort === "highest" ? b.rating - a.rating : reviewSort === "lowest" ? a.rating - b.rating : new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);

      const [{ data: profileRows }, { data: roleRows }, { data: taskRows }, { data: reviewRows, error: reviewError }] = await Promise.all([
        supabase.rpc("get_public_profile", { _user_id: userId }),
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase
          .from("tasks")
          .select("id, name, short_desc, category, payment, payment_type, status")
          .eq("creator_id", userId)
          .is("archived_at", null)
          .order("created_at", { ascending: false }),
        fetchAllPages((from, to) => supabase
          .from("reviews")
          .select("id, rating, body, created_at, reviewer_id, reviewee_role, tags")
          .eq("reviewee_id", userId)
          .eq("status", "approved")
          .not("published_at", "is", null)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to)),
      ]);
      const profileData = Array.isArray(profileRows) ? profileRows[0] : profileRows;

      const reviewIds = (reviewRows ?? []).map((review) => review.id);
      const responseResult = reviewIds.length && !reviewError ? await fetchAllPages((from, to) => supabase.from("review_responses")
        .select("review_id, body").in("review_id", reviewIds).eq("status", "approved").order("id").range(from, to)) : { data: [], error: null };
      if (cancelled) return;
      setResponses(responseResult.error ? [] : responseResult.data);
      setResponsesFailed(Boolean(responseResult.error));
      setProfile(profileData ?? null);
      setRoles((roleRows ?? []).map((r) => r.role as string));
      setTasks(taskRows ?? []);
      setReviews(reviewError ? [] : (reviewRows ?? []) as Review[]);
      setReviewsFailed(Boolean(reviewError));
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const isSelf = !!user && user.id === userId;
  const isTasker = roles.includes("tasker");
  const isBee = roles.includes("bee");
  const roleLabel = primaryRoleLabel(roles);

  const openTasks = tasks.filter((t) => t.status === "open");
  const completedCount = tasks.filter((t) => t.status === "completed").length;

  if (loading) {
    return (
      <div className="min-h-screen bg-muted" dir="rtl">
        <PageHeader title="פרופיל" />
        <div className="max-w-2xl mx-auto p-4 space-y-4" aria-busy="true">
          <Skeleton className="h-32 rounded-3xl" />
          <Skeleton className="h-24 rounded-3xl" />
          <span className="sr-only">טוען פרופיל</span>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-muted" dir="rtl">
        <PageHeader title="פרופיל" />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <UserX className="w-12 h-12 mx-auto mb-4 text-muted-foreground" aria-hidden="true" />
          <p className="text-lg font-semibold text-foreground">המשתמש לא נמצא</p>
          <p className="text-muted-foreground mt-1">ייתכן שהחשבון נמחק או שהקישור שגוי.</p>
          <Button variant="outline" className="mt-6 rounded-full" asChild>
<Link to="/tasks">למטלות הזמינות</Link>
</Button>
        </div>
      </div>
    );
  }

  const displayName = `${profile.first_name} ${profile.last_name}`.trim() || "משתמש";
  const avatar = profile.avatar_url || `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${profile.user_id}`;

  return (
    <div className="min-h-screen bg-muted" dir="rtl">
      <PageHeader title="פרופיל" />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {!isSelf && userId && <PendingRatingsCard onlyUserId={userId} />}
        <div className="bg-card rounded-3xl border border-border p-6">
          <div className="flex items-center gap-4">
            <img
              src={avatar}
              alt={`תמונת הפרופיל של ${displayName}`}
              className="w-20 h-20 rounded-full object-cover border-2 border-primary/20 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-foreground truncate">{displayName}</h1>
              {roleLabel && (
                <Badge variant="secondary" className="rounded-xl font-bold mt-1">
                  {roleLabel}
                </Badge>
              )}
              {avgRating !== null && (
                <a href="#reviews-heading" className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-sm font-bold text-foreground">
                  <Star size={14} className="fill-yellow-400 text-yellow-500" aria-hidden="true" />
                  <bdi className="tabular-nums">{avgRating.toFixed(1)}</bdi>
                  <span className="font-normal text-muted-foreground">({reviews.length})</span>
                </a>
              )}
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
                <Calendar size={12} aria-hidden="true" />
                {say(formFor(profile.gender), SUBJECT.member)} מאז {formatDate(profile.created_at)}
              </p>
            </div>
          </div>

          {isSelf && (
            <Button variant="outline" className="w-full mt-4 rounded-full" asChild>
<Link to="/profile"><Pencil size={14} className="ms-1" aria-hidden="true" />
                לעריכת הפרופיל שלי</Link>
</Button>
          )}
        </div>

        {/* Activity — only meaningful for people who publish tasks */}
        {isTasker && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card rounded-2xl border border-border p-4 text-center">
              <ClipboardList className="w-5 h-5 mx-auto text-primary-ink mb-1" aria-hidden="true" />
              <p className="text-2xl font-bold text-foreground tabular">{tasks.length}</p>
              <p className="text-xs text-muted-foreground">מטלות שפורסמו</p>
            </div>
            <div className="bg-card rounded-2xl border border-border p-4 text-center">
              <CheckCircle2 className="w-5 h-5 mx-auto text-trust mb-1" aria-hidden="true" />
              <p className="text-2xl font-bold text-foreground tabular">{completedCount}</p>
              <p className="text-xs text-muted-foreground">מטלות שהושלמו</p>
            </div>
          </div>
        )}

        {isTasker && (
          <div className="bg-card rounded-3xl border border-border p-5">
            <h2 className="font-bold text-foreground mb-3">מטלות פתוחות</h2>
            {openTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין כרגע מטלות פתוחות.</p>
            ) : (
              <ul className="divide-y divide-border">
                {openTasks.map((task) => (
                  <li key={task.id}>
                    <Link
                      to={`/task/${task.id}`}
                      className="flex items-center gap-3 py-3 rounded-xl transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <CategoryIcon category={task.category} className="shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate">{task.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{task.short_desc}</p>
                      </div>
                      <div className="text-end shrink-0">
                        <p className="font-bold text-foreground tabular">{formatCurrency(task.payment)}</p>
                        <p className="text-[11px] text-muted-foreground">{categoryLabel(task.category)}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!isTasker && (
          <div className="bg-card rounded-3xl border border-border p-5 text-center text-sm text-muted-foreground">
            אין עדיין פעילות ציבורית להצגה.
          </div>
        )}

        <section className="rounded-3xl border border-border bg-card p-5 sm:p-6" aria-labelledby="reviews-heading">
          <h2 id="reviews-heading" className="text-lg font-extrabold text-foreground">דירוג וביקורות</h2>

          {!reviewsFailed && reviews.length > 0 && (
            <div role="tablist" aria-label="תפקיד" className="mt-3 inline-flex rounded-full bg-muted p-1 text-sm">
              {[["all", "הכול"], ["tasker", "כמפרסם מטלות"], ["bee", "כמבצע מטלות"]].map(([value, label]) => (
                <button key={value} type="button" role="tab" aria-selected={reviewRole === value}
                  onClick={() => { setReviewRole(value); setReviewFilter("all"); }}
                  className={`rounded-full px-3.5 py-1.5 font-semibold transition-colors ${reviewRole === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {reviewsFailed ? (
            <p role="alert" className="mt-4 text-sm text-destructive">לא הצלחנו לטעון את הדירוגים. יש לרענן ולנסות שוב.</p>
          ) : roleReviews.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">אין עדיין דירוגים. לאחר השלמת מטלות, דירוגים שאושרו יופיעו כאן.</p>
          ) : (
            <>
              <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
                <div className="flex shrink-0 items-center gap-4 sm:flex-col sm:items-start sm:gap-1">
                  <p className="text-5xl font-extrabold leading-none tabular-nums text-foreground" aria-label={`ממוצע ${avgRating?.toFixed(1)} מתוך 5`}>{avgRating?.toFixed(1)}</p>
                  <div>
                    <div className="flex gap-0.5" aria-hidden="true">
                      {[1, 2, 3, 4, 5].map((s) => <Star key={s} size={16} className={s <= Math.round(avgRating ?? 0) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"} />)}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{roleReviews.length === 1 ? "דירוג אחד" : `${roleReviews.length} דירוגים`}</p>
                  </div>
                </div>
                <div className="flex-1 space-y-1" role="group" aria-label="התפלגות דירוגים. לחיצה מסננת לפי כוכבים">
                  {[5, 4, 3, 2, 1].map((stars) => {
                    const count = roleReviews.filter((review) => review.rating === stars).length;
                    const active = reviewFilter === String(stars);
                    return (
                      <button key={stars} type="button" disabled={count === 0} aria-pressed={active}
                        onClick={() => setReviewFilter(active ? "all" : String(stars))}
                        className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-xs transition-colors enabled:hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-primary/10 font-bold text-foreground" : "text-muted-foreground"} disabled:opacity-50`}>
                        <span className="w-3 tabular-nums">{stars}</span>
                        <Star size={12} className="fill-yellow-400 text-yellow-500" aria-hidden="true" />
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-yellow-400" style={{ width: `${count / roleReviews.length * 100}%` }} /></span>
                        <span className="w-5 text-end tabular-nums">{count}</span>
                        <span className="sr-only">{count} דירוגים של {stars} כוכבים</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                <div className="flex items-center gap-2 text-sm">
                  {reviewFilter !== "all" && (
                    <button type="button" onClick={() => setReviewFilter("all")} className="rounded-full bg-primary/15 px-3 py-1 font-semibold text-foreground">
                      {reviewFilter} כוכבים ✕
                    </button>
                  )}
                  <span className="text-muted-foreground">{visibleReviews.length === roleReviews.length ? "כל הביקורות" : `${visibleReviews.length} מתוך ${roleReviews.length}`}</span>
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">מיון
                  <select value={reviewSort} onChange={(event) => setReviewSort(event.target.value)} className="rounded-full border border-border bg-background px-3 py-1 text-foreground">
                    <option value="newest">החדשות ביותר</option><option value="highest">הגבוהות ביותר</option><option value="lowest">הנמוכות ביותר</option>
                  </select>
                </label>
              </div>

              {responsesFailed && <p role="alert" className="mt-3 text-sm text-destructive">לא הצלחנו לטעון תגובות לביקורות.</p>}
              {visibleReviews.length === 0 && <p className="mt-4 text-sm text-muted-foreground">אין ביקורות בדירוג הזה.</p>}
              <ul className="mt-4 space-y-3">
                {visibleReviews.map((r) => {
                  const reply = responses.find((response) => response.review_id === r.id);
                  return (
                    <li key={r.id} className="rounded-2xl bg-muted/60 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="flex gap-0.5" role="img" aria-label={`${r.rating} מתוך 5 כוכבים`}>
                            {[1, 2, 3, 4, 5].map((s) => <Star key={s} size={14} aria-hidden="true" className={s <= r.rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"} />)}
                          </span>
                          <span className="rounded-full bg-card px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{r.reviewee_role === "tasker" ? "כמפרסם" : "כמבצע"}</span>
                        </div>
                        <time className="text-xs text-muted-foreground" dateTime={r.created_at}>{new Date(r.created_at).toLocaleDateString("he-IL")}</time>
                      </div>
                      {r.body && <p className="mt-2.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground">{r.body}</p>}
                      <ReviewTags tags={r.tags} />
                      {reply && (
                        <div className="mt-3 flex gap-2 rounded-xl bg-card p-3 text-sm">
                          <CornerDownLeft size={16} className="mt-0.5 shrink-0 text-primary-ink" aria-hidden="true" />
                          <div><p className="font-semibold text-foreground">תגובת בעל הפרופיל</p><p className="mt-0.5 whitespace-pre-wrap break-words text-muted-foreground">{reply.body}</p></div>
                        </div>
                      )}
                      {user && (
                        <button type="button" onClick={() => setReportTarget(r.id)} className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
                          <Flag size={12} aria-hidden="true" />דיווח על ביקורת
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </div>
      {reportTarget && <ReportReviewDialog reviewId={reportTarget} onClose={() => setReportTarget(null)} />}
    </div>
  );
};

export default PublicProfile;
