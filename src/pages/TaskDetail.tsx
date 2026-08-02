import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
  ArrowRight,
  DollarSign,
  Users,
  MapPin,
  Calendar,
  Clock,
  Hourglass,
  FileText,
  StickyNote,
  User,
  Trash2,
  Share2,
  Eye,
} from "lucide-react";
import { formatCurrency, formatDate, formatTime, formatDuration } from "@/lib/format";
import { categoryLabel } from "@/lib/categories";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const statusLabels: Record<string, string> = {
  open: "פתוחה להצעות",
  accepted: "התקבלה",
  in_progress: "בביצוע",
  completed: "הושלמה",
  cancelled: "בוטלה",
};

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
  workers_needed: number;
  status: string;
  notes: string | null;
  image_url: string | null;
  creator_id: string;
  views_count: number;
  created_at: string;
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
  const { user, roles } = useAuth();
  const isBee = roles.includes("bee");
  const [task, setTask] = useState<TaskData | null>(null);
  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [alreadyApplied, setAlreadyApplied] = useState(false);

  useEffect(() => {
    if (!id) return;
    const fetchTask = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("tasks")
      .select("*")
      .eq("id", id)
      .is("archived_at", null)
        .single();

      if (error || !data) {
        toast.error("המטלה לא נמצאה");
        navigate(-1);
        return;
      }
      setTask(data);

      // Increment view count
      if (!user || data.creator_id !== user.id) {
        try {
          await supabase
            .from("tasks")
            .update({ views_count: (data.views_count || 0) + 1 })
            .eq("id", id);
        } catch (e) {
          // Ignore view increment failure
        }
      }

      // Fetch creator profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, avatar_url, user_id")
        .eq("user_id", data.creator_id)
        .single();
      if (profile) setCreator(profile);

      // Check if user already applied
      if (user) {
        const { data: app } = await supabase
          .from("task_applications")
          .select("id")
          .eq("task_id", id)
          .eq("applicant_id", user.id)
          .maybeSingle();
        if (app) setAlreadyApplied(true);
      }

      setLoading(false);
    };
    fetchTask();
  }, [id, user]);

  const handleApply = async () => {
    if (!user || !isBee) {
      if (!user) {
        toast.error("יש להתחבר כדי להגיש מועמדות");
        navigate("/login");
      } else {
        toast.error("רק מקבלי מטלות יכולים להגיש מועמדות");
      }
      return;
    }
    if (!task) return;
    setApplying(true);
    const { error } = await supabase.from("task_applications").insert({
      task_id: task.id,
      applicant_id: user.id,
    });
    if (error) {
      if (error.code === "23505") {
        toast.info("כבר הגשת מועמדות למטלה זו");
        setAlreadyApplied(true);
      } else {
        toast.error("שגיאה בהגשת המועמדות");
      }
    } else {
      toast.success("המועמדות נשלחה! 🐝");
      setAlreadyApplied(true);
    }
    setApplying(false);
  };

  const handleDeleteTask = async () => {
    if (!task || !user || !isOwner) return;
    setLoading(true);
    const { error } = await supabase.rpc("archive_task", { _task_id: task.id, _user_id: user.id });
    setLoading(false);
    if (error) {
      toast.error("שגיאה במחיקת המטלה: " + error.message);
    } else {
      toast.success("המטלה נמחקה בהצלחה 🗑️");
      navigate("/my-tasks");
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: task?.name || "מטלה ב-BusyBee",
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success("הקישור הועתק ללוח! 📋");
    }
  };

  const goBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate("/tasks");
    }
  };

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
  const creatorAvatar = creator?.avatar_url || `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${task.creator_id}`;

  return (
    <div className="min-h-screen bg-background pb-36" dir="rtl">
      {/* Standard App Page Header */}
      <PageHeader
        title={task.name}
        showBack={true}
        action={
          <Button
            variant="ghost"
            size="icon"
            onClick={handleShare}
            className="rounded-full text-primary-foreground hover:bg-foreground/10 shrink-0 h-10 w-10"
            aria-label="שיתוף מטלה"
          >
            <Share2 size={18} />
          </Button>
        }
      />

      <div className="max-w-xl mx-auto px-4 pt-4 space-y-5">
        {/* Cover Image */}
        {task.image_url && (
          <div className="relative rounded-3xl overflow-hidden shadow-sm border border-border/60">
            <img
              src={task.image_url}
              alt={task.name}
              className="w-full h-52 sm:h-64 object-cover"
            />
            <div className="absolute top-3 right-3">
              <Badge className="gradient-honey text-primary-foreground border-none rounded-full px-3 py-1 font-bold text-xs shadow-md">
                {statusLabels[task.status] || task.status}
              </Badge>
            </div>
          </div>
        )}

        {/* Title Header Card */}
        <div className="bg-card rounded-3xl p-5 border border-border/60 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CategoryIcon category={task.category} className="shrink-0" />
              <Badge variant="secondary" className="rounded-full px-3 py-1 font-bold text-xs">
                {categoryLabel(task.category)}
              </Badge>
            </div>
            {!task.image_url && (
              <Badge className="gradient-honey text-primary-foreground border-none rounded-full px-3 py-1 font-bold text-xs">
                {statusLabels[task.status] || task.status}
              </Badge>
            )}
          </div>

          <div>
            <h2 className="font-black text-2xl sm:text-3xl text-foreground tracking-tight">{task.name}</h2>
            <p className="text-muted-foreground text-sm mt-1 leading-relaxed">{task.short_desc}</p>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 border-t border-border/40 font-medium">
            <span className="flex items-center gap-1">
              <Eye size={14} />
              {task.views_count} צפיות
            </span>
          </div>
        </div>

        {/* Payment Hero Card */}
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

        {/* Ergonomic Details Chips Grid */}
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

          {task.scheduled_date && (
            <div className="bg-card rounded-2xl p-4 border border-border/60 shadow-sm flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary-ink shrink-0">
                <Calendar size={18} />
              </div>
              <div>
                <span className="text-xs text-muted-foreground block font-medium">תאריך</span>
                <span className="font-bold text-foreground text-sm tabular">{formatDate(task.scheduled_date)}</span>
              </div>
            </div>
          )}

          {task.scheduled_time && (
            <div className="bg-card rounded-2xl p-4 border border-border/60 shadow-sm flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary-ink shrink-0">
                <Clock size={18} />
              </div>
              <div>
                <span className="text-xs text-muted-foreground block font-medium">שעה</span>
                <span className="font-bold text-foreground text-sm tabular">{formatTime(task.scheduled_time)}</span>
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

        {/* Detailed Description */}
        {task.full_desc && (
          <div className="bg-card rounded-3xl p-5 border border-border/60 shadow-sm space-y-2">
            <div className="flex items-center gap-2 text-foreground font-extrabold text-base mb-1">
              <FileText size={18} className="text-primary-ink" />
              <h3>תיאור מפורט</h3>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap dir-auto">{task.full_desc}</p>
          </div>
        )}

        {/* Notes Card */}
        {task.notes && (
          <div className="bg-amber-500/5 dark:bg-amber-500/10 rounded-3xl p-5 border border-amber-500/20 shadow-sm space-y-2">
            <div className="flex items-center gap-2 text-foreground font-extrabold text-base mb-1">
              <StickyNote size={18} className="text-amber-600 dark:text-amber-400" />
              <h3>הערות דגש</h3>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap dir-auto">{task.notes}</p>
          </div>
        )}

        {/* Creator Card */}
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
                  {creator.first_name} {creator.last_name}
                </span>
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
      </div>

      {/* Floating Bottom Action Bar (Thumb Zone) */}
      {!isOwner && task.status === "open" && isBee && (
        <div className="fixed bottom-4 left-4 right-4 max-w-xl mx-auto z-40 bg-background/95 backdrop-blur-2xl border border-border/80 shadow-2xl rounded-3xl p-3">
          <Button
            className="w-full h-12 gradient-honey text-primary-foreground rounded-2xl font-extrabold text-base shadow-md hover:scale-[1.01] active:scale-95 transition-transform"
            onClick={handleApply}
            disabled={applying || alreadyApplied}
          >
            {alreadyApplied ? "כבר הגשת מועמדות ✓" : "אני מעוניין/ת לבצע 🐝"}
          </Button>
        </div>
      )}

      {isOwner && (
        <div className="fixed bottom-4 left-4 right-4 max-w-xl mx-auto z-40 bg-background/95 backdrop-blur-2xl border border-border/80 shadow-2xl rounded-3xl p-3 flex items-center gap-3">
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-2xl font-bold text-base border-border bg-card hover:bg-accent text-foreground"
            onClick={() => navigate("/my-tasks")}
          >
            ניהול מטלה
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                className="h-12 px-5 rounded-2xl font-bold text-base gap-2"
              >
                <Trash2 size={18} />
                מחיקה
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle>מחיקת מטלה 🗑️</AlertDialogTitle>
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
        </div>
      )}
    </div>
  );
};

export default TaskDetail;
