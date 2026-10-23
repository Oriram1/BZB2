import PaymentSummaryDialog from "@/components/billing/PaymentSummaryDialog";
import { openPaymentTab, PAYMENT_POPUP_BLOCKED, PAYMENT_TAB_OPENED } from "@/lib/paymentTab";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, Eye, MessageCircle, Pencil, Plus, Star, UserRound, Users, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ensureAcceptedTaskConversation } from "@/lib/taskConversations";
import { logUserActivity } from "@/lib/activityLog";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { formatDateTime } from "@/lib/format";
import ReviewDialog from "@/components/reviews/ReviewDialog";
import {
  billingErrorText,
  payTaskWithNewCard,
  payTaskOnce,
  publishStateLabel,
  resubmitTask,
  retryTaskPayment,
  type TaskPublishState,
} from "@/lib/taskBilling";

type ApplicationStatus = "pending" | "accepted" | "rejected";
/** The task_status enum, so a screen cannot invent a state the database rejects. */
type TaskStatus = Database["public"]["Enums"]["task_status"];

interface PublishedTask {
  id: string;
  name: string;
  short_desc: string;
  views_count: number;
  status: TaskStatus;
  workers_needed: number;
  publish_state: TaskPublishState;
  payment_due: number;
  payment_mode: string;
  charged_at: string | null;
}

interface CandidateApplication {
  id: string;
  taskId: string;
  taskName: string;
  /** From the task, so a candidate card can say how many positions are left. */
  workersNeeded: number;
  applicantId: string;
  status: ApplicationStatus;
  firstName: string;
  lastName: string;
  age: number | null;
  avatarUrl: string | null;
  completedTasks: number;
  taskStatus: TaskStatus;
}

interface PerformingTask {
  applicationId: string;
  creatorId: string;
  applicationStatus: ApplicationStatus;
  id: string;
  name: string;
  shortDesc: string;
  status: TaskStatus;
  scheduledDate: string | null;
  scheduledTime: string | null;
  location: string;
}

const taskStatusLabel = (status: TaskStatus) => {
  if (status === "open") return "פתוחה";
  if (status === "accepted") return "התקבלה";
  if (status === "in_progress") return "בביצוע";
  if (status === "completed") return "הושלמה";
  return "בוטלה";
};

const applicationStatusLabel: Record<ApplicationStatus, string> = {
  pending: "ממתינה להחלטה",
  accepted: "התקבלה",
  rejected: "לא התקבלה",
};

const MyTasks = () => {
  const { user, roles } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isTasker = roles.includes("tasker");
  const isBee = roles.includes("bee");
  const [publishedTasks, setPublishedTasks] = useState<PublishedTask[]>([]);
  const [applications, setApplications] = useState<CandidateApplication[]>([]);
  const [performingTasks, setPerformingTasks] = useState<PerformingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentSummary, setPaymentSummary] = useState<{ task: PublishedTask; oneTime: boolean; bit?: boolean } | null>(null);
  const [submittedReviews, setSubmittedReviews] = useState<Set<string>>(new Set());
  const [actionId, setActionId] = useState<string | null>(null);

  const pendingCount = useMemo(
    () => applications.filter((application) => application.status === "pending").length,
    [applications],
  );

  /** Only a task with someone working on it can be completed — see complete_task. */
  const acceptedByTask = useMemo(() => {
    const counts = new Map<string, number>();
    for (const application of applications) {
      if (application.status !== "accepted") continue;
      counts.set(application.taskId, (counts.get(application.taskId) ?? 0) + 1);
    }
    return counts;
  }, [applications]);

  /**
   * What the account actually has, not what role it currently holds.
   *
   * switch_my_role exchanges tasker for bee, but published tasks and submitted
   * applications stay with the account and RLS still permits both. Hiding a tab
   * behind the current role is what left a switched publisher with no way to
   * accept anyone.
   */
  const managesTasks = isTasker || publishedTasks.length > 0;
  const performsTasks = isBee || performingTasks.length > 0;

  const requestedTab = searchParams.get("tab");
  const activeTab = requestedTab === "applications" && managesTasks
    ? "applications"
    : requestedTab === "performing" && performsTasks
      ? "performing"
      : requestedTab === "published" && managesTasks
        ? "published"
        : managesTasks
          ? "applications"
          : "performing";

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let loadVersion = 0;

    const load = async () => {
      const version = ++loadVersion;
      setLoading(true);

      const { data: reviews, error: reviewsError } = await supabase.from("reviews")
        .select("task_id, reviewee_id").eq("reviewer_id", user.id);
      if (reviewsError) toast.error("לא הצלחנו לטעון את הדירוגים הקודמים");
      if (!cancelled && version === loadVersion && reviews) setSubmittedReviews(new Set(reviews.map((review) => `${review.task_id}:${review.reviewee_id}`)));

      const nextPublishedTasks: PublishedTask[] = [];
      const nextApplications: CandidateApplication[] = [];
      const nextPerformingTasks: PerformingTask[] = [];

      // Loaded for everyone, not just accounts currently holding the role.
      // switch_my_role swaps tasker for bee but leaves published tasks owned by
      // the account, and RLS still lets the owner manage them — gating the fetch
      // on the role is what made those tasks unreachable.
      {
        const { data: taskRows, error: taskError } = await supabase
          .from("tasks")
          .select("id, name, short_desc, views_count, status, workers_needed, publish_state, payment_due, payment_mode, charged_at")
          .eq("creator_id", user.id)
          .is("archived_at", null)
          .order("created_at", { ascending: false });

        if (taskError) {
          toast.error("לא הצלחנו לטעון את המטלות שפרסמתם");
        } else {
          nextPublishedTasks.push(...((taskRows ?? []) as unknown as PublishedTask[]));

          const applicationGroups = await Promise.all(
            (taskRows ?? []).map(async (task) => {
              const { data: applicationRows } = await supabase
                .from("task_applications")
                .select("id, status, applicant_id")
                .eq("task_id", task.id)
                .is("archived_at", null);

              return Promise.all(
                (applicationRows ?? []).map(async (application) => {
                  const [{ data: profile }, { data: completedTasks }] = await Promise.all([
                    supabase
                      .from("profiles")
                      .select("first_name, last_name, age, avatar_url")
                      .eq("user_id", application.applicant_id)
                      .single(),
                    supabase.rpc("get_worker_completed_task_count", { _user_id: application.applicant_id }),
                  ]);

                  return {
                    id: application.id,
                    taskId: task.id,
                    taskName: task.name,
                    workersNeeded: task.workers_needed,
                    applicantId: application.applicant_id,
                    status: application.status,
                    firstName: profile?.first_name ?? "",
                    lastName: profile?.last_name ?? "",
                    age: profile?.age ?? null,
                    avatarUrl: profile?.avatar_url ?? null,
                    completedTasks: completedTasks ?? 0,
                    taskStatus: task.status,
                  } satisfies CandidateApplication;
                }),
              );
            }),
          );

          nextApplications.push(...applicationGroups.flat());
        }
      }

      // Same reasoning as above, in the other direction: someone who applied to
      // tasks and then switched to tasker still has work to show up for.
      {
        const { data: ownApplications } = await supabase
          .from("task_applications")
          .select("id, status, task_id")
          .eq("applicant_id", user.id)
          .is("archived_at", null);

        const taskGroups = await Promise.all(
          (ownApplications ?? []).map(async (application) => {
            const { data: task } = await supabase
              .from("tasks")
              .select("id, creator_id, name, short_desc, status, scheduled_date, scheduled_time, location")
              .eq("id", application.task_id)
              .is("archived_at", null)
              .maybeSingle();

            if (!task) return null;
            return {
              applicationId: application.id,
              creatorId: task.creator_id,
              applicationStatus: application.status,
              id: task.id,
              name: task.name,
              shortDesc: task.short_desc,
              status: task.status,
              scheduledDate: task.scheduled_date,
              scheduledTime: task.scheduled_time,
              location: task.location,
            } satisfies PerformingTask;
          }),
        );

        nextPerformingTasks.push(...taskGroups.filter((task): task is PerformingTask => task !== null));
      }

      if (!cancelled && version === loadVersion) {
        setPublishedTasks(nextPublishedTasks);
        setApplications(nextApplications.sort((a, b) => Number(a.status !== "pending") - Number(b.status !== "pending")));
        setPerformingTasks(nextPerformingTasks);
        setLoading(false);
      }
    };

    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [user]);

  useEffect(() => {
    if (loading) return;
    const applicationId = searchParams.get("application");
    if (!applicationId) return;
    window.requestAnimationFrame(() => {
      document.getElementById(`application-${applicationId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [loading, searchParams]);

  const changeTab = (tab: string) => {
    setSearchParams({ tab });
  };

  const updateApplicationStatus = async (application: CandidateApplication, status: "accepted" | "rejected") => {
    setActionId(application.id);
    const { error } = await supabase
      .from("task_applications")
      .update({ status })
      .eq("id", application.id)
      .is("archived_at", null);

    if (error) {
      toast.error(
        error.message.includes("task_positions_full")
          ? "כל המקומות במטלה כבר תפוסים"
          : "לא הצלחנו לעדכן את המועמדות",
      );
      setActionId(null);
      return;
    }

    logUserActivity(user?.id, status === "accepted" ? "application_accepted" : "application_rejected", {
      entityType: "task_application",
      entityId: application.id,
      details: { taskId: application.taskId, applicantId: application.applicantId },
    });

    setApplications((current) => current.map((item) => item.id === application.id ? { ...item, status } : item));

    if (status === "rejected") {
      toast.success("המועמדות נדחתה");
      setActionId(null);
      return;
    }

    try {
      const conversationId = await ensureAcceptedTaskConversation(application.taskId, application.applicantId);
      toast.success("המועמדות אושרה והשיחה נפתחה");
      navigate(`/chat?conversation=${conversationId}`);
    } catch {
      toast.error("המועמדות אושרה, אך פתיחת הצ׳אט נכשלה. אפשר לנסות שוב מכפתור הצ׳אט");
      setActionId(null);
    }
  };

  const openAcceptedConversation = async (application: CandidateApplication) => {
    setActionId(application.id);
    try {
      const conversationId = await ensureAcceptedTaskConversation(application.taskId, application.applicantId);
      navigate(`/chat?conversation=${conversationId}`);
    } catch {
      toast.error("לא הצלחנו לפתוח את השיחה");
      setActionId(null);
    }
  };

  const [payingTask, setPayingTask] = useState<string | null>(null);

  const setPublishState = (taskId: string, publish_state: TaskPublishState) =>
    setPublishedTasks((current) => current.map((t) => (t.id === taskId ? { ...t, publish_state } : t)));

  /** Charges the saved card again for a task that was approved but not paid. */
  const retryPayment = async (task: PublishedTask) => {
    setPayingTask(task.id);
    const result = await retryTaskPayment(task.id);
    setPayingTask(null);
    if (!result.ok) {
      toast.error(billingErrorText(result.code));
      return;
    }
    setPublishState(task.id, result.data.state);
    if (result.data.state === "live") toast.success("התשלום עבר והמטלה פורסמה 🐝");
    else toast.error("החיוב נדחה. אפשר לנסות כרטיס אחר");
  };

  /** Opens Cardcom's page to pay this task with a different card. */
  const payWithOtherCard = async (task: PublishedTask, oneTime = false, bit = false) => {
    const paymentTab = openPaymentTab();
    if (!paymentTab) { toast.error(PAYMENT_POPUP_BLOCKED); return; }
    setPayingTask(task.id);
    const result = await (oneTime ? payTaskOnce(task.id, bit ? "bit" : "wallet") : payTaskWithNewCard(task.id));
    if (!result.ok) {
      paymentTab.close();
      setPayingTask(null);
      toast.error(billingErrorText(result.code), result.code === "session_expired" ? {
        action: { label: "כניסה מחדש", onClick: () => navigate("/login", { state: { from: "/my-tasks?tab=published" } }) },
      } : undefined);
      return;
    }
    const opened = paymentTab.navigate(result.url);
    setPayingTask(null);
    setPaymentSummary(null);
    if (opened) toast.info(PAYMENT_TAB_OPENED);
    else toast.error("דף התשלום נסגר או לא זמין. אפשר לנסות שוב.");
  };

  const sendAgain = async (task: PublishedTask) => {
    setPayingTask(task.id);
    const result = await resubmitTask(task.id);
    setPayingTask(null);
    if (!result.ok) {
      toast.error(billingErrorText(result.code));
      return;
    }
    setPublishState(task.id, "pending_review");
    toast.success("המטלה נשלחה שוב לאישור");
  };

  const [confirmTask, setConfirmTask] = useState<PublishedTask | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{ taskId: string; taskName: string; revieweeId: string; revieweeName: string } | null>(null);
  /** Kept apart from `confirmTask`: closing a task and deleting it are different decisions. */
  const [confirmComplete, setConfirmComplete] = useState<PublishedTask | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; id: string } | null>(null);

  const handleTouchStart = (e: React.TouchEvent, taskId: string) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, id: taskId };
  };

  const handleTouchEnd = (e: React.TouchEvent, task: PublishedTask) => {
    if (!touchStartRef.current || touchStartRef.current.id !== task.id) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = Math.abs(touch.clientY - touchStartRef.current.y);
    if (dx > 80 && dy < 50) {
      setConfirmTask(task);
    }
    touchStartRef.current = null;
  };

  const cancelTask = async (task: PublishedTask) => {
    const { error } = await supabase.rpc("cancel_task", { _task_id: task.id });
    if (error) {
      toast.error(
        error.message.includes("task_completed")
          ? "המטלה כבר הושלמה, אז אי אפשר לבטל אותה"
          : "לא הצלחנו לבטל את המטלה",
      );
      return;
    }

    setPublishedTasks((current) =>
      current.map((t) => (t.id === task.id ? { ...t, status: "cancelled" } : t)),
    );
    logUserActivity(user?.id, "task_cancelled", { entityType: "task", entityId: task.id, details: { name: task.name } });
    toast.success("המטלה בוטלה");
  };

  /** What the database refuses, said in the words the tasker used to get here. */
  const completionError: Record<string, string> = {
    no_accepted_worker: "אפשר לסמן מטלה כהושלמה רק אחרי שנבחר לה עובד",
    task_cancelled: "המטלה בוטלה, אז אי אפשר לסמן אותה כהושלמה",
  };

  const completeTask = async (task: PublishedTask) => {
    const { error } = await supabase.rpc("complete_task", { _task_id: task.id });
    if (error) {
      const reason = Object.keys(completionError).find((key) => error.message.includes(key));
      toast.error(reason ? completionError[reason] : "לא הצלחנו לסמן את המטלה כהושלמה");
      return;
    }

    setPublishedTasks((current) =>
      current.map((t) => (t.id === task.id ? { ...t, status: "completed" } : t)),
    );
    setApplications((current) => current.map((application) => application.taskId === task.id ? { ...application, taskStatus: "completed" } : application));
    logUserActivity(user?.id, "task_completed", { entityType: "task", entityId: task.id, details: { name: task.name } });
    toast.success("המטלה סומנה כהושלמה. התשלום נרשם לעובדים שביצעו אותה");

    // Prompt publisher to review accepted workers
    const accepted = applications.filter((a) => a.taskId === task.id && a.status === "accepted");
    if (accepted.length > 0) {
      setReviewTarget({
        taskId: task.id,
        taskName: task.name,
        revieweeId: accepted[0].applicantId,
        revieweeName: `${accepted[0].firstName} ${accepted[0].lastName}`.trim(),
      });
    }
  };

  const archiveTask = async (task: PublishedTask) => {
    const { error } = await supabase.rpc("archive_task", { _task_id: task.id, _user_id: user!.id });
    if (error) {
      toast.error("לא הצלחנו למחוק את המטלה");
      return;
    }

    setPublishedTasks((current) => current.filter((t) => t.id !== task.id));
    setApplications((current) => current.filter((a) => a.taskId !== task.id));
    logUserActivity(user!.id, "task_deleted", { entityType: "task", entityId: task.id, details: { name: task.name } });
    toast.success("המטלה הועברה לארכיון");
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-muted relative" dir="rtl">
      <div className="absolute top-40 right-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
      <PageHeader
        title="המטלות שלי"
        titleIsPageHeading
        action={isTasker ? (
          <Button size="sm" className="rounded-full bg-white text-slate-950 hover:bg-white/90 font-black shadow-md gap-1.5" asChild>
<Link to="/create-task"><Plus size={16} aria-hidden="true" />
              פרסום מטלה</Link>
</Button>
        ) : undefined}
      />

      <div className="max-w-3xl mx-auto py-5 px-4 relative z-10">
        <Tabs value={activeTab} onValueChange={changeTab} dir="rtl">
          <TabsList className={`grid w-full h-auto rounded-2xl bg-card border border-border p-1 ${managesTasks && performsTasks ? "grid-cols-3" : managesTasks ? "grid-cols-2" : "grid-cols-1"}`}>
            {managesTasks && (
              <TabsTrigger value="applications" className="relative min-h-11 rounded-xl font-bold gap-1.5">
                מועמדויות
                {pendingCount > 0 && (
                  <Badge className="h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground border-0">
                    {pendingCount}
                  </Badge>
                )}
              </TabsTrigger>
            )}
            {managesTasks && <TabsTrigger value="published" className="min-h-11 rounded-xl font-bold">מטלות שפרסמתי</TabsTrigger>}
            {performsTasks && <TabsTrigger value="performing" className="min-h-11 rounded-xl font-bold">מטלות שאני מבצע</TabsTrigger>}
          </TabsList>

          {managesTasks && (
            <TabsContent value="applications" className="mt-4 space-y-3">
              {loading ? (
                <p className="py-12 text-center text-muted-foreground">טוען מועמדויות…</p>
              ) : applications.length === 0 ? (
                <div className="rounded-3xl border border-border bg-card p-8 text-center">
                  <UserRound className="mx-auto mb-3 text-muted-foreground" aria-hidden="true" />
                  <p className="font-bold">אין מועמדויות עדיין</p>
                  <p className="text-sm text-muted-foreground mt-1">מועמדויות חדשות יופיעו כאן.</p>
                </div>
              ) : applications.map((application) => {
                const fullName = `${application.firstName} ${application.lastName}`.trim() || "משתמש";
                const highlighted = searchParams.get("application") === application.id;
                const taken = acceptedByTask.get(application.taskId) ?? 0;
                const full = taken >= application.workersNeeded;
                return (
                  <article
                    id={`application-${application.id}`}
                    key={application.id}
                    className={`rounded-3xl border bg-card p-4 shadow-sm transition-shadow ${highlighted ? "border-primary ring-2 ring-primary/20" : "border-border"}`}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="h-14 w-14 border border-border shrink-0">
                        <AvatarImage src={application.avatarUrl ?? undefined} alt={fullName} />
                        <AvatarFallback>{application.firstName.slice(0, 1) || "🐝"}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-extrabold text-foreground">{fullName}</h2>
                          {application.age && <span className="text-sm text-muted-foreground">גיל {application.age}</span>}
                          <Badge variant={application.status === "accepted" ? "default" : "secondary"} className="rounded-full">
                            {applicationStatusLabel[application.status]}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link to={`/task/${application.taskId}`} className="text-sm text-primary-ink font-semibold hover:underline">
                            {application.taskName}
                          </Link>
                          {/* The number the approval decision actually turns on. */}
                          <Badge
                            variant={full ? "default" : "outline"}
                            className="rounded-full text-[11px] font-bold tabular-nums"
                          >
                            <Users size={11} className="ms-1" aria-hidden="true" />
                            {taken}/{application.workersNeeded} נבחרו
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><Check size={13} /> {application.completedTasks} מטלות שהושלמו</span>
                          <Link to={`/profile/${application.applicantId}`} className="inline-flex items-center gap-1 hover:underline"><Star size={13} /> דירוגים בפרופיל</Link>
                        </div>
                      </div>
                    </div>

                    {/* A greyed-out approval button with no reason next to it reads
                        as a broken screen rather than a full task. */}
                    {full && application.status === "pending" && (
                      <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                        כל המקומות במטלה תפוסים. כדי לקבל מועמד אחר צריך קודם לדחות מישהו שכבר נבחר.
                      </p>
                    )}

                    <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                      <Button asChild variant="outline" className="rounded-full font-bold">
                        <Link to={`/profile/${application.applicantId}`}>צפייה בפרופיל</Link>
                      </Button>
                      {application.status === "pending" && (
                        <>
                          <Button
                            onClick={() => updateApplicationStatus(application, "accepted")}
                            disabled={actionId === application.id || full}
                            title={full ? "כל המקומות במטלה תפוסים" : undefined}
                            className="rounded-full gradient-honey text-primary-foreground font-bold gap-1"
                          >
                            <Check size={16} /> אישור וקבלה
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => updateApplicationStatus(application, "rejected")}
                            disabled={actionId === application.id}
                            className="rounded-full font-bold text-destructive hover:text-destructive gap-1 col-span-2 sm:col-auto"
                          >
                            <X size={16} /> דחייה
                          </Button>
                        </>
                      )}
                      {application.status === "accepted" && application.taskStatus === "completed" && (
                        <Button variant="outline" className="rounded-full font-bold"
                          disabled={submittedReviews.has(`${application.taskId}:${application.applicantId}`)}
                          onClick={() => setReviewTarget({ taskId: application.taskId, taskName: application.taskName,
                            revieweeId: application.applicantId, revieweeName: `${application.firstName} ${application.lastName}`.trim() })}>
                          <Star size={16} className="ms-1" />
                          {submittedReviews.has(`${application.taskId}:${application.applicantId}`) ? "הדירוג נשלח" : "דירוג העובד"}
                        </Button>
                      )}
                      {application.status === "accepted" && application.taskStatus !== "completed" && application.taskStatus !== "cancelled" && (
                        <Button
                          onClick={() => openAcceptedConversation(application)}
                          disabled={actionId === application.id}
                          className="rounded-full gradient-honey text-primary-foreground font-bold gap-1"
                        >
                          <MessageCircle size={16} /> מעבר לצ׳אט
                        </Button>
                      )}
                      {application.status === "accepted" && application.taskStatus !== "completed" && application.taskStatus !== "cancelled" && (
                        <Button variant="outline" className="rounded-full font-bold" onClick={() => {
                          const task = publishedTasks.find((item) => item.id === application.taskId);
                          if (task) setConfirmComplete(task);
                        }}>
                          <Check size={16} className="ms-1" /> סמן כהושלמה
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </TabsContent>
          )}

          {managesTasks && (
            <TabsContent value="published" className="mt-4 space-y-3">
              {loading ? (
                <p className="py-12 text-center text-muted-foreground">טוען מטלות…</p>
              ) : publishedTasks.length === 0 ? (
                <div className="rounded-3xl border border-border bg-card p-8 text-center">
                  <p className="font-bold">עדיין לא פרסמתם מטלות</p>
                  <Button className="mt-4 rounded-full gradient-honey text-primary-foreground" asChild>
<Link to="/create-task">פרסום מטלה</Link>
</Button>
                </div>
              ) : publishedTasks.map((task) => {
                const closed = task.status === "completed" || task.status === "cancelled";
                const canComplete = !closed && (acceptedByTask.get(task.id) ?? 0) > 0;

                return (
                  <article
                    key={task.id}
                    className="rounded-3xl border border-border bg-card p-5 shadow-sm touch-pan-y"
                    onTouchStart={(e) => handleTouchStart(e, task.id)}
                    onTouchEnd={(e) => handleTouchEnd(e, task)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Link to={`/task/${task.id}`} className="min-w-0 flex-1">
                        <h2 className="font-extrabold text-lg truncate">{task.name}</h2>
                        <p className="text-sm text-muted-foreground line-clamp-2">{task.short_desc}</p>
                      </Link>
                      {/* A closed task has to read as closed at a glance, or the
                          list looks identical before and after completing one. */}
                      <Badge
                        variant={closed || task.publish_state !== "live" ? "secondary" : undefined}
                        className={`rounded-full ${closed || task.publish_state !== "live" ? "" : "gradient-honey text-primary-foreground border-0"}`}
                      >
                        {task.publish_state === "live" ? taskStatusLabel(task.status) : publishStateLabel[task.publish_state]}
                      </Badge>
                    </div>
                    {task.publish_state === "pending_review" && (
                      <p className="mt-3 rounded-2xl bg-muted/60 p-3 text-sm text-foreground">
                        המטלה ממתינה לאישור. {Number(task.payment_due) > 0
                          ? task.payment_mode === "one_time"
                            ? task.charged_at
                              ? `שילמתם ${Number(task.payment_due)} ₪. המטלה תעלה מיד אחרי האישור, ואם לא תאושר הכסף יוחזר.`
                              : "אפשר לשלם כבר עכשיו, או לבחור אמצעי תשלום אחרי האישור. הכרטיס השמור לא יחויב אוטומטית."
                            : `הכרטיס יחויב ב־${Number(task.payment_due)} ₪ רק אחרי האישור, והמטלה תעלה אחרי שהחיוב עבר.`
                          : "היא תעלה לאפליקציה מיד אחרי האישור."}
                      </p>
                    )}
                    {task.publish_state === "pending_review" && task.payment_mode === "one_time" && !task.charged_at && Number(task.payment_due) > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" disabled={payingTask === task.id} onClick={() => setPaymentSummary({ task, oneTime: true })} className="rounded-full font-bold">
                          תשלום עכשיו
                        </Button>
                      </div>
                    )}
                    {(task.publish_state === "pending_payment" || task.publish_state === "awaiting_charge") && (
                      <div className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                        <p className="font-bold text-foreground">
                          {task.payment_mode === "one_time" ? `המטלה אושרה וממתינה לתשלום (${Number(task.payment_due)} ₪).` : `המטלה אושרה אבל החיוב (${Number(task.payment_due)} ₪) לא עבר.`}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {task.payment_mode === "one_time" ? "בחרו אמצעי תשלום כדי להשלים את הפרסום. הכרטיס השמור לא חויב." : "כדאי לנסות כרטיס אחר או לפנות לחברת האשראי."} אם לא ישולם תוך 7 ימים המטלה תחזור לטיוטה, בלי חיוב.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {task.payment_mode !== "one_time" && <><Button size="sm" disabled={payingTask === task.id} onClick={() => retryPayment(task)} className="rounded-full font-bold">
                            לנסות שוב
                          </Button>
                          <Button size="sm" variant="outline" disabled={payingTask === task.id} onClick={() => setPaymentSummary({ task, oneTime: false })} className="rounded-full font-bold">
                            לשלם בכרטיס אחר
                          </Button></>}
                          <Button size="sm" variant="outline" disabled={payingTask === task.id} onClick={() => setPaymentSummary({ task, oneTime: true })} className="rounded-full font-bold">
                            תשלום חד-פעמי
                          </Button>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">בתשלום חד-פעמי לא נשמר כרטיס. Apple Pay, Google Pay ו-Bit נבחרים בדף התשלום, בכפוף להפעלתם אצל חברת הסליקה ולתמיכת המכשיר.</p>
                      </div>
                    )}
                    {(task.publish_state === "draft" || task.publish_state === "rejected") && (
                      <div className="mt-3 rounded-2xl bg-muted/60 p-3 text-sm">
                        <p className="text-foreground">
                          {task.publish_state === "draft"
                            ? "לא התקבל תשלום והמטלה חזרה לטיוטה. לא חויבתם."
                            : "המטלה לא אושרה, ולא חויבתם."}
                        </p>
                        <Button size="sm" disabled={payingTask === task.id} onClick={() => sendAgain(task)} className="mt-2 rounded-full font-bold">
                          לשלוח שוב לאישור
                        </Button>
                      </div>
                    )}
                    {task.publish_state === "hidden" && (
                      <p className="mt-3 rounded-2xl bg-muted/60 p-3 text-sm text-foreground">
                        המטלה מוסתרת כי המנוי הסתיים. חידוש המנוי יחזיר אותה מיד.
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Eye size={15} /> {task.views_count} צפיות</span>
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Users size={15} /> {acceptedByTask.get(task.id) ?? 0}/{task.workers_needed} נבחרו
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {canComplete && (
                          <Button
                            size="sm"
                            onClick={() => setConfirmComplete(task)}
                            className="rounded-full gradient-honey text-primary-foreground font-bold gap-1"
                          >
                            <Check size={15} /> סמן כהושלמה
                          </Button>
                        )}
                        <Button variant="outline" size="sm" className="rounded-full font-bold" asChild>
<Link to={`/task/${task.id}`}>לפרטי המטלה</Link>
</Button>
                        {!closed && (
                          <Button variant="outline" size="sm" className="rounded-full font-bold gap-1" asChild>
<Link to={`/task/${task.id}`} state={{ openEdit: true }}><Pencil size={14} />עריכה</Link>
</Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmTask(task)}
                          className="rounded-full text-destructive font-bold"
                        >
                          {closed ? "מחיקה" : "ביטול / מחיקה"}
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </TabsContent>
          )}

          {performsTasks && (
            <TabsContent value="performing" className="mt-4 space-y-3">
              {loading ? (
                <p className="py-12 text-center text-muted-foreground">טוען מטלות…</p>
              ) : performingTasks.length === 0 ? (
                <div className="rounded-3xl border border-border bg-card p-8 text-center">
                  <p className="font-bold">עדיין לא הגשתם מועמדות</p>
                  <Button className="mt-4 rounded-full gradient-honey text-primary-foreground" asChild>
<Link to="/tasks">למטלות הזמינות</Link>
</Button>
                </div>
              ) : performingTasks.map((task) => (
                <article key={task.applicationId} className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <Link to={`/task/${task.id}`} className="min-w-0 flex-1">
                      <h2 className="font-extrabold text-lg truncate">{task.name}</h2>
                      <p className="text-sm text-muted-foreground line-clamp-2">{task.shortDesc}</p>
                    </Link>
                    <Badge variant="secondary" className="rounded-full">{task.status === "completed" || task.status === "cancelled" ? taskStatusLabel(task.status) : applicationStatusLabel[task.applicationStatus]}</Badge>
                  </div>
                  <div className="mt-3 text-sm text-muted-foreground space-y-1">
                    <p>{task.location}</p>
                    {(task.scheduledDate || task.scheduledTime) && <p>{formatDateTime(task.scheduledDate, task.scheduledTime)}</p>}
                  </div>
                  {task.applicationStatus === "accepted" && task.status === "completed" && (
                    <Button variant="outline" className="mt-4 rounded-full font-bold"
                      disabled={submittedReviews.has(`${task.id}:${task.creatorId}`)}
                      onClick={() => setReviewTarget({ taskId: task.id, taskName: task.name,
                        revieweeId: task.creatorId, revieweeName: "מפרסם המטלה" })}>
                      <Star size={16} className="ms-1" />
                      {submittedReviews.has(`${task.id}:${task.creatorId}`) ? "הדירוג נשלח" : "דירוג המפרסם"}
                    </Button>
                  )}
                  {task.applicationStatus === "accepted" && task.status !== "completed" && task.status !== "cancelled" && (
                    <Button
                      onClick={async () => {
                        try {
                          const conversationId = await ensureAcceptedTaskConversation(task.id, user.id);
                          navigate(`/chat?conversation=${conversationId}`);
                        } catch {
                          toast.error("לא הצלחנו לפתוח את השיחה");
                        }
                      }}
                      className="mt-4 rounded-full gradient-honey text-primary-foreground font-bold gap-1"
                    >
                      <MessageCircle size={16} /> מעבר לצ׳אט
                    </Button>
                  )}
                </article>
              ))}
            </TabsContent>
          )}
        </Tabs>

        <AlertDialog open={!!confirmTask} onOpenChange={(open) => !open && setConfirmTask(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>מה לעשות עם &ldquo;{confirmTask?.name}&rdquo;?</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmTask?.status === "cancelled"
                  ? "המטלה כבר בוטלה. מחיקה מעבירה לארכיון ומסירה מהאתר."
                  : confirmTask?.status === "completed"
                    ? "המטלה כבר הושלמה ואי אפשר לבטל אותה. מחיקה מעבירה לארכיון ומסירה מהאתר."
                    : "ביטול משנה את הסטטוס ומתריע למועמדים שהתקבלו. מחיקה מעבירה לארכיון ומסירה מהאתר."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
              <AlertDialogCancel className="rounded-full">חזרה</AlertDialogCancel>
              {/* Completed and cancelled are both terminal — complete_task credited
                  the bee already, so cancelling out of it would erase real earnings. */}
              {confirmTask?.status !== "cancelled" && confirmTask?.status !== "completed" && (
                <AlertDialogAction
                  onClick={() => { if (confirmTask) cancelTask(confirmTask); setConfirmTask(null); }}
                  className="rounded-full bg-amber-600 text-white hover:bg-amber-700"
                >
                  ביטול המטלה
                </AlertDialogAction>
              )}
              <AlertDialogAction
                onClick={() => { if (confirmTask) archiveTask(confirmTask); setConfirmTask(null); }}
                className="rounded-full bg-destructive text-destructive-foreground"
              >
                מחיקה (ארכיון)
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!confirmComplete} onOpenChange={(open) => !open && setConfirmComplete(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>לסמן את &ldquo;{confirmComplete?.name}&rdquo; כהושלמה?</AlertDialogTitle>
              <AlertDialogDescription>
                המטלה תיסגר ותרד מרשימת המטלות הזמינות, והתשלום יירשם בפרופיל של מי שביצע אותה.
                אחרי הסימון אי אפשר לבטל את המטלה.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
              <AlertDialogCancel className="rounded-full">חזרה</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => { if (confirmComplete) completeTask(confirmComplete); setConfirmComplete(null); }}
                className="rounded-full gradient-honey text-primary-foreground"
              >
                סימון כהושלמה
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <PaymentSummaryDialog open={!!paymentSummary} title={paymentSummary?.bit ? "סיכום תשלום ב-Bit" : "סיכום תשלום למטלה"}
          amount={Number(paymentSummary?.task.payment_due ?? 0)}
          description={`עמלת פרסום וביטוח, אם נבחר, עבור המטלה ״${paymentSummary?.task.name ?? ""}״. זו אינה התמורה לעובד.`}
          savesCard={!paymentSummary?.oneTime} busy={!!payingTask}
          onOpenChange={(open) => !open && setPaymentSummary(null)}
          onConfirm={() => { if (paymentSummary) void payWithOtherCard(paymentSummary.task, paymentSummary.oneTime, paymentSummary.bit); }} />

        {reviewTarget && (
          <ReviewDialog
            open
            onClose={() => setReviewTarget(null)}
            onSubmitted={() => setSubmittedReviews((current) => new Set(current).add(`${reviewTarget.taskId}:${reviewTarget.revieweeId}`))}
            taskId={reviewTarget.taskId}
            taskName={reviewTarget.taskName}
            revieweeId={reviewTarget.revieweeId}
            revieweeName={reviewTarget.revieweeName}
          />
        )}
      </div>
    </div>
  );
};

export default MyTasks;
