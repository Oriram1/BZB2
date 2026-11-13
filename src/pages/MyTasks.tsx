import { ROUTES } from "@/lib/routes";
import { completeTask as completeTaskAction } from "@/lib/taskActions";
import { paymentErrorText } from "@/lib/paymentErrors";
import { archiveTask as archiveTaskAction } from "@/lib/tasks";
import { fetchProfiles, fetchRatings } from "@/lib/people";
import { APPLICATION_ERRORS, CANCEL_TASK_ERRORS, mapDbError } from "@/lib/errors";
import { isTaskDone, taskStatusLabel, type TaskStatus } from "@/lib/taskStatus";
import { useRoles } from "@/hooks/useRoles";
import PaymentSummaryDialog from "@/components/billing/PaymentSummaryDialog";
import { openPaymentTab, PAYMENT_POPUP_BLOCKED, PAYMENT_TAB_OPENED } from "@/lib/paymentTab";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Banknote, CalendarDays, Check, Clock, CreditCard, Eye, Info, ListChecks, MessageCircle, MoreVertical, Pencil, Plus, Smartphone, Star, Trash2, UserRound, Users, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import PageHeader from "@/components/PageHeader";
import EmptyApplicantsIllustration from "@/components/tasks/EmptyApplicantsIllustration";
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
import { displayName, formatDateTime, formatNis, formatTaskWhen } from "@/lib/format";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { reviewWindowOpen } from "@/lib/reviewWindow";
import ReviewDialog from "@/components/reviews/ReviewDialog";
import {
  payTaskWithNewCard,
  payTaskOnce,
  publishStateLabel,
  resubmitTask,
  retryTaskPayment,
  type TaskPublishState,
} from "@/lib/taskBilling";

type ApplicationStatus = "pending" | "accepted" | "rejected";

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
  payment: number;
  scheduled_date: string | null;
  scheduled_time: string | null;
}

interface CandidateApplication {
  id: string;
  taskId: string;
  taskName: string;
  /** From the task, so a candidate card can say how many positions are left. */
  workersNeeded: number;
  applicantId: string;
  status: ApplicationStatus;
  name: string;
  age: number | null;
  avatarUrl: string | null;
  completedTasks: number;
  rating?: { average: number; count: number } | null;
  taskStatus: TaskStatus;
  reviewWindowStartedAt: string | null;
  /** The note the applicant wrote when applying, if any. */
  message: string | null;
}

interface PerformingTask {
  applicationId: string;
  creatorId: string;
  applicationStatus: ApplicationStatus;
  id: string;
  name: string;
  shortDesc: string;
  status: TaskStatus;
  reviewWindowStartedAt: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  location: string;
}

const applicationStatusLabel: Record<ApplicationStatus, string> = {
  pending: "ממתינה להחלטה",
  accepted: "התקבלה",
  rejected: "לא התקבלה",
};

const MyTasks = () => {
  const { user } = useAuth();
  const { isTasker, isBee } = useRoles();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [publishedTasks, setPublishedTasks] = useState<PublishedTask[]>([]);
  const [applications, setApplications] = useState<CandidateApplication[]>([]);
  const [performingTasks, setPerformingTasks] = useState<PerformingTask[]>([]);
  const [loading, setLoading] = useState(true);
  /** The task whose payment method is being chosen. The choice itself happens in a dialog, not on the card. */
  const [payChoice, setPayChoice] = useState<PublishedTask | null>(null);
  const [paymentSummary, setPaymentSummary] = useState<{ task: PublishedTask; oneTime: boolean; bit?: boolean } | null>(null);
  const [submittedReviews, setSubmittedReviews] = useState<Set<string>>(new Set());
  const [actionId, setActionId] = useState<string | null>(null);

  const pendingCount = useMemo(
    () => applications.filter((application) => application.status === "pending").length,
    [applications],
  );

  const pendingPerformerRatings = useMemo(
    () => performingTasks.filter(
      (task) => task.applicationStatus === "accepted"
        && task.status === "completed"
        && reviewWindowOpen(task.reviewWindowStartedAt)
        && !submittedReviews.has(`${task.id}:${task.creatorId}`),
    ),
    [performingTasks, submittedReviews],
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
        // A publisher lands on their tasks, a worker on what they are doing.
        // Candidates are one tap away, with a badge when any are waiting.
        : managesTasks
          ? "published"
          : "performing";

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let loadVersion = 0;

    const load = async () => {
      const version = ++loadVersion;
      setLoading(true);

      const [reviewsResult, publishedResult, ownApplicationsResult] = await Promise.all([
        supabase.from("reviews").select("task_id, reviewee_id").eq("reviewer_id", user.id),
        supabase.from("tasks")
          .select("id, name, short_desc, views_count, status, workers_needed, publish_state, payment_due, payment_mode, charged_at, review_window_started_at, payment, scheduled_date, scheduled_time")
          .eq("creator_id", user.id).is("archived_at", null)
          .order("created_at", { ascending: false }),
        supabase.from("task_applications").select("id, status, task_id")
          .eq("applicant_id", user.id).is("archived_at", null),
      ]);
      const { data: reviews, error: reviewsError } = reviewsResult;
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
        const { data: taskRows, error: taskError } = publishedResult;

        if (taskError) {
          toast.error("לא הצלחנו לטעון את המטלות שפרסמתם");
        } else {
          nextPublishedTasks.push(...((taskRows ?? []) as unknown as PublishedTask[]));

          const taskIds = (taskRows ?? []).map((task) => task.id);
          const { data: applicationRows, error: applicationsError } = taskIds.length
            ? await fetchAllPages((from, to) => supabase.from("task_applications")
              .select("id, task_id, status, applicant_id, message")
              .in("task_id", taskIds).is("archived_at", null).order("id").range(from, to))
            : { data: [], error: null };
          if (applicationsError) toast.error("לא הצלחנו לטעון את ההצעות למטלות");

          const applicantIds = [...new Set(applicationRows.map((application) => application.applicant_id))];
          const [profiles, completedResults] = await Promise.all([
            fetchProfiles(applicantIds),
            Promise.all(applicantIds.map(async (applicantId) => ({
              applicantId,
              result: await supabase.rpc("get_worker_completed_task_count", { _user_id: applicantId }),
            }))),
          ]);
          if (profiles.failed || completedResults.some(({ result }) => result.error)) {
            toast.error("לא הצלחנו לטעון את כל פרטי המועמדים");
          }
          const profilesById = profiles.byId;
          const completedById = new Map(completedResults.map(({ applicantId, result }) => [applicantId, result.data]));
          const applicationsByTask = new Map<string, typeof applicationRows>();
          for (const application of applicationRows) {
            const group = applicationsByTask.get(application.task_id) ?? [];
            group.push(application);
            applicationsByTask.set(application.task_id, group);
          }
          for (const task of taskRows ?? []) {
            for (const application of applicationsByTask.get(task.id) ?? []) {
              const profile = profilesById.get(application.applicant_id);
              nextApplications.push({
                id: application.id,
                taskId: task.id,
                taskName: task.name,
                workersNeeded: task.workers_needed,
                applicantId: application.applicant_id,
                status: application.status,
                name: displayName(profile),
                age: profile?.age ?? null,
                avatarUrl: profile?.avatar_url ?? null,
                completedTasks: completedById.get(application.applicant_id) ?? 0,
                taskStatus: task.status,
                reviewWindowStartedAt: task.review_window_started_at,
                message: application.message,
              });
            }
          }
        }
      }

      // Same reasoning as above, in the other direction: someone who applied to
      // tasks and then switched to tasker still has work to show up for.
      {
        const { data: ownApplications, error: ownApplicationsError } = ownApplicationsResult;
        if (ownApplicationsError) toast.error("לא הצלחנו לטעון את המטלות שבביצוע");

        const taskIds = [...new Set((ownApplications ?? []).map((application) => application.task_id))];
        const { data: tasks, error: tasksError } = taskIds.length
          ? await fetchAllPages((from, to) => supabase.from("tasks")
            .select("id, creator_id, name, short_desc, status, scheduled_date, scheduled_time, location, review_window_started_at")
            .in("id", taskIds).is("archived_at", null).order("id").range(from, to))
          : { data: [], error: null };
        if (tasksError) toast.error("לא הצלחנו לטעון את המטלות שבביצוע");
        const tasksById = new Map((tasks ?? []).map((task) => [task.id, task]));
        for (const application of ownApplications ?? []) {
          const task = tasksById.get(application.task_id);
          if (!task) continue;
          nextPerformingTasks.push({
            applicationId: application.id,
            creatorId: task.creator_id,
            applicationStatus: application.status,
            id: task.id,
            name: task.name,
            shortDesc: task.short_desc,
            status: task.status,
            reviewWindowStartedAt: task.review_window_started_at,
            scheduledDate: task.scheduled_date,
            scheduledTime: task.scheduled_time,
            location: task.location,
          });
        }
      }

      const ratings = await fetchRatings("bee", nextApplications.map((application) => application.applicantId));
      if (ratings) {
        for (const application of nextApplications) application.rating = ratings.get(application.applicantId) ?? null;
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
      toast.error(mapDbError(error, APPLICATION_ERRORS, "לא הצלחנו לעדכן את המועמדות"));
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
      toast.error(paymentErrorText(result.code));
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
      toast.error(paymentErrorText(result.code), result.code === "session_expired" ? {
        action: { label: "כניסה מחדש", onClick: () => navigate("/login", { state: { from: ROUTES.myPublishedTasks } }) },
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
      toast.error(paymentErrorText(result.code));
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
      toast.error(mapDbError(error, CANCEL_TASK_ERRORS, "לא הצלחנו לבטל את המטלה"));
      return;
    }

    setPublishedTasks((current) =>
      current.map((t) => (t.id === task.id ? { ...t, status: "cancelled" } : t)),
    );
    logUserActivity(user?.id, "task_cancelled", { entityType: "task", entityId: task.id, details: { name: task.name } });
    toast.success("המטלה בוטלה");
  };

  const completeTask = async (task: PublishedTask) => {
    const refusal = await completeTaskAction(task.id);
    if (refusal) {
      toast.error(refusal);
      return;
    }

    setPublishedTasks((current) =>
      current.map((t) => (t.id === task.id ? { ...t, status: "completed" } : t)),
    );
    setApplications((current) => current.map((application) => application.taskId === task.id ? { ...application, taskStatus: "completed" } : application));
    logUserActivity(user?.id, "task_completed", { entityType: "task", entityId: task.id, details: { name: task.name } });
    toast.success("המטלה סומנה כהושלמה. התשלום נרשם לעובדים שביצעו אותה");

    const accepted = applications.filter((a) => a.taskId === task.id && a.status === "accepted");
    if (accepted.length > 0) {
      setReviewTarget({
        taskId: task.id,
        taskName: task.name,
        revieweeId: accepted[0].applicantId,
        revieweeName: accepted[0].name,
      });
    }
  };

  const archiveTask = async (task: PublishedTask) => {
    const error = await archiveTaskAction(user!.id, task);
    if (error) {
      toast.error("לא הצלחנו למחוק את המטלה");
      return;
    }

    setPublishedTasks((current) => current.filter((t) => t.id !== task.id));
    setApplications((current) => current.filter((a) => a.taskId !== task.id));
    toast.success("המטלה הועברה לארכיון");
  };

  if (!user) return null;

  return (
    <div className="figma min-h-screen bg-background relative isolate" dir="rtl">
      {/* Background exactly as in the "My Applications" frame (390×844):
          Frame 13 linear gradient + two 6-point polygons, colour-burn #EE8F6B. */}
      <div
        className="fixed inset-x-0 bottom-0 top-[146px] pointer-events-none"
        style={{ background: "linear-gradient(180deg, #FCE9E2 0%, #F4F4F5 37%, #F4F4F5 79%, #FCE9E2 100%)" }}
        aria-hidden="true"
      />
      <div className="fixed bottom-0 left-[calc(50%-195px)] h-[844px] w-[390px] overflow-hidden pointer-events-none mix-blend-color-burn" aria-hidden="true">
        {[
          { top: 763.15, left: 241.77, rotate: -35.42 },
          { top: 654.18, left: -89.55, rotate: 55.01 },
        ].map((polygon) => {
          // Figma reports Top/Left of the rotated bounding box; rotate about the centre inside it.
          const rad = (Math.abs(polygon.rotate) * Math.PI) / 180;
          const box = 106.88 * (Math.cos(rad) + Math.sin(rad));
          return (
            <div key={polygon.left} className="absolute grid place-items-center" style={{ top: polygon.top, left: polygon.left, width: box, height: box }}>
              <div
                className="h-[106.88px] w-[106.88px] bg-[#EE8F6B]"
                style={{
                  transform: `rotate(${polygon.rotate}deg)`,
                  clipPath: "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)",
                }}
              />
            </div>
          );
        })}
      </div>
      <PageHeader
        variant="figma"
        centerTitle
        title="המטלות שלי"
        titleIsPageHeading
        action={isTasker ? (
          <Button size="sm" className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium gap-1.5" asChild>
<Link to="/create-task"><Plus size={16} aria-hidden="true" />
              פרסום מטלה</Link>
</Button>
        ) : undefined}
      />

      <div className="max-w-3xl mx-auto py-5 px-4 relative z-10">
        <Tabs value={activeTab} onValueChange={changeTab} dir="rtl">
          <div className="-mx-4 -mt-5 mb-4 bg-card px-4 pt-[18px] pb-[15px] flex justify-center">
          <TabsList className={`inline-grid w-auto h-auto rounded-full bg-[#F3F3F3] border border-border p-[3px] ${managesTasks && performsTasks ? "grid-cols-3" : managesTasks ? "grid-cols-2" : "grid-cols-1"}`}>
            {managesTasks && <TabsTrigger value="published" className="min-h-[35px] px-[9px] rounded-full text-[14px] font-normal text-muted-foreground data-[state=active]:font-semibold data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-card gap-2">מטלות שפרסמתי<ListChecks size={16} aria-hidden="true" /></TabsTrigger>}
            {managesTasks && (
              <TabsTrigger value="applications" className="relative min-h-[35px] px-[9px] rounded-full text-[14px] font-normal text-muted-foreground data-[state=active]:font-semibold data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-card gap-2">
                מועמדויות
                <Users size={16} aria-hidden="true" />
                {pendingCount > 0 && (
                  <Badge className="h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground border-0">
                    {pendingCount}
                  </Badge>
                )}
              </TabsTrigger>
            )}
            {performsTasks && <TabsTrigger value="performing" className="min-h-[35px] px-[9px] rounded-full text-[14px] font-normal text-muted-foreground data-[state=active]:font-semibold data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-card">מטלות שאני מבצע</TabsTrigger>}
          </TabsList>
          </div>

          {managesTasks && (
            <TabsContent value="applications" className="mt-4 space-y-3">
              {loading ? (
                <p className="py-12 text-center text-muted-foreground">טוען מועמדויות…</p>
              ) : applications.length === 0 ? (
                <div className="rounded-[14px] bg-card shadow-card px-[14px] pt-7 pb-6 text-center">
                  <EmptyApplicantsIllustration className="mx-auto mb-[16px] h-[62.5px] w-[59px]" />
                  <p className="text-xl font-semibold">אין מועמדויות עדיין</p>
                  <p className="mx-auto mt-2 max-w-[270px] text-[13px] leading-[18px] text-[#8B8C93]">מועמדויות חדשות יופיעו כאן. מטלה עם תיאור ברור ותשלום הוגן מקבלת מועמדים מהר יותר.</p>
                  <Button className="mt-6 w-full h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium" asChild>
                    <Link to="/create-task">פרסום מטלה</Link>
                  </Button>
                  <div className="mt-6 rounded-[10px] border border-[#DCDAF0] bg-secondary px-[13px] pt-3 pb-3 text-right">
                    <p className="flex items-center gap-1.5 font-semibold text-sm">טיפ קטן<Eye size={15} className="text-[#7C6FD8]" aria-hidden="true" /></p>
                    <p className="mt-1 me-auto max-w-[272px] text-sm leading-5 text-foreground">הוסיפו תיאור ברור, מיקום ותשלום הוגן כדי לקבל יותר מועמדים.</p>
                  </div>
                </div>
              ) : applications.map((application) => {
                const fullName = application.name || "משתמש";
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
                        <AvatarFallback>{application.name.slice(0, 1) || "🐝"}</AvatarFallback>
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
                          <Link to={`/profile/${application.applicantId}`} className="inline-flex items-center gap-1 hover:underline"><Star size={13} aria-hidden="true" /> {application.rating ? `${application.rating.average.toFixed(1)} (${application.rating.count} דירוגים)` : application.rating === null ? "עדיין אין דירוגים" : "דירוגים בפרופיל"}</Link>
                        </div>
                      </div>
                    </div>

                    {application.message && (
                      <p className="mt-3 rounded-2xl bg-muted/60 px-3 py-2 text-sm text-foreground whitespace-pre-wrap">
                        <span className="block text-xs font-bold text-muted-foreground mb-0.5">מה הם כתבו</span>
                        {application.message}
                      </p>
                    )}

                    {/* A greyed-out approval button with no reason next to it reads
                        as a broken screen rather than a full task. */}
                    {full && application.status === "pending" && (
                      <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                        כל המקומות במטלה תפוסים. כדי לקבל מועמד אחר צריך קודם לדחות מישהו שכבר נבחר.
                      </p>
                    )}

                    {/* One main action, one quiet alternative, everything else in the menu. */}
                    <div className="mt-4 flex items-center gap-2">
                      {application.status === "pending" && (
                        <>
                          <Button
                            onClick={() => updateApplicationStatus(application, "accepted")}
                            disabled={actionId === application.id || full}
                            title={full ? "כל המקומות במטלה תפוסים" : undefined}
                            className="flex-1 min-h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold gap-1"
                          >
                            <Check size={16} /> אישור וקבלה
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => updateApplicationStatus(application, "rejected")}
                            disabled={actionId === application.id}
                            className="min-h-11 rounded-full font-bold gap-1"
                          >
                            <X size={16} /> דחייה
                          </Button>
                        </>
                      )}
                      {application.status === "accepted" && application.taskStatus === "completed" && (
                        <Button className="flex-1 min-h-11 rounded-full font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                          disabled={submittedReviews.has(`${application.taskId}:${application.applicantId}`) || !reviewWindowOpen(application.reviewWindowStartedAt)}
                          onClick={() => setReviewTarget({ taskId: application.taskId, taskName: application.taskName,
                            revieweeId: application.applicantId, revieweeName: application.name })}>
                          <Star size={16} className="ms-1" />
                          {submittedReviews.has(`${application.taskId}:${application.applicantId}`) ? "הדירוג נשלח" : !reviewWindowOpen(application.reviewWindowStartedAt) ? "זמן הדירוג הסתיים" : "דירוג העובד"}
                        </Button>
                      )}
                      {application.status === "accepted" && !isTaskDone(application.taskStatus) && (
                        <>
                          <Button
                            onClick={() => openAcceptedConversation(application)}
                            disabled={actionId === application.id}
                            className="flex-1 min-h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold gap-1"
                          >
                            <MessageCircle size={16} /> מעבר לצ׳אט
                          </Button>
                          <Button variant="outline" className="min-h-11 rounded-full font-bold" onClick={() => {
                            const task = publishedTasks.find((item) => item.id === application.taskId);
                            if (task) setConfirmComplete(task);
                          }}>
                            <Check size={16} className="ms-1" /> הושלמה
                          </Button>
                        </>
                      )}
                      {application.status === "rejected" && <span className="flex-1" />}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-full" aria-label={`עוד פעולות עבור ${fullName}`}>
                            <MoreVertical size={18} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem asChild>
                            <Link to={`/profile/${application.applicantId}`}>צפייה בפרופיל</Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
                <div className="rounded-[14px] bg-card shadow-card p-8 text-center">
                  <p className="font-bold">עדיין לא פרסמתם מטלות</p>
                  <Button className="mt-4 rounded-full bg-primary text-primary-foreground hover:bg-primary/90" asChild>
<Link to="/create-task">פרסום מטלה</Link>
</Button>
                </div>
              ) : publishedTasks.map((task) => {
                const closed = isTaskDone(task.status);
                const canComplete = !closed && (acceptedByTask.get(task.id) ?? 0) > 0;

                return (
                  <article
                    key={task.id}
                    className="rounded-[14px] bg-card px-[14px] pt-[14px] pb-4 shadow-card touch-pan-y"
                    onTouchStart={(e) => handleTouchStart(e, task.id)}
                    onTouchEnd={(e) => handleTouchEnd(e, task)}
                  >
                    {/* A closed task has to read as closed at a glance, or the
                        list looks identical before and after completing one. */}
                    <div className="flex justify-end">
                      <span className={`inline-flex h-6 items-center rounded-full border px-3 text-[13px] ${closed ? "border-border bg-muted text-muted-foreground" : "border-primary bg-[#FDEEE8] text-primary"}`}>
                        {task.publish_state === "live" ? taskStatusLabel(task.status) : publishStateLabel[task.publish_state]}
                      </span>
                    </div>
                    <Link to={`/task/${task.id}`} className="mt-3 block min-w-0">
                      <h2 className="text-[22px] font-semibold leading-7 truncate">{task.name}</h2>
                      <p className="mt-1 text-[15px] leading-5 text-[#8B8C93] line-clamp-2">{task.short_desc}</p>
                    </Link>
                    {task.publish_state === "pending_review" && (
                      <div className="mt-6 flex min-h-[71px] items-center gap-3 rounded-[10px] border border-primary-soft-border bg-[#FDEFEB] px-[14px] py-3 text-[15px] leading-5 text-foreground">
                        <p className="flex-1">
                        המטלה ממתינה לאישור. {Number(task.payment_due) > 0
                          ? task.payment_mode === "one_time"
                            ? task.charged_at
                              ? `שילמתם ${formatNis(Number(task.payment_due))}. המטלה תעלה מיד אחרי האישור, ואם לא תאושר הכסף יוחזר.`
                              : "אפשר לשלם כבר עכשיו, או לבחור אמצעי תשלום אחרי האישור. הכרטיס השמור לא יחויב אוטומטית."
                            : `הכרטיס יחויב ב־${formatNis(Number(task.payment_due))} רק אחרי האישור, והמטלה תעלה אחרי שהחיוב עבר.`
                          : "היא תעלה לאפליקציה מיד אחרי האישור."}
                        </p>
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#F6D9CC] text-primary" aria-hidden="true"><Clock size={20} /></span>
                      </div>
                    )}
                    {task.publish_state === "pending_review" && task.payment_mode === "one_time" && !task.charged_at && Number(task.payment_due) > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" disabled={payingTask === task.id} onClick={() => setPaymentSummary({ task, oneTime: true })} className="rounded-full font-bold">
                          שלם עכשיו
                        </Button>
                      </div>
                    )}
                    {(task.publish_state === "pending_payment" || task.publish_state === "awaiting_charge") && (
                      <div className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                        <p className="font-bold text-foreground">
                          {task.payment_mode === "one_time" ? `המטלה אושרה וממתינה לתשלום (${formatNis(Number(task.payment_due))}).` : `המטלה אושרה אבל החיוב (${formatNis(Number(task.payment_due))}) לא עבר.`}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {task.payment_mode === "one_time" ? "בחרו אמצעי תשלום כדי להשלים את הפרסום. הכרטיס השמור לא חויב." : "כדאי לנסות כרטיס אחר או לפנות לחברת האשראי."} אם לא ישולם תוך 7 ימים המטלה תחזור לטיוטה, בלי חיוב.
                        </p>
                        <div className="mt-3">
                          <Button disabled={payingTask === task.id} onClick={() => setPayChoice(task)} className="w-full min-h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-extrabold">
                            שלם עכשיו
                          </Button>
                        </div>
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
                    <dl className="mt-[22px] grid grid-cols-3 items-center">
                      {[
                        { icon: <Banknote size={20} aria-hidden="true" />, value: <span dir="ltr">₪{Number(task.payment).toLocaleString("he-IL")}</span>, label: "תשלום" },
                        { icon: <Users size={20} aria-hidden="true" />, value: task.workers_needed === 1 ? "1 עובד" : `${task.workers_needed} עובדים`, label: "נדרש" },
                        { icon: <CalendarDays size={20} aria-hidden="true" />, value: task.scheduled_date ? formatTaskWhen(task.scheduled_date) : "גמיש", label: "מועד מבוקש" },
                      ].map((stat, index) => (
                        <div key={stat.label} className="relative flex justify-center">
                          {index > 0 && <span className="absolute start-0 top-[30px] h-5 w-px bg-border" aria-hidden="true" />}
                          <div className="flex flex-col items-start">
                            <span className="text-[#A9A9C4]">{stat.icon}</span>
                            <dt className="order-last -mt-1 text-sm leading-[18px] text-muted-foreground">{stat.label}</dt>
                            <dd className="mt-0.5 text-[22px] font-semibold leading-[23px] tabular-nums truncate">{stat.value}</dd>
                          </div>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-[23px] flex h-[67px] items-center justify-center gap-6 border-y border-border text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1">{task.views_count} צפיות <Eye size={15} aria-hidden="true" /></span>
                      <span className="h-5 w-px bg-border" aria-hidden="true" />
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        {applications.filter((a) => a.taskId === task.id).length} מועמדויות <Users size={15} aria-hidden="true" />
                      </span>
                    </div>
                    {canComplete && (
                      <Button
                        onClick={() => setConfirmComplete(task)}
                        className="mt-4 w-full min-h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium gap-1"
                      >
                        <Check size={16} /> סמן כהושלמה
                      </Button>
                    )}
                    <div className="mt-6 flex items-center gap-2">
                      <Button className={`flex-[1.38] h-12 rounded-full font-medium gap-1.5 ${canComplete ? "border border-primary bg-card text-primary hover:bg-primary-soft" : "bg-primary text-primary-foreground hover:bg-primary/90"}`} asChild>
                        <Link to={`/task/${task.id}`}>פרטי המטלה<Info size={16} aria-hidden="true" /></Link>
                      </Button>
                      {!closed && (
                        <Button variant="outline" className="flex-1 h-12 rounded-full border-primary text-primary hover:bg-primary-soft hover:text-primary font-medium gap-1.5" asChild>
                          <Link to={`/task/${task.id}`} state={{ openEdit: true }}>עריכה<Pencil size={16} aria-hidden="true" /></Link>
                        </Button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmTask(task)}
                      className="mt-[22px] inline-flex items-center gap-2 text-[15px] text-destructive hover:underline"
                    >
                      <Trash2 size={18} aria-hidden="true" />
                      {closed ? "מחיקה" : "ביטול / מחיקה"}
                    </button>
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
                <div className="rounded-[14px] bg-card shadow-card p-8 text-center">
                  <p className="font-bold">עדיין לא הגשתם מועמדות</p>
                  <Button className="mt-4 rounded-full bg-primary text-primary-foreground hover:bg-primary/90" asChild>
<Link to="/tasks">למטלות הזמינות</Link>
</Button>
                </div>
              ) : (
                <>
                  {pendingPerformerRatings.length > 0 && (
                    <div className="rounded-3xl border border-primary/30 bg-primary/5 p-4">
                      <p className="font-bold text-foreground">דירוגים ממתינים</p>
                      <p className="mt-1 text-sm text-muted-foreground">ביצעתם משימה. דירוג מהיר למפרסם:</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {pendingPerformerRatings.map((task) => (
                          <Button
                            key={task.applicationId}
                            size="sm"
                            className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold gap-1"
                            onClick={() => setReviewTarget({ taskId: task.id, taskName: task.name, revieweeId: task.creatorId, revieweeName: "מפרסם המטלה" })}
                          >
                            <Star size={14} /> דירוג {task.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  {performingTasks.map((task) => (
                <article key={task.applicationId} className="rounded-[14px] bg-card shadow-card p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <Link to={`/task/${task.id}`} className="min-w-0 flex-1">
                      <h2 className="font-extrabold text-lg truncate">{task.name}</h2>
                      <p className="text-sm text-muted-foreground line-clamp-2">{task.shortDesc}</p>
                    </Link>
                    <Badge variant="secondary" className="rounded-full">{isTaskDone(task.status) ? taskStatusLabel(task.status) : applicationStatusLabel[task.applicationStatus]}</Badge>
                  </div>
                  <div className="mt-3 text-sm text-muted-foreground space-y-1">
                    <p>{task.location}</p>
                    {(task.scheduledDate || task.scheduledTime) && <p>{formatDateTime(task.scheduledDate, task.scheduledTime)}</p>}
                  </div>
                  {task.applicationStatus === "accepted" && task.status === "completed" && (
                    <Button variant="outline" className="mt-4 rounded-full font-bold"
                      disabled={submittedReviews.has(`${task.id}:${task.creatorId}`) || !reviewWindowOpen(task.reviewWindowStartedAt)}
                      onClick={() => setReviewTarget({ taskId: task.id, taskName: task.name,
                        revieweeId: task.creatorId, revieweeName: "מפרסם המטלה" })}>
                      <Star size={16} className="ms-1" />
                      {submittedReviews.has(`${task.id}:${task.creatorId}`) ? "הדירוג נשלח" : !reviewWindowOpen(task.reviewWindowStartedAt) ? "זמן הדירוג הסתיים" : "דירוג המפרסם"}
                    </Button>
                  )}
                  {task.applicationStatus === "accepted" && !isTaskDone(task.status) && (
                    <Button
                      onClick={async () => {
                        try {
                          const conversationId = await ensureAcceptedTaskConversation(task.id, user.id);
                          navigate(`/chat?conversation=${conversationId}`);
                        } catch {
                          toast.error("לא הצלחנו לפתוח את השיחה");
                        }
                      }}
                      className="mt-4 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold gap-1"
                    >
                      <MessageCircle size={16} /> מעבר לצ׳אט
                    </Button>
                  )}
                </article>
                  ))}
                </>
              )}
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
              {!(confirmTask && isTaskDone(confirmTask.status)) && (
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
                className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                סימון כהושלמה
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={!!payChoice} onOpenChange={(open) => !open && setPayChoice(null)}>
          <DialogContent dir="rtl" className="rounded-3xl sm:max-w-md">
            <DialogHeader className="text-start">
              <DialogTitle>איך לשלם?</DialogTitle>
              <DialogDescription>
                {formatNis(Number(payChoice?.payment_due ?? 0))} עבור ״{payChoice?.name}״. זו עמלת הפרסום, לא התמורה לעובד.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              {payChoice && payChoice.payment_mode !== "one_time" && (
                <Button className="min-h-12 justify-start gap-3 rounded-2xl font-bold" onClick={() => { const t = payChoice; setPayChoice(null); void retryPayment(t); }}>
                  <CreditCard size={18} aria-hidden="true" /> הכרטיס השמור
                </Button>
              )}
              {payChoice && payChoice.payment_mode !== "one_time" && (
                <Button variant="outline" className="min-h-12 justify-start gap-3 rounded-2xl font-bold" onClick={() => { const t = payChoice; setPayChoice(null); setPaymentSummary({ task: t, oneTime: false }); }}>
                  <CreditCard size={18} aria-hidden="true" /> כרטיס אחר
                </Button>
              )}
              <Button variant={payChoice?.payment_mode === "one_time" ? "default" : "outline"} className="min-h-12 justify-start gap-3 rounded-2xl font-bold" onClick={() => { const t = payChoice!; setPayChoice(null); setPaymentSummary({ task: t, oneTime: true }); }}>
                <Smartphone size={18} aria-hidden="true" /> תשלום חד-פעמי: כרטיס, Apple Pay, Google Pay או Bit
              </Button>
              <p className="text-xs text-muted-foreground">בתשלום חד-פעמי לא נשמר כרטיס. האפשרויות בדף התשלום תלויות בהפעלה אצל חברת הסליקה ובתמיכת המכשיר.</p>
            </div>
          </DialogContent>
        </Dialog>

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
