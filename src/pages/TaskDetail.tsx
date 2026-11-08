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
  DollarSign,
  Users,
  MapPin,
  Calendar,
  Hourglass,
  FileText,
  StickyNote,
  User,
  Trash2,
  Share2,
  Eye,
  Pencil,
  Star,
  MoreVertical,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import ApplyDialog from "@/components/tasks/ApplyDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { defaultAvatarUrl, displayName, formatCurrency, formatDateTime, formatDuration } from "@/lib/format";
import { categoryLabel } from "@/lib/categories";
import { logUserActivity } from "@/lib/activityLog";
import type { TaskPublishState } from "@/lib/taskBilling";
import { taskStatusLabel } from "@/lib/taskStatus";
import { archiveTask } from "@/lib/tasks";
import { fetchRatings } from "@/lib/people";
import { isUniqueViolation } from "@/lib/errors";
import { useRoles } from "@/hooks/useRoles";
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
      <div className="min-h-screen bg-background p-4 pt-20 max-w-xl mx-auto" dir="rtl">
        <Skeleton className="h-8 w-32 mb-6 rounded-xl" />
        <Skeleton className="h-48 w-full rounded-3xl mb-4" />
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
    <div className="min-h-screen bg-background pb-36" dir="rtl">
      <PageHeader
        title={task.name}
        titleIsPageHeading
        showBack={true}
        action={
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleShare}
              className="rounded-full text-primary-foreground hover:bg-foreground/10 shrink-0 h-11 w-11"
              aria-label="שיתוף מטלה"
            >
              <Share2 size={18} />
            </Button>
          </div>
        }
      />

      <div className="max-w-xl mx-auto px-4 pt-4 space-y-5">
        {task.image_url && (
          <div className="relative rounded-3xl overflow-hidden shadow-sm border border-border/60">
            <img
              src={task.image_url}
              alt={task.name}
              className="w-full h-52 sm:h-64 object-cover"
              onError={(e) => { (e.currentTarget.closest(".relative") as HTMLElement | null)?.remove(); }}
            />
            <div className="absolute top-3 right-3">
              <Badge className="gradient-honey text-primary-foreground border-none rounded-full px-3 py-1 font-bold text-xs shadow-md">
                {statusLabel}
              </Badge>
            </div>
          </div>
        )}

        <div className="bg-card rounded-3xl p-5 border border-border/60 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CategoryIcon category={task.category} className="shrink-0" />
              <Badge variant="secondary" className="rounded-full px-3 py-1 font-bold text-xs">
                {categoryLabel(task.category)}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              {!task.image_url && (
                <Badge className="gradient-honey text-primary-foreground border-none rounded-full px-3 py-1 font-bold text-xs">
                  {statusLabel}
                </Badge>
              )}
              <Button variant="ghost" size="icon" onClick={handleShare} className="md:hidden rounded-full h-11 w-11 text-muted-foreground" aria-label="שיתוף מטלה">
                <Share2 size={18} />
              </Button>
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

          <div>
            <h2 className="font-black text-2xl sm:text-3xl text-foreground tracking-tight">{task.name}</h2>
            <p className="text-muted-foreground text-sm mt-1 leading-relaxed">{task.short_desc}</p>
          </div>

          {isOwnPendingReview && (
            <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
              המטלה שלך ממתינה לאישור. בינתיים היא לא מוצגת לאחרים.
            </p>
          )}

          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 border-t border-border/40 font-medium">
            <span className="flex items-center gap-1">
              <Eye size={14} />
              {task.views_count} צפיות
            </span>
          </div>
        </div>


        <div className="gradient-honey rounded-3xl p-5 text-primary-foreground shadow-lg shadow-amber-500/10 flex items-center justify-between">
          <div>
            <span className="text-xs opacity-90 block font-medium">תשלום מוצע</span>
            <span className="text-3xl font-black tracking-tight">{formatCurrency(task.payment)}</span>
            <span className="text-xs opacity-90 mr-1">/ {task.payment_type === "hour" ? "שעה" : "משימה"}</span>
          </div>
          <div className="bg-white/20 backdrop-blur-md rounded-2xl p-3">
            <DollarSign size={28} className="text-primary-foreground" />
          </div>
        </div>

        {creator && (
          <div className="bg-card rounded-3xl p-4 border border-border/60 shadow-sm flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={creatorAvatar}
                alt="פרופיל"
                className="w-12 h-12 rounded-full object-cover border-2 border-primary/20 shrink-0"
              />
              <div className="min-w-0">
                <span className="text-xs text-muted-foreground block font-medium">פורסם על ידי</span>
                <span className="font-bold text-foreground text-sm truncate block">
                  {displayName(creator, "משתמש Busy Bee")}
                </span>
                {creatorRating !== undefined && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-foreground">
                    <Star size={12} className="fill-primary text-primary-ink" aria-hidden="true" />
                    {creatorRating ? <><bdi>{creatorRating.average.toFixed(1)}</bdi> · {creatorRating.count} דירוגים</> : "עדיין אין דירוגים"}
                  </span>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full text-xs font-bold shrink-0 border-border hover:bg-primary/10 hover:text-primary-ink"
              onClick={() => navigate(`/profile/${creator.user_id}`)}
            >
              <User size={14} className="ms-1" />
              פרופיל
            </Button>
          </div>
        )}
        {!isOwner && task.status === "completed" && acceptedAsWorker && (
          <Button
            className="w-full rounded-2xl font-bold gap-2 gradient-honey text-primary-foreground"
            disabled={workerReviewSubmitted || !reviewWindowOpen(task.review_window_started_at)}
            onClick={() => setWorkerReviewOpen(true)}
          >
            <Star size={18} /> {workerReviewSubmitted ? "הדירוג נשלח" : !reviewWindowOpen(task.review_window_started_at) ? "זמן הדירוג הסתיים" : "דרג את מפרסם המטלה"}
          </Button>
        )}

        {(task.full_desc || task.short_desc) && (
          <div className="bg-primary/5 dark:bg-primary/10 rounded-3xl p-6 border-2 border-primary/30 shadow-md space-y-3">
            <div className="flex items-center gap-2 text-foreground font-black text-lg">
              <FileText size={20} className="text-primary-ink" />
              <h3>תיאור המשימה</h3>
            </div>
            <p className="text-foreground text-base leading-relaxed whitespace-pre-wrap dir-auto">{task.full_desc || task.short_desc}</p>
          </div>
        )}

        {task.notes && (
          <div className="bg-amber-500/5 dark:bg-amber-500/10 rounded-3xl p-5 border border-amber-500/20 shadow-sm space-y-2">
            <div className="flex items-center gap-2 text-foreground font-extrabold text-base mb-1">
              <StickyNote size={18} className="text-amber-600 dark:text-amber-400" />
              <h3>הערות מפרסם המשימה</h3>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap dir-auto">{task.notes}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {task.location && (
            <div className="col-span-2 bg-card rounded-2xl p-4 border border-border/60 shadow-sm flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary-ink shrink-0">
                <MapPin size={20} />
              </div>
              <div className="overflow-hidden min-w-0 flex-1">
                <span className="text-xs text-muted-foreground block font-medium">מיקום</span>
                <span className="font-bold text-foreground text-sm truncate block">{task.location}</span>
              </div>
            </div>
          )}

          {task.location && (
            <div className="col-span-2 overflow-hidden rounded-2xl border border-border/60 bg-card p-2 shadow-sm">
              <TaskLocationMap
                location={task.location}
                latitude={task.latitude}
                longitude={task.longitude}
                taskName={task.name}
              />
            </div>
          )}

          {(task.scheduled_date || task.scheduled_time) && (
            <div className="bg-card rounded-2xl p-4 border border-border/60 shadow-sm flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary-ink shrink-0">
                <Calendar size={18} />
              </div>
              <div>
                <span className="text-xs text-muted-foreground block font-medium">מועד</span>
                <span className="font-bold text-foreground text-sm tabular">{formatDateTime(task.scheduled_date, task.scheduled_time)}</span>
              </div>
            </div>
          )}

          {task.duration_hours && (
            <div className="bg-card rounded-2xl p-4 border border-border/60 shadow-sm flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary-ink shrink-0">
                <Hourglass size={18} />
              </div>
              <div>
                <span className="text-xs text-muted-foreground block font-medium">משך מוערך</span>
                <span className="font-bold text-foreground text-sm">{formatDuration(Number(task.duration_hours))}</span>
              </div>
            </div>
          )}

          <div className="bg-card rounded-2xl p-4 border border-border/60 shadow-sm flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary-ink shrink-0">
              <Users size={18} />
            </div>
            <div>
              <span className="text-xs text-muted-foreground block font-medium">עובדים דרושים</span>
              <span className="font-bold text-foreground text-sm">
                {task.workers_needed === 1 ? "עובד אחד" : `${task.workers_needed} עובדים`}
              </span>
            </div>
          </div>
        </div>

      </div>

      {!isOwner && task.status === "open" && isBee && (
        <div className="fixed bottom-4 left-4 right-4 max-w-xl mx-auto z-40 bg-background/95 backdrop-blur-2xl border border-border/80 shadow-2xl rounded-3xl p-3">
          <Button
            className="w-full h-12 gradient-honey text-primary-foreground rounded-2xl font-extrabold text-base shadow-md hover:scale-[1.01] active:scale-95 transition-transform"
            onClick={handleApply}
            disabled={applying || alreadyApplied}
          >
            {alreadyApplied ? "כבר הגשת מועמדות ✓" : `אני ${say(formFor(profile?.gender), RECIPIENT.interested)} לבצע 🐝`}
          </Button>
        </div>
      )}

      {isOwner && (
        <div className="fixed bottom-4 left-4 right-4 max-w-xl mx-auto z-40 bg-background/95 backdrop-blur-2xl border border-border/80 shadow-2xl rounded-3xl p-3 flex items-center gap-3">
          <Button
            className="flex-1 h-12 rounded-2xl font-extrabold text-base gradient-honey text-primary-foreground shadow-md"
            onClick={() => navigate("/my-tasks?tab=published")}
          >
            {task.status === "completed" ? "המטלות והדירוגים שלי" : "ניהול וסיום המטלה"}
          </Button>
          <Button
            variant="outline"
            className="h-12 px-5 rounded-2xl font-bold text-base border-border bg-card hover:bg-accent text-foreground"
            onClick={() => openEdit(task)}
          >
            <Pencil size={16} className="ms-1" />
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
