import { useCallback, useEffect, useState } from "react";
import { taskStatusLabel } from "@/lib/taskStatus";
import { ReviewAppeal } from "@/components/reviews/ReviewAppeal";
import { ReviewTags } from "@/components/reviews/ReviewTags";
import ReviewReportsPanel from "@/components/reviews/ReviewReportsPanel";
import { ReviewResponseEditor, type ReviewResponse } from "@/components/reviews/ReviewResponseEditor";
import ReviewDialog from "@/components/reviews/ReviewDialog";
import PendingRatingsCard from "@/components/reviews/PendingRatingsCard";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AvatarPicker } from "@/components/profile/AvatarPicker";
import { supabase } from "@/integrations/supabase/client";
import { logUserActivity } from "@/lib/activityLog";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import {
  Edit3, Save, X, ClipboardList, TrendingUp, DollarSign,
  Eye, Users, CheckCircle, Clock, Mail, Star, ChevronLeft, ArrowLeft, Plus, FileText, Briefcase,
  Coins, MoreVertical, Handshake, Wallet, Trophy, Sparkle
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { displayName, formatCurrency, formatDate } from "@/lib/format";
import { GENDER_LABEL, GENDER_OPTIONS, type Gender } from "@shared/gender.ts";
import { geocodeAddress } from "@/lib/geocodeAddress";
import GoogleMapPicker from "@/components/tasks/GoogleMapPicker";
import { PasswordCard } from "@/components/profile/PasswordCard";
import { DeleteAccountCard } from "@/components/profile/DeleteAccountCard";
import { ParentShareLink } from "@/components/profile/ParentShareLink";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { loadBeeStats, loadPublishedTaskCounts, type BeeStats } from "@/lib/profileStats";
import { primaryRoleLabel } from "@/lib/roles";
import { inBatches } from "@/lib/people";
import { PARENT_CONTACT_ERRORS, mapDbError } from "@/lib/errors";
import { useRoles } from "@/hooks/useRoles";
import { useRoleSwitch } from "@/hooks/useRoleSwitch";
import { registerPath } from "@/lib/routes";
import { functionErrorCode } from "@/lib/invokeFunction";

interface ReviewHistoryRow {
  id: string;
  task_id: string;
  task_name: string;
  rating: number;
  body: string | null;
  created_at: string;
  status: "pending" | "approved" | "rejected";
  published_at: string | null;
  rejection_reason: string | null;
  screening: string;
  tags: string[];
}

/** Someone who asked, from the public view page, to be added to the list. */
interface ParentRequest {
  id: string;
  email: string;
  requested_at: string;
}

/** A parent reachable by email, with no account behind it. */
interface ParentContact {
  id: string;
  email: string;
  created_at: string;
  view_token: string;
}

interface TaskStats {
  total: number;
  open: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  totalApplicants: number;
}

interface TaskWithApps {
  id: string;
  name: string;
  short_desc: string;
  status: string;
  views_count: number;
  payment: number;
  payment_type: string;
  category: string;
  created_at: string;
  applications: {
    id: string;
    status: string;
    applicant_id: string;
  }[];
}

const Profile = () => {
  const { user, profile, roles, activeRole, loading: authLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { switching, switchTo } = useRoleSwitch();
  const { isTasker, isBee, isAdmin } = useRoles();
  const [editing, setEditing] = useState(false);
  const [showAllRatings, setShowAllRatings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", age: "", address: "", phone: "", gender: "unspecified" as Gender });
  const [addressPosition, setAddressPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);

  const handleAddressBlur = async () => {
    if (!form.address.trim()) return;
    setAddressLoading(true);
    const result = await geocodeAddress(form.address);
    if (result) {
      setForm((current) => ({ ...current, address: result.formattedAddress }));
      setAddressPosition({ lat: result.lat, lng: result.lng });
    }
    setAddressLoading(false);
  };

  const [taskerStats, setTaskerStats] = useState<TaskStats>({ total: 0, open: 0, inProgress: 0, completed: 0, cancelled: 0, totalApplicants: 0 });
  const [taskerStatsError, setTaskerStatsError] = useState(false);
  const [myTasks, setMyTasks] = useState<TaskWithApps[]>([]);

  const [beeStats, setBeeStats] = useState<BeeStats>({ applied: 0, accepted: 0, completed: 0, totalEarnings: 0, estimatedEarnings: false, missingHours: false });
  const [beeStatsError, setBeeStatsError] = useState(false);
  const [editingReview, setEditingReview] = useState<ReviewHistoryRow | null>(null);
  const [reviewHistory, setReviewHistory] = useState<ReviewHistoryRow[]>([]);
  const [receivedReviews, setReceivedReviews] = useState<Pick<ReviewHistoryRow, "id" | "rating" | "body" | "created_at" | "tags">[]>([]);
  const [receivedResponses, setReceivedResponses] = useState<ReviewResponse[]>([]);
  const [receivedSort, setReceivedSort] = useState("newest");
  const [receivedFilter, setReceivedFilter] = useState("all");
  const [receivedReviewsError, setReceivedReviewsError] = useState(false);
  const [parentContacts, setParentContacts] = useState<ParentContact[]>([]);
  const [parentRequests, setParentRequests] = useState<ParentRequest[]>([]);
  const [decidingRequest, setDecidingRequest] = useState<string | null>(null);
  const [newParentEmail, setNewParentEmail] = useState("");
  const [savingParentContact, setSavingParentContact] = useState(false);

  const [loadingData, setLoadingData] = useState(true);

  const loadParentRequests = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("parent_contact_requests")
      .select("id, email, requested_at")
      .eq("child_user_id", user.id)
      .order("requested_at", { ascending: true });
    if (error) {
      toast.error("לא הצלחנו לטעון את בקשות ההורים");
      return;
    }
    setParentRequests(data ?? []);
  }, [user]);

  /**
   * Approving reuses add-parent-contact rather than inserting directly, so an
   * approved parent gets the same welcome email and share link as one the child
   * typed in themselves. The request row is cleared only after that succeeds —
   * a dropped request with no contact behind it is a silent loss.
   */
  const decideParentRequest = async (request: ParentRequest, approve: boolean) => {
    setDecidingRequest(request.id);
    try {
      if (approve) {
        const { data, error } = await supabase.functions.invoke<{ error?: string }>(
          "add-parent-contact",
          { body: { email: request.email } },
        );
        const failure = error ? await functionErrorCode(error, "invoke_failed") : data?.error;
        if (failure && failure !== "already_added") {
          toast.error(mapDbError({ message: failure }, { limit_reached: PARENT_CONTACT_ERRORS.limit_reached }, "לא הצלחנו לאשר את הבקשה"));
          return;
        }
      }

      const { error: deleteError } = await supabase
        .from("parent_contact_requests")
        .delete()
        .eq("id", request.id);
      if (deleteError) {
        toast.error("לא הצלחנו לעדכן את הבקשה");
        return;
      }

      setParentRequests((current) => current.filter((row) => row.id !== request.id));
      if (approve) await loadParentContacts();
      toast.success(approve ? "הכתובת אושרה ונוספה 📧" : "הבקשה נדחתה");
    } finally {
      setDecidingRequest(null);
    }
  };

  const loadParentContacts = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("parent_contacts")
      .select("id, email, created_at, view_token")
      .eq("child_user_id", user.id)
      .order("created_at", { ascending: true });
    if (error) {
      toast.error("לא הצלחנו לטעון את כתובות ההורים");
      return;
    }
    setParentContacts(data ?? []);
  }, [user]);

  const addParentContact = async () => {
    const email = newParentEmail.trim().toLowerCase();
    if (!email) return;
    setSavingParentContact(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        ok?: boolean;
        emailed?: boolean;
        error?: string;
      }>("add-parent-contact", { body: { email } });

      const failure = error ? await functionErrorCode(error, "invoke_failed") : data?.error;
      if (failure) {
        toast.error(mapDbError({ message: failure }, PARENT_CONTACT_ERRORS, "לא הצלחנו לשמור את הכתובת. כדאי לנסות שוב."));
        return;
      }

      setNewParentEmail("");
      await loadParentContacts();
      toast[data?.emailed ? "success" : "warning"](
        data?.emailed
          ? "הכתובת קושרה, ועדכון נשלח במייל 📧"
          : "הכתובת נשמרה, אבל שליחת המייל נכשלה. כדאי לבדוק את הכתובת.",
      );
    } finally {
      setSavingParentContact(false);
    }
  };

  useEffect(() => {
    if (profile) {
      setForm({
        first_name: profile.first_name || "",
        last_name: profile.last_name || "",
        age: profile.age?.toString() || "",
        address: profile.address || "",
        phone: profile.phone || "",
        gender: profile.gender ?? "unspecified",
      });
      setAvatarUrl(profile.avatar_url);
    }
  }, [profile]);

  const loadTaskerData = useCallback(async () => {
    if (!user) return;
    setTaskerStatsError(false);
    const { data: tasks, error } = await fetchAllPages((from, to) => supabase
      .from("tasks")
      .select("id, name, short_desc, status, views_count, payment, payment_type, category, created_at")
      .eq("creator_id", user.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to));
    if (error) {
      setTaskerStatsError(true);
      toast.error("לא הצלחנו לטעון את נתוני המטלות שפרסמתם");
      return;
    }

    const applications: (TaskWithApps["applications"][number] & { task_id: string })[] = [];
    for (const batch of inBatches(tasks.map((task) => task.id))) {
      const { data: rows, error: appsError } = await fetchAllPages((from, to) => supabase
        .from("task_applications")
        .select("id, status, applicant_id, task_id")
        .in("task_id", batch)
        .is("archived_at", null)
        .order("id")
        .range(from, to));
      if (appsError) {
        setTaskerStatsError(true);
        toast.error("לא הצלחנו לטעון את מספר המועמדויות");
        return;
      }
      applications.push(...rows);
    }

    setMyTasks(tasks.map((task) => ({
      ...task,
      applications: applications.filter((application) => application.task_id === task.id),
    })));
    try {
      setTaskerStats({ ...await loadPublishedTaskCounts(user.id), totalApplicants: applications.length });
    } catch {
      setTaskerStatsError(true);
      toast.error("לא הצלחנו לטעון את נתוני המטלות שפרסמתם");
    }
  }, [user]);

  const loadBeeData = useCallback(async () => {
    if (!user) return;
    setBeeStatsError(false);
    try {
      setBeeStats(await loadBeeStats(user.id));
    } catch {
      setBeeStatsError(true);
      toast.error("לא הצלחנו לטעון את נתוני הביצוע וההכנסות");
    }
  }, [user]);

  const loadReceivedReviews = useCallback(async () => {
    if (!user) return;
    const { data, error } = await fetchAllPages((from, to) => supabase.from("reviews")
      .select("id, rating, body, created_at, tags")
      .eq("reviewee_id", user.id).eq("status", "approved").not("published_at", "is", null)
      .order("created_at", { ascending: false }).order("id").range(from, to));
    if (error) { setReceivedReviewsError(true); setReceivedReviews([]); setReceivedResponses([]); return; }
    const reviewIds = data.map((review) => review.id);
    const responseResult = reviewIds.length ? await fetchAllPages((from, to) => supabase.from("review_responses")
      .select("review_id, body, status").in("review_id", reviewIds).order("id").range(from, to)) : { data: [], error: null };
    setReceivedReviewsError(Boolean(responseResult.error));
    setReceivedReviews(data);
    setReceivedResponses(responseResult.error ? [] : responseResult.data);
  }, [user]);

  const loadReviewHistory = useCallback(async () => {
    if (!user) return;
    const { data: reviews, error } = await supabase
      .from("reviews")
      .select("id, task_id, rating, body, created_at, status, published_at, rejection_reason, screening, tags")
      .eq("reviewer_id", user.id)
      .order("created_at", { ascending: false });
    if (error) { toast.error("לא הצלחנו לטעון את היסטוריית הדירוגים"); return; }
    const taskIds = [...new Set((reviews ?? []).map((review) => review.task_id))];
    const { data: tasks, error: tasksError } = taskIds.length
      ? await fetchAllPages((from, to) => supabase.from("tasks").select("id, name")
        .in("id", taskIds).is("archived_at", null).order("id").range(from, to))
      : { data: [], error: null };
    if (tasksError) { toast.error("לא הצלחנו לטעון את היסטוריית הדירוגים"); return; }
    const names = new Map((tasks ?? []).map((task) => [task.id, task.name]));
    const rows = (reviews ?? []).map((review) => ({
      ...review, task_name: names.get(review.task_id) ?? "מטלה שהושלמה",
    }));
    setReviewHistory(rows);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoadingData(true);
      await Promise.all([loadTaskerData(), loadBeeData(), loadReviewHistory(), loadReceivedReviews()]);
      if (isBee) await Promise.all([loadParentContacts(), loadParentRequests()]);
      setLoadingData(false);
    };
    void load();
  // isTasker is not read here: switching roles changes what these loaders must show, so it re-runs them.
  }, [user, isTasker, isBee, loadTaskerData, loadBeeData, loadReviewHistory, loadReceivedReviews, loadParentContacts, loadParentRequests]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: form.first_name,
        last_name: form.last_name,
        address: form.address || null,
        phone: form.phone || null,
        gender: form.gender,
      })
      .eq("user_id", user.id);

    if (error) {
      toast.error("שגיאה בשמירת הפרופיל");
    } else {
      logUserActivity(user.id, "profile_updated", { entityType: "profile", entityId: user.id });
      await refreshProfile();
      toast.success("הפרופיל עודכן בהצלחה!");
      setEditing(false);
    }
    setSaving(false);
  };

  if (authLoading) {
    return <div className="figma min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">טוען...</p></div>;
  }

  if (!user) {
    return (
      <div className="figma min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <p className="text-xl font-bold text-foreground mb-4">יש להתחבר כדי לצפות בפרופיל</p>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full font-semibold" asChild>
<Link to="/auth">כניסה 🐝</Link>
</Button>
        </div>
      </div>
    );
  }

  const name = displayName(form, user.email || "משתמש");
  const roleLabel = primaryRoleLabel(roles);

  return (
    <div className="figma min-h-screen bg-background relative" dir="rtl">
      {/* "האיזור שלי" frame: back / centred title / menu, grey page, white cards. */}
      <PageHeader
        variant="figma"
        centerTitle
        title="האיזור שלי"
        titleIsPageHeading
        action={
          <Button size="sm" className="rounded-full bg-card text-foreground font-medium border border-border" asChild>
<Link to="/tasks">מטלות זמינות</Link>
</Button>
        }
      />

      <div className="max-w-3xl mx-auto py-5 px-4 relative z-10 space-y-5">
        <PendingRatingsCard />
        {/* Identity as drawn: avatar and greeting centred, the publish / perform
            switch, the one orange call to action, then a thin rule. */}
        <section className="flex flex-col items-center text-center">
          <AvatarPicker userId={user.id} currentAvatarUrl={avatarUrl} onAvatarChange={setAvatarUrl} />
          <p className="mt-3 text-[22px] font-bold leading-tight text-foreground">שלום {form.first_name || name} 👋</p>
          <p className="mt-1 text-sm text-muted-foreground">כאן אפשר לנהל את המטלות והפעילות שלך</p>
          <div role="group" aria-label="מצב עבודה" className="mt-5 inline-grid grid-cols-2 rounded-full border border-border bg-[#F3F3F3] p-[3px]">
            {([
              { role: "tasker" as const, label: "פרסום מטלות", Icon: FileText },
              { role: "bee" as const, label: "ביצוע מטלות", Icon: Briefcase },
            ]).map(({ role, label, Icon }) => {
              const on = activeRole === role;
              return (
                <button
                  key={role}
                  type="button"
                  aria-pressed={on}
                  disabled={switching}
                  onClick={() => {
                    if (on) return;
                    if (roles.includes(role)) void switchTo(role);
                    else navigate(registerPath(role));
                  }}
                  className={`flex min-h-[35px] items-center justify-center gap-2 rounded-full px-3 text-sm ${on ? "bg-card font-semibold text-foreground shadow-card" : "text-muted-foreground"}`}
                >
                  {label}
                  <Icon size={16} aria-hidden="true" />
                </button>
              );
            })}
          </div>
          {isTasker && (
            <Button className="mt-5 h-12 w-full rounded-full bg-primary text-primary-foreground font-semibold hover:bg-primary/90 gap-2" asChild>
              <Link to="/create-task"><Plus size={18} aria-hidden="true" />פרסום מטלה חדשה</Link>
            </Button>
          )}
          <hr className="mt-6 w-full border-border" />
        </section>

        {(isTasker || taskerStats.total > 0 || taskerStatsError) && (
          <>
            <h2 className="text-lg font-bold text-foreground">במבט מהיר</h2>
            <div className="grid grid-cols-2 gap-3 rounded-2xl bg-card p-3 shadow-card">
              <StatCard icon={ClipboardList} label="סה״כ מטלות" value={loadingData ? "…" : taskerStatsError ? "-" : taskerStats.total} to="/my-tasks?tab=published" />
              <StatCard icon={Clock} label="מטלות פתוחות" value={loadingData ? "…" : taskerStatsError ? "-" : taskerStats.open} to="/my-tasks?tab=published" />
              <StatCard icon={Users} label="נרשמים" value={loadingData ? "…" : taskerStatsError ? "-" : taskerStats.totalApplicants} to="/my-tasks?tab=applications" />
              <StatCard icon={CheckCircle} label="מטלות שהושלמו" value={loadingData ? "…" : taskerStatsError ? "-" : taskerStats.completed} to="/my-tasks?tab=published" />
            </div>
            {taskerStatsError && <p role="alert" className="text-sm text-destructive">נתוני המטלות לא נטענו. יש לרענן ולנסות שוב.</p>}

            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">המטלות שפרסמתי</h2>
              <Link to="/my-tasks?tab=published" className="flex items-center gap-1.5 text-sm text-primary-ink">לכל המטלות<ArrowLeft size={16} aria-hidden="true" /></Link>
            </div>
            {loadingData ? (
              <p className="py-4 text-center text-muted-foreground">טוען...</p>
            ) : myTasks.length === 0 ? (
              <div className="rounded-2xl bg-card p-6 text-center shadow-card">
                <p className="mb-3 text-muted-foreground">עדיין לא פרסמת מטלות</p>
                <Button className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold" asChild>
                  <Link to="/create-task">פרסם מטלה</Link>
                </Button>
              </div>
            ) : (() => {
              /* The design shows the latest published task only; the rest are behind "לכל המטלות". */
              const task = myTasks[0];
              return (
                <article className="rounded-2xl bg-card p-4 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-muted-foreground">המטלה שלי</p>
                    <Badge variant="outline" className="rounded-full border-green-600 bg-green-50 px-3 py-1 text-sm font-normal text-green-700">{taskStatusLabel(task.status)}</Badge>
                  </div>
                  <Link to={`/task/${task.id}`} className="mt-3 block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <h3 className="text-xl font-bold text-foreground">{task.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{task.short_desc}</p>
                  </Link>
                  <dl className="mt-4 grid grid-cols-3 divide-x divide-x-reverse divide-border text-center">
                    {[
                      { Icon: Coins, label: "תקציב", value: formatCurrency(task.payment) },
                      { Icon: Eye, label: "צפיות", value: String(task.views_count) },
                      { Icon: Users, label: "נרשמים", value: String(task.applications.length) },
                    ].map(({ Icon, label, value }) => (
                      <div key={label} className="flex flex-col items-center gap-1.5 px-1">
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-soft text-primary-ink"><Icon size={16} aria-hidden="true" /></span>
                        <div className="flex items-baseline gap-1 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="font-bold text-foreground tabular-nums">{value}</dd></div>
                      </div>
                    ))}
                  </dl>
                  <hr className="my-4 border-border" />
                  <div className="flex items-center justify-between">
                    <Link to={`/task/${task.id}`} className="flex items-center gap-2 text-base font-medium text-primary-ink">לפרטי המטלה<ArrowLeft size={18} aria-hidden="true" /></Link>
                    <Link to={task.applications.some((a) => a.status === "pending") ? `/my-tasks?tab=applications&task=${task.id}` : `/my-tasks?tab=published`} aria-label="עוד אפשרויות" className="grid h-9 w-9 place-items-center rounded-full text-foreground hover:bg-muted"><MoreVertical size={18} aria-hidden="true" /></Link>
                  </div>
                </article>
              );
            })()}
          </>
        )}

        {(isBee || isTasker || beeStats.applied > 0 || beeStatsError) && (() => {
          const ratings = receivedReviews.map((review) => review.rating);
          const average = ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null;
          return (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-foreground">הביצועים שלי</h2>
                <Link to="/my-tasks?tab=performing" className="flex items-center gap-1.5 text-sm text-primary-ink">לכל הפעילות<ArrowLeft size={16} aria-hidden="true" /></Link>
              </div>
              <div className="rounded-2xl bg-card p-3 shadow-card space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <StatCard icon={Handshake} label="מועמדויות" value={loadingData ? "…" : beeStatsError ? "-" : beeStats.applied} to="/my-tasks?tab=performing" />
                  <StatCard icon={CheckCircle} label="מטלות שהושלמו" value={loadingData ? "…" : beeStatsError ? "-" : beeStats.completed} to="/my-tasks?tab=performing" />
                  <StatCard icon={Wallet} label="הכנסות" value={loadingData ? "…" : beeStatsError ? "-" : formatCurrency(beeStats.totalEarnings)} />
                  <StatCard icon={Star} label="דירוג ממוצע" value={loadingData || average === null ? "-" : average.toFixed(1)} suffix={average === null ? undefined : "מתוך 5"} />
                </div>
                {average !== null && average >= 4.5 && (
                  <div className="flex items-center gap-3 rounded-xl border border-primary-soft-border bg-primary-soft p-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-soft-border text-primary-ink"><Trophy size={20} aria-hidden="true" /></span>
                    <div>
                      <p className="font-bold text-foreground">מעולה!</p>
                      <p className="text-sm text-foreground">הדירוג שלך גבוה.</p>
                    </div>
                  </div>
                )}
              </div>
              {beeStatsError && <p role="alert" className="text-sm text-destructive">נתוני הביצוע וההכנסות לא נטענו. יש לרענן ולנסות שוב.</p>}
              {!beeStatsError && (beeStats.estimatedEarnings || beeStats.missingHours) && (
                <p className="text-xs text-muted-foreground">
                  הסכום כולל רק משימות שהושלמו. תשלום שעתי מחושב לפי משך המשימה המשוער.
                  {beeStats.missingHours && " משימות שעתיות ללא משך אינן כלולות בסכום."}
                </p>
              )}

              <div className="rounded-2xl bg-card p-4 shadow-card">
                <h2 className="mb-3 text-lg font-bold text-foreground">המטלות שלי</h2>
                <nav aria-label="המטלות שלי" className="space-y-2">
                  {[
                    { to: "/my-tasks?tab=applications", label: "מועמדויות" },
                    { to: "/my-tasks?tab=published", label: "מטלות פתוחות" },
                    { to: "/my-tasks?tab=performing", label: "מטלות שביצעתי" },
                    { to: "/tasks", label: "חיפוש מטלות" },
                  ].map((row) => (
                    <Link key={row.label} to={row.to} className="flex min-h-[46px] items-center justify-between rounded-lg border border-border px-4 text-sm text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span>{row.label}</span>
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  ))}
                </nav>
              </div>
            </>
          );
        })()}

        <Card className="border-border shadow-card">
          <div className="flex items-center gap-3 p-4">
            <Sparkle className="h-6 w-6 shrink-0 text-primary-ink" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-foreground">דירוגים וביקורות שקיבלתי</h2>
              {receivedReviews.length === 0 && <p className="text-sm text-muted-foreground">עדיין אין ביקורות שאושרו</p>}
            </div>
            <Button type="button" variant="outline" size="sm" aria-expanded={showAllRatings} onClick={() => setShowAllRatings((v) => !v)} className="shrink-0 rounded-full border-border bg-card px-3 text-xs font-medium text-muted-foreground hover:bg-muted">
              לכל הדירוגים
            </Button>
          </div>
          {(showAllRatings || receivedReviewsError) && (
          <CardContent className="pt-0">
            {loadingData ? <p className="text-sm text-muted-foreground">טוענים ביקורות...</p> : receivedReviewsError ? (
              <p role="alert" className="text-sm text-destructive">לא הצלחנו לטעון את הביקורות. יש לרענן ולנסות שוב.</p>
            ) : receivedReviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">עדיין אין ביקורות שאושרו.</p>
            ) : (
              <>
              <div className="mb-4 space-y-1" aria-label="התפלגות הדירוגים שקיבלתי">
                {[5, 4, 3, 2, 1].map((stars) => {
                  const count = receivedReviews.filter((review) => review.rating === stars).length;
                  return <div key={stars} className="flex items-center gap-2 text-xs text-muted-foreground"><span className="w-3">{stars}</span><Star size={12} className="fill-yellow-400 text-yellow-500" aria-hidden="true" /><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-yellow-400" style={{ width: `${count / receivedReviews.length * 100}%` }} /></div><span className="w-5 text-end tabular-nums">{count}</span></div>;
                })}
              </div>
              <div className="mb-4 flex flex-wrap gap-3 text-sm">
                <label>מיון <select value={receivedSort} onChange={(event) => setReceivedSort(event.target.value)} className="rounded-lg border border-border bg-background px-2 py-1"><option value="newest">החדשות ביותר</option><option value="highest">הגבוהות ביותר</option><option value="lowest">הנמוכות ביותר</option></select></label>
                <label>סינון <select value={receivedFilter} onChange={(event) => setReceivedFilter(event.target.value)} className="rounded-lg border border-border bg-background px-2 py-1"><option value="all">כל הדירוגים</option>{[5, 4, 3, 2, 1].map((stars) => <option key={stars} value={stars}>{stars} כוכבים</option>)}</select></label>
              </div>
              <ul className="space-y-3">
                {[...receivedReviews].filter((review) => receivedFilter === "all" || review.rating === Number(receivedFilter)).sort((a, b) => receivedSort === "highest" ? b.rating - a.rating : receivedSort === "lowest" ? a.rating - b.rating : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((review) => (
                  <li key={review.id} className="rounded-2xl bg-muted/50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-amber-500" aria-label={`${review.rating} מתוך 5 כוכבים`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span>
                      <time className="text-xs text-muted-foreground" dateTime={review.created_at}>{formatDate(review.created_at)}</time>
                    </div>
                    {review.body && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">{review.body}</p>}
                    <ReviewTags tags={review.tags} />
                    <ReviewResponseEditor key={`${review.id}:${receivedResponses.find((response) => response.review_id === review.id)?.body ?? ""}`} reviewId={review.id} response={receivedResponses.find((response) => response.review_id === review.id)} onSaved={() => void loadReceivedReviews()} />
                  </li>
                ))}
              </ul>
              </>
            )}
          </CardContent>
          )}
        </Card>

        {!isAdmin && <DeleteAccountCard />}
        {/* The design ends here; what follows is not drawn and stays below it. */}
        <Card className="border-border overflow-hidden shadow-card">
          <div className="flex justify-end px-4 pt-4">
            {!editing ? (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="rounded-full font-medium px-3">
                <Edit3 className="w-4 h-4 ml-1" /> עריכה
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} disabled={saving} className="rounded-full font-medium">
                  <Save className="w-4 h-4 ml-1" /> {saving ? "שומר..." : "שמור"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="rounded-full" aria-label="ביטול עריכה">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          <CardContent className="pt-3 pb-5">

            {editing ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="profile-first-name" className="text-xs text-muted-foreground">שם פרטי</Label>
                  <Input id="profile-first-name" autoComplete="given-name" value={form.first_name} onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="profile-last-name" className="text-xs text-muted-foreground">שם משפחה</Label>
                  <Input id="profile-last-name" autoComplete="family-name" value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))} />
                </div>
                <p className="col-span-2 text-xs text-muted-foreground">לתיקון תאריך הלידה אפשר לפנות לתמיכה.</p>
                <div className="col-span-2">
                  <Label id="profile-gender-label" className="text-xs text-muted-foreground">מין</Label>
                  {/* Drives how every email and notification addresses this
                      person. "מעדיפ/ה לא לציין" reads in the plural. */}
                  <div role="radiogroup" aria-labelledby="profile-gender-label" className="mt-1 grid grid-cols-3 gap-2">
                    {GENDER_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={form.gender === option}
                        onClick={() => setForm(p => ({ ...p, gender: option }))}
                        className={`h-10 rounded-xl border-2 px-2 text-sm font-bold transition-colors ${
                          form.gender === option
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-background text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {GENDER_LABEL[option]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label htmlFor="profile-phone" className="text-xs text-muted-foreground">טלפון</Label>
                  <Input id="profile-phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} dir="ltr" />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="profile-address" className="text-xs text-muted-foreground">כתובת</Label>
                  <Input id="profile-address" autoComplete="street-address" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} onBlur={handleAddressBlur} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void handleAddressBlur(); } }} />
                  {addressLoading && <p className="mt-1 text-xs text-muted-foreground">מאתר את הכתובת...</p>}
                  <div className="mt-3">
                    <GoogleMapPicker
                      lat={addressPosition?.lat ?? null}
                      lng={addressPosition?.lng ?? null}
                      onLocationSelect={(lat, lng) => setAddressPosition({ lat, lng })}
                      onAddressFound={(address) => setForm((current) => ({ ...current, address }))}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 text-sm">
                {form.age && <div><span className="text-muted-foreground">גיל:</span> <span className="font-semibold">{form.age}</span></div>}
                {form.phone && <div><span className="text-muted-foreground">טלפון:</span> <span className="font-semibold" dir="ltr">{form.phone}</span></div>}
                {form.address && <div className="col-span-2"><span className="text-muted-foreground">כתובת:</span> <span className="font-semibold">{form.address}</span></div>}
                <div className="col-span-2"><span className="text-muted-foreground">אימייל:</span> <span className="font-semibold" dir="ltr">{user.email}</span></div>
              </div>
            )}
          </CardContent>
        </Card>

        {isBee && (
          <Card className="overflow-hidden border-border shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-bold">
                <Mail className="h-5 w-5 text-primary-ink" />
                עדכונים להורה
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                מוסיפים את המייל של ההורה, והוא/היא יקבלו עדכון כשאתם מתחברים. ההורה לא צריך/ה
                להירשם או לפתוח חשבון. אפשר עד 3 כתובות, ולהסיר בכל רגע.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Someone holding your share link asked to be added. Nothing was
                  sent to them and nothing will be until you say so. */}
              {parentRequests.length > 0 && (
                <ul className="space-y-2">
                  {parentRequests.map((request) => (
                    <li
                      key={request.id}
                      className="rounded-xl border-2 border-primary/40 bg-primary/5 px-3 py-2 space-y-2"
                    >
                      <div>
                        <p className="text-sm font-bold text-foreground">בקשה לקבל עדכונים</p>
                        <p dir="ltr" className="truncate text-sm text-muted-foreground">
                          {request.email}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={decidingRequest === request.id}
                          onClick={() => void decideParentRequest(request, true)}
                          className="rounded-full font-bold"
                        >
                          אישור
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={decidingRequest === request.id}
                          onClick={() => void decideParentRequest(request, false)}
                          className="rounded-full font-bold text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          דחייה
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {parentContacts.length > 0 && (
                <ul className="space-y-2">
                  {parentContacts.map((contact) => (
                    <li
                      key={contact.id}
                      className="rounded-xl border border-border bg-muted/50 px-3 py-2 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span dir="ltr" className="truncate text-sm font-semibold">{contact.email}</span>
                      </div>
                      <ParentShareLink viewToken={contact.view_token} />
                    </li>
                  ))}
                </ul>
              )}

              {parentContacts.length < 3 ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="new-parent-email"
                    type="email"
                    dir="ltr"
                    value={newParentEmail}
                    onChange={(e) => setNewParentEmail(e.target.value)}
                    placeholder="parent@example.com"
                    className="h-11 rounded-xl"
                  />
                  <Button
                    type="button"
                    disabled={savingParentContact || !newParentEmail.trim()}
                    onClick={() => void addParentContact()}
                    className="min-h-11 shrink-0 rounded-xl font-bold"
                  >
                    <Mail className="h-4 w-4" />
                    {savingParentContact ? "שומר..." : "הוספת הורה"}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  הגעתם למקסימום של 3 כתובות. כדי להוסיף אחרת, צריך להסיר אחת קודם.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {reviewHistory.length > 0 && (
          <Card className="border-border shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-bold">
                <Star className="h-5 w-5 fill-yellow-400 text-yellow-500" />
                הדירוגים שנתתי
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {reviewHistory.map((review) => (
                <div key={review.id} className="rounded-2xl bg-muted/50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold">{review.task_name}</span>
                    <span className="text-amber-500" aria-label={`${review.rating} מתוך 5 כוכבים`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span>
                  </div>
                  {review.body && <p className="mt-1 text-sm text-muted-foreground">{review.body}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{review.status === "pending" ? (review.screening === "pending_ai" ? "נבדקת אוטומטית" : "ממתינה לבדיקה של אדם") : review.status === "rejected" ? "לא אושר" : review.published_at ? "פורסם" : "אושר וממתין לפרסום הדדי"}</p>
                  {review.status === "rejected" && review.rejection_reason && <p className="mt-1 text-sm text-muted-foreground">סיבת ההחלטה: {review.rejection_reason}</p>}
                  {review.status === "rejected" && <ReviewAppeal reviewId={review.id} />}
                  {!review.published_at && <Button type="button" variant="outline" size="sm" className="mt-2 rounded-full" onClick={() => setEditingReview(review)}>עריכת הדירוג</Button>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        {editingReview && <ReviewDialog open onClose={() => setEditingReview(null)} onSubmitted={() => void loadReviewHistory()}
          taskId={editingReview.task_id} taskName={editingReview.task_name} revieweeId="" revieweeName=""
          initialReview={{ id: editingReview.id, rating: editingReview.rating, body: editingReview.body, tags: editingReview.tags }} />}
        <ReviewReportsPanel />
        <PasswordCard />
      </div>
    </div>
  );
};

function StatCard({ icon: Icon, label, value, suffix, to }: { icon: LucideIcon; label: string; value: string | number; suffix?: string; to?: string }) {
  /* Tile as drawn on "האיזור שלי": soft lilac-grey tile, label at the start and a
     thin line icon at the end, the number large underneath. */
  const card = (
    <div className={`h-full rounded-xl bg-secondary px-4 py-2.5 text-start ${to ? "transition-colors hover:bg-muted" : ""}`}>
      <div className="flex items-center justify-between gap-2 text-sm text-foreground">
        <span>{label}</span>
        <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
      </div>
      <p className="mt-2 flex items-baseline gap-2 text-2xl font-bold leading-none text-foreground tabular-nums">
        {value}
        {suffix && <span className="text-sm font-normal text-muted-foreground">{suffix}</span>}
      </p>
    </div>
  );

  // A number the person cannot act on is a dead end; where the figure has a
  // page behind it, the tile is the way in.
  return to ? (
    <Link to={to} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {card}
    </Link>
  ) : (
    card
  );
}

export default Profile;
