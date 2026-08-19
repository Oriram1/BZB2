import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import CategoryIcon from "@/components/tasks/CategoryIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, CheckCircle2, UserX, Pencil, Calendar, Star } from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/format";
import { categoryLabel } from "@/lib/categories";
import { formFor, say, SUBJECT, type Gender } from "@/lib/gender";

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
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);

      const [{ data: profileRows }, { data: roleRows }, { data: taskRows }, { data: reviewRows }, { data: ratingRows }] = await Promise.all([
        supabase.rpc("get_public_profile", { _user_id: userId }),
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase
          .from("tasks")
          .select("id, name, short_desc, category, payment, payment_type, status")
          .eq("creator_id", userId)
          .is("archived_at", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("reviews")
          .select("id, rating, body, created_at, reviewer_id")
          .eq("reviewee_id", userId)
          .eq("status", "approved")
          .order("created_at", { ascending: false }),
        supabase
          .from("user_avg_ratings")
          .select("avg_rating")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      const profileData = Array.isArray(profileRows) ? profileRows[0] : profileRows;

      if (cancelled) return;
      setProfile(profileData ?? null);
      setRoles((roleRows ?? []).map((r) => r.role as string));
      setTasks(taskRows ?? []);
      setReviews((reviewRows ?? []) as Review[]);
      setAvgRating(ratingRows?.avg_rating ? Number(ratingRows.avg_rating) : null);
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
  const roleLabel = isTasker ? "מציע מטלות" : isBee ? "מבצע מטלות" : roles.includes("parent") ? "הורה" : "";

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
        {/* Identity */}
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

        {/* Open tasks by this user */}
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

        {/* Reviews section */}
        {(avgRating !== null || reviews.length > 0) && (
          <div className="bg-card rounded-3xl border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="font-bold text-foreground">ביקורות</h2>
              {avgRating !== null && (
                <span className="flex items-center gap-1 text-sm font-bold text-yellow-500">
                  <Star size={14} className="fill-yellow-400 text-yellow-400" aria-hidden="true" />
                  {avgRating.toFixed(1)}
                  <span className="text-muted-foreground font-normal">({reviews.length})</span>
                </span>
              )}
            </div>
            {reviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין עדיין ביקורות מאושרות.</p>
            ) : (
              <ul className="space-y-3">
                {reviews.map((r) => (
                  <li key={r.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                    <div className="flex items-center gap-1 mb-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          size={12}
                          aria-hidden="true"
                          className={s <= r.rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}
                        />
                      ))}
                    </div>
                    {r.body && <p className="text-sm text-foreground">{r.body}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{new Date(r.created_at).toLocaleDateString("he-IL")}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicProfile;
