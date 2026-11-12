import { shareOrCopy } from "@/lib/share";
import { getPublicProfile } from "@/lib/publicProfile";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import CategoryIcon from "@/components/tasks/CategoryIcon";
import PageHeader from "@/components/PageHeader";
import TaskLocationMap from "@/components/tasks/TaskLocationMap";
import {
  MapPin,
  CalendarBlank as Calendar,
  Timer as Hourglass,
  FileText,
  Note as StickyNote,
  User,
  Trash as Trash2,
  ShareNetwork as Share2,
  PencilSimple as Pencil,
  Star,
  DotsThreeVertical as MoreVertical,
  ArrowRight,
  ArrowSquareOut,
  Wallet,
  Check,
  Heart,
} from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import ApplyDialog from "@/components/tasks/ApplyDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { formatTaskWhen, defaultAvatarUrl, displayName, formatCurrency, formatDateTime, formatDuration } from "@/lib/format";
import { categoryLabel } from "@/lib/categories";
import { logUserActivity } from "@/lib/activityLog";
import type { TaskPublishState } from "@/lib/taskBilling";
import { taskStatusLabel } from "@/lib/taskStatus";
import { archiveTask } from "@/lib/tasks";
import { fetchRatings } from "@/lib/people";
import { isUniqueViolation } from "@/lib/errors";
import { useRoles } from "@/hooks/useRoles";
import { useSavedTasks } from "@/hooks/useSavedTasks";
import { formFor, RECIPIENT, say } from "@shared/gender.ts";
import { reviewWindowOpen } from "@/lib/reviewWindow";
import ReviewDialog from "@/components/reviews/ReviewDialog";
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

interface TaskData {
  id: string;
  name: string;
  short_desc: string;
  full_desc: string | null;
  category: string;
  payment: number;
  payment_type: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  duration_hours: number | null;
  review_window_started_at: string | null;
  workers_needed: number;
  status: string;
  publish_state: TaskPublishState;
  notes: string | null;
  image_url: string | null;
  creator_id: string;
  views_count: number;
}

interface CreatorProfile {
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  user_id: string;
}

const TaskDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { saved, toggle: toggleSaved } = useSavedTasks();
  const location = useLocation();
  const { user, profile } = useAuth();
  const { isBee } = useRoles();
  const [task, setTask] = useState<TaskData | null>(null);
  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [creatorRating, setCreatorRating] = useState<{ average: number; count: number } | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [alreadyApplied, setAlreadyApplied] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [acceptedAsWorker, setAcceptedAsWorker] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", shortDesc: "", fullDesc: "", payment: "", location: "", notes: "", date: "", time: "", durationDays: "" });
  const [saving, setSaving] = useState(false);
  const [workerReviewOpen, setWorkerReviewOpen] = useState(false);
  const [workerReviewSubmitted, setWorkerReviewSubmitted] = useState(false);

  useEffect(() => {
    if (!id) return;
    const fetchTask = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("tasks")
        .select("id, name, short_desc, full_desc, category, payment, payment_type, location, latitude, longitude, scheduled_date, scheduled_time, duration_hours, review_window_started_at, workers_needed, status, publish_state, notes, image_url, creator_id, views_count")
        .eq("id", id)
        .is("archived_at", null)
        .single();

      if (error || !data) {
        toast.error("המטלה לא נמצאה");
        navigate(-1);
        return;
      }
      setTask(data);
      setCreatorRating(undefined);
      // Independent lookups can run together once the task identifies its creator.
      const [ratings, viewResult, creatorProfile, applicationResult] = await Promise.all([
        fetchRatings("tasker", [data.creator_id]),
        user && data.creator_id !== user.id
          ? supabase.rpc("record_task_view", { _task_id: id })
          : Promise.resolve({ data: null, error: null }),
        // This RPC exposes only the publisher's public profile under RLS.
        getPublicProfile(data.creator_id),
        user
          ? supabase.from("task_applications").select("id, status")
            .eq("task_id", id).eq("applicant_id", user.id).is("archived_at", null).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      setCreatorRating(ratings ? ratings.get(data.creator_id) ?? null : undefined);
      if (!viewResult.error && typeof viewResult.data === "number") {
        setTask((current) => (current && current.id === id ? { ...current, views_count: viewResult.data } : current));
      }
      setCreator({
        first_name: creatorProfile?.first_name ?? "",
        last_name: creatorProfile?.last_name ?? "",
        avatar_url: creatorProfile?.avatar_url ?? null,
        user_id: data.creator_id,
      });
      const app = applicationResult.data;
      setAlreadyApplied(Boolean(app));
      setAcceptedAsWorker(app?.status === "accepted");
      if (user && app?.status === "accepted" && data.status === "completed" && data.creator_id !== user.id) {
        const { data: review } = await supabase.from("reviews")
          .select("id").eq("task_id", id).eq("reviewer_id", user.id)
          .eq("reviewee_id", data.creator_id).maybeSingle();
        setWorkerReviewSubmitted(Boolean(review));
      }

      setLoading(false);
    };
    fetchTask();
  }, [id, user, navigate]);

  // The "edit" link on My Tasks lands here wanting the dialog open. Asked once,
  // so saving an edit (which replaces `task`) does not reopen it.
  const editRequested = useRef(Boolean(location.state?.openEdit));
  const openEdit = useCallback((current: TaskData) => {
    setEditForm({
      name: current.name,
      shortDesc: current.short_desc,
      fullDesc: current.full_desc || "",
      payment: String(current.payment),
      location: current.location || "",
      notes: current.notes || "",
      date: current.scheduled_date || "",
      time: current.scheduled_time || "",
      durationDays: current.duration_hours ? String(Math.round(current.duration_hours / 24)) : "",
    });
    setEditOpen(true);
  }, []);
  useEffect(() => {
    if (task && editRequested.current) {
      editRequested.current = false;
      openEdit(task);
      window.history.replaceState({}, "");
    }
  }, [task, openEdit]);

  /** Opens the confirmation; the insert itself happens in `submitApplication`. */
  const handleApply = () => {
    if (!user || !isBee) {
      if (!user) {
        toast.error("יש להתחבר כדי להגיש מועמדות");
        navigate("/login");
      } else {
        toast.error("רק מקבלי מטלות יכולים להגיש מועמדות");
      }
      return;
    }
    setApplyOpen(true);
  };

  const submitApplication = async (message: string): Promise<boolean> => {
    if (!task || !user) return false;
    setApplying(true);
    const { error } = await supabase.from("task_applications").insert({
      task_id: task.id,
      applicant_id: user.id,
      message: message || null,
    });
    setApplying(false);
    if (error) {
      if (isUniqueViolation(error)) {
        toast.info("כבר הגשת מועמדות למטלה זו");
        setAlreadyApplied(true);
      } else {
        toast.error("שגיאה בהגשת המועמדות");
      }
      return false;
    }
    logUserActivity(user.id, "application_submitted", {
      entityType: "task",
      entityId: task.id,
      details: { taskName: task.name },
    });
    setAlreadyApplied(true);
    return true;
  };

  const handleDeleteTask = async () => {
    if (!task || !user || !isOwner) return;
    setLoading(true);
    const error = await archiveTask(user.id, task);
    setLoading(false);
    if (error) {
      toast.error("שגיאה במחיקת המטלה: " + error.message);
    } else {
      toast.success("המטלה נמחקה בהצלחה 🗑️");
      navigate("/my-tasks");
    }
  };

  const handleSaveEdit = async () => {
    if (!task) return;
    setSaving(true);
    const { error } = await supabase
      .from("tasks")
      .update({
        name: editForm.name,
        short_desc: editForm.shortDesc,
        full_desc: editForm.fullDesc || null,
        payment: parseFloat(editForm.payment) || 0,
        location: editForm.location || null,
        notes: editForm.notes || null,
        scheduled_date: editForm.date || null,
        scheduled_time: editForm.time || null,
        duration_hours: editForm.durationDays ? parseFloat(editForm.durationDays) * 24 : null,
      })
      .eq("id", task.id);
    setSaving(false);
    if (error) {
      toast.error("שגיאה בעדכון המטלה");
      return;
    }
    setTask({
      ...task,
      name: editForm.name,
      short_desc: editForm.shortDesc,
      full_desc: editForm.fullDesc || null,
      payment: parseFloat(editForm.payment) || 0,
      location: editForm.location || null,
      notes: editForm.notes || null,
      scheduled_date: editForm.date || null,
      scheduled_time: editForm.time || null,
      duration_hours: editForm.durationDays ? parseFloat(editForm.durationDays) * 24 : null,
    });
    setEditOpen(false);
    toast.success("המטלה עודכנה בהצלחה");
  };

  const handleShare = () =>
    void shareOrCopy(
      { title: task?.name || "מטלה ב-BusyBee", url: window.location.href },
      { success: "הקישור הועתק ללוח! 📋", failure: "לא הצלחנו להעתיק את הקישור" },
    );

  if (loading) {
    return (
      <div className="figma min-h-screen bg-background p-4 pt-20 max-w-xl mx-auto" dir="rtl">
        <Skeleton className="h-8 w-32 mb-6 rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg mb-4" />
        <Skeleton className="h-6 w-3/4 mb-2 rounded-lg" />
        <Skeleton className="h-4 w-1/2 rounded-lg" />
      </div>
    );
  }

  if (!task) return null;

  const isOwner = user?.id === task.creator_id;
  const isOwnPendingReview = isOwner && task.publish_state === "pending_review";
  const statusLabel = isOwnPendingReview ? "ממתינה לאישור" : taskStatusLabel(task.status);
  const creatorAvatar = creator?.avatar_url || defaultAvatarUrl(task.creator_id);

  return (
    <div className="figma min-h-screen bg-background pb-36" dir="rtl">
      <PageHeader variant="figma" showBack={false} />

      {/* Sub-header as drawn: back at the inline start, share at the inline end. */}
      <div className="bg-card">
        <div className="max-w-xl mx-auto flex items-center justify-between px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => (window.history.length > 2 ? navigate(-1) : navigate("/"))}
            aria-label="חזרה למסך הקודם"
            className="h-11 w-11 shrink-0 rounded-full border border-border bg-muted text-foreground hover:bg-secondary"
          >
            <ArrowRight size={18} />
          </Button>
          <p className="text-base font-medium text-foreground">פרטי משימה</p>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleShare}
            className="h-11 w-11 shrink-0 rounded-full border border-border bg-muted text-foreground hover:bg-secondary"
            aria-label="שיתוף מטלה"
          >
            <Share2 size={18} />
          </Button>
        </div>
      </div>

      <div className="bg-[linear-gradient(180deg,hsl(var(--primary-soft))_0,hsl(var(--background))_420px)]">
      <div className="max-w-xl mx-auto px-4 pt-3.5 space-y-3.5">
        {task.image_url && (
          <div className="relative rounded-lg overflow-hidden shadow-card border-[1.2px] border-border">
            <img
              src={task.image_url}
              alt={task.name}
              className="w-full h-52 sm:h-64 object-cover"
              onError={(e) => { (e.currentTarget.closest(".relative") as HTMLElement | null)?.remove(); }}
            />
          </div>
        )}

        <div className="bg-card rounded-lg p-3.5 border-[1.2px] border-border shadow-card space-y-6">
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full border border-primary bg-primary-soft px-2.5 py-1 text-xs leading-4 text-primary">
              {statusLabel}
            </span>
            <div className="flex items-center gap-3 text-xs leading-[18px] text-muted-foreground">
              {(task.scheduled_date || task.scheduled_time) && (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar size={14} aria-hidden="true" />
                  {formatTaskWhen(task.scheduled_date, task.scheduled_time)}
                </span>
              )}
              {task.duration_hours && (
                <span className="inline-flex items-center gap-1.5 border-s border-border ps-3">
                  <Hourglass size={14} aria-hidden="true" />
                  {formatDuration(Number(task.duration_hours))}
                </span>
              )}
              {isOwner && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground shrink-0 h-11 w-11" aria-label="עוד פעולות">
                      <MoreVertical size={18} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem destructive onSelect={() => setDeleteOpen(true)}>
                      <Trash2 size={16} aria-hidden="true" /> מחיקת המטלה
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          <div className="flex items-start justify-between gap-3 border-t border-border pt-6">
            <div className="min-w-0">
              <h1 className="text-[22px] font-semibold leading-7 text-foreground">{task.name}</h1>
              <p className="mt-0.5 text-[13px] leading-[18px] text-muted-foreground">{task.short_desc}</p>
            </div>
            <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs leading-4 text-muted-foreground">
              {categoryLabel(task.category)}
            </span>
          </div>

          {(task.scheduled_date || task.scheduled_time || task.duration_hours) && (
            <div className="flex items-center justify-between gap-3 text-xs leading-[18px] text-muted-foreground">
              {(task.scheduled_date || task.scheduled_time) && (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar size={14} aria-hidden="true" />
                  {formatTaskWhen(task.scheduled_date, task.scheduled_time)}
                </span>
              )}
              {task.duration_hours && (
                <span className="inline-flex items-center gap-1.5">
                  <Hourglass size={14} aria-hidden="true" />
                  {formatDuration(Number(task.duration_hours))}
                </span>
              )}
            </div>
          )}

          {isOwnPendingReview && (
            <p className="rounded-lg border border-primary-soft-border bg-primary-soft px-3 py-2 text-sm text-foreground">
              המטלה שלך ממתינה לאישור. בינתיים היא לא מוצגת לאחרים.
            </p>
          )}

          {(task.full_desc || task.short_desc) && (
            <div className="flex items-center justify-between gap-3 min-h-[72px] rounded-[8px] bg-[#FFF2EE] p-3.5">
              <p className="text-sm leading-6 text-foreground whitespace-pre-wrap dir-auto">{task.full_desc || task.short_desc}</p>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/25 text-primary">
                <FileText size={18} aria-hidden="true" />
              </span>
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-y border-border py-6">
            <span className="rounded-[4px] bg-secondary px-2.5 py-[3px] text-xs leading-6 text-foreground">
              {task.workers_needed === 1 ? "עובד אחד" : `${task.workers_needed} עובדים`}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 min-h-[72px] rounded-[8px] bg-[#FFF2EE] p-3.5">
            <div>
              <p className="text-[22px] font-medium leading-7 text-foreground tabular">{formatCurrency(task.payment)}</p>
              <p className="text-xs leading-[18px] text-muted-foreground">{task.payment_type === "hour" ? "לשעת עבודה" : "למשימה זו"}</p>
            </div>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/25 text-primary">
              <Wallet size={18} aria-hidden="true" />
            </span>
          </div>
        </div>

        {creator && (
          <div className="bg-card rounded-lg p-3.5 border-[1.2px] border-border shadow-card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium text-foreground">אודות המפרסם</h2>
              <User size={20} className="text-primary" aria-hidden="true" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img src={creatorAvatar} alt="פרופיל" className="w-11 h-11 rounded-full object-cover shrink-0" />
                <div className="min-w-0">
                  <span className="font-semibold text-foreground text-base leading-6 truncate block">
                    {displayName(creator, "משתמש Busy Bee")}
                  </span>
                  {creatorRating !== undefined && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Star size={13} weight={creatorRating ? "fill" : "regular"} className={creatorRating ? "text-primary" : ""} aria-hidden="true" />
                      {creatorRating ? <><bdi>{creatorRating.average.toFixed(1)}</bdi> · {creatorRating.count} דירוגים</> : "עדיין אין דירוגים"}
                    </span>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0 gap-1.5 rounded-full border-[#DBD6F0] bg-card px-3.5 text-xs font-normal text-foreground hover:bg-muted"
                onClick={() => navigate(`/profile/${creator.user_id}`)}
              >
                <User size={14} aria-hidden="true" />
                פרופיל
              </Button>
            </div>
          </div>
        )}
        {!isOwner && task.status === "completed" && acceptedAsWorker && (
          <Button
            className="w-full rounded-full font-semibold gap-2 bg-primary text-primary-foreground"
            disabled={workerReviewSubmitted || !reviewWindowOpen(task.review_window_started_at)}
            onClick={() => setWorkerReviewOpen(true)}
          >
            <Star size={18} /> {workerReviewSubmitted ? "הדירוג נשלח" : !reviewWindowOpen(task.review_window_started_at) ? "זמן הדירוג הסתיים" : "דרג את מפרסם המטלה"}
          </Button>
        )}

        {(task.full_desc || task.short_desc) && (
          <div className="bg-card rounded-lg p-3.5 border-[1.2px] border-border shadow-card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium text-foreground">תיאור המשימה</h2>
              <FileText size={20} className="text-primary" aria-hidden="true" />
            </div>
            <p className="text-sm leading-6 text-foreground whitespace-pre-wrap dir-auto">{task.full_desc || task.short_desc}</p>
          </div>
        )}

        {task.notes && (
          <div className="bg-card rounded-lg p-4 border-[1.2px] border-border shadow-card space-y-2">
            <div className="flex items-center gap-2 text-foreground font-bold text-base mb-1">
              <StickyNote size={20} className="text-primary" />
              <h3>הערות מפרסם המשימה</h3>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap dir-auto">{task.notes}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {task.location && (
            <div className="col-span-2 bg-card rounded-lg p-3.5 border-[1.2px] border-border shadow-card space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-medium text-foreground">מיקום</h2>
                <MapPin size={20} className="text-primary" aria-hidden="true" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 text-[13px] leading-4 text-[#565658]">{task.location}</p>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(task.latitude != null && task.longitude != null ? `${task.latitude},${task.longitude}` : task.location)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[#DBD6F0] bg-card px-3.5 text-xs text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ArrowSquareOut size={14} aria-hidden="true" />
                  פתח במפה
                </a>
              </div>
              <TaskLocationMap
                compactLinks
                location={task.location}
                latitude={task.latitude}
                longitude={task.longitude}
                taskName={task.name}
              />
            </div>
          )}

        </div>

      </div>
      </div>

      {!isOwner && task.status === "open" && isBee && (() => {
        const isSaved = saved.has(task.id);
        return (
        <div className="fixed bottom-4 left-4 right-4 max-w-xl mx-auto z-40 flex items-center gap-2 rounded-lg bg-card p-3.5 shadow-[0_1px_8px_rgba(0,0,0,0.06)]">
          <Button
            className="h-12 flex-1 gap-2.5 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
            onClick={handleApply}
            disabled={applying || alreadyApplied}
          >
            {alreadyApplied ? "כבר הגשת מועמדות" : "אישור משימה"}
            <Check size={16} aria-hidden="true" />
          </Button>
          <button
            type="button"
            aria-pressed={isSaved}
            aria-label={isSaved ? "הסרה מהמטלות השמורות" : "שמירת המטלה"}
            onClick={() => toggleSaved(task.id)}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#DBD6F0] bg-card text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Heart size={20} weight={isSaved ? "fill" : "regular"} className={isSaved ? "text-primary" : ""} aria-hidden="true" />
          </button>
        </div>
      );
      })()}

      {isOwner && (
        <div className="fixed bottom-4 left-4 right-4 max-w-xl mx-auto z-40 flex items-center gap-2 rounded-lg bg-card p-3.5 shadow-[0_1px_8px_rgba(0,0,0,0.06)]">
          <Button
            className="h-12 flex-1 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
            onClick={() => navigate("/my-tasks?tab=published")}
          >
            {task.status === "completed" ? "המטלות והדירוגים שלי" : "ניהול וסיום המטלה"}
          </Button>
          <Button
            variant="outline"
            className="h-12 gap-2 rounded-full border-[#DBD6F0] bg-card px-5 text-sm font-medium text-foreground hover:bg-muted"
            onClick={() => openEdit(task)}
          >
            <Pencil size={16} />
            עריכה
          </Button>
        </div>
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת מטלה</AlertDialogTitle>
            <AlertDialogDescription>
              האם אתה בטוח שברצונך למחוק את המטלה "{task.name}"? פעולה זו תמחוק את המטלה לצמיתות ולא ניתן לבטלה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full font-bold">ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTask}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-full font-bold"
            >
              מחק מטלה
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ApplyDialog open={applyOpen} onOpenChange={setApplyOpen} taskName={task.name} onSubmit={submitApplication} />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent dir="rtl" className="max-w-lg max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>עריכת מטלה</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 mt-2">
            <div>
              <Label className="text-right block mb-1 font-bold">שם המטלה</Label>
              <Input dir="rtl" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className="rounded-xl" />
            </div>
            <div>
              <Label className="text-right block mb-1 font-bold">תיאור קצר</Label>
              <Input dir="rtl" value={editForm.shortDesc} onChange={(e) => setEditForm((f) => ({ ...f, shortDesc: e.target.value }))} maxLength={120} className="rounded-xl" />
            </div>
            <div>
              <Label className="text-right block mb-1 font-bold">תיאור מפורט</Label>
              <Textarea dir="rtl" value={editForm.fullDesc} onChange={(e) => setEditForm((f) => ({ ...f, fullDesc: e.target.value }))} className="rounded-xl min-h-[100px]" />
            </div>
            <div>
              <Label className="text-right block mb-1 font-bold">תשלום (₪)</Label>
              <Input dir="rtl" type="text" inputMode="numeric" value={editForm.payment} onChange={(e) => setEditForm((f) => ({ ...f, payment: e.target.value }))} className="rounded-xl" />
            </div>
            <div>
              <Label className="text-right block mb-1 font-bold">מיקום</Label>
              <Input dir="rtl" value={editForm.location} onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))} className="rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-right block mb-1 font-bold">תאריך</Label>
                <Input type="date" dir="rtl" value={editForm.date} onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))} className="rounded-xl" />
              </div>
              <div>
                <Label className="text-right block mb-1 font-bold">שעה</Label>
                <Input type="time" dir="ltr" step={300} value={editForm.time} onChange={(e) => setEditForm((f) => ({ ...f, time: e.target.value }))} className="rounded-xl" />
              </div>
            </div>
            <div>
              <Label className="text-right block mb-1 font-bold">משך מוערך (ימים)</Label>
              <Input dir="rtl" type="text" inputMode="numeric" value={editForm.durationDays} onChange={(e) => setEditForm((f) => ({ ...f, durationDays: e.target.value.replace(/[^0-9]/g, "") }))} placeholder="1" className="rounded-xl" />
            </div>
            <div>
              <Label className="text-right block mb-1 font-bold">הערות</Label>
              <Textarea dir="rtl" value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} className="rounded-xl min-h-[80px]" />
            </div>
            <Button onClick={handleSaveEdit} disabled={saving || !editForm.name || !editForm.shortDesc} className="gradient-honey text-primary-foreground rounded-full font-bold h-11">
              {saving ? "שומר..." : "שמירת שינויים"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {!isOwner && task.status === "completed" && creator && (
        <ReviewDialog
          open={workerReviewOpen}
          onClose={() => setWorkerReviewOpen(false)}
          onSubmitted={() => setWorkerReviewSubmitted(true)}
          taskId={task.id}
          taskName={task.name}
          revieweeId={creator.user_id}
          revieweeName={displayName(creator, "מפרסם המטלה")}
        />
      )}
    </div>
  );
};

export default TaskDetail;
