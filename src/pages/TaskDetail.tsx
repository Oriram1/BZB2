import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import CategoryIcon from "@/components/tasks/CategoryIcon";
import {
  ArrowRight,
  DollarSign,
  Users,
  MapPin,
  Calendar,
  Clock,
  FileText,
  StickyNote,
  User,
} from "lucide-react";

const categoryLabels: Record<string, string> = {
  housework: "🏠 עבודות בית",
  handyman: "🔧 הנדימן",
  tutoring: "📚 לימודים",
  babysitting: "👶 בייביסיטר",
  pets: "🐾 חיות מחמד",
  gardening: "🌿 גינון",
  other: "📦 אחר",
};

const statusLabels: Record<string, string> = {
  open: "הרחבה",
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
        .single();

      if (error || !data) {
        toast.error("המטלה לא נמצאה");
        navigate(-1);
        return;
      }
      setTask(data);

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

  const goBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate("/tasks");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 pt-20 max-w-2xl mx-auto" dir="rtl">
        <Skeleton className="h-8 w-32 mb-6" />
        <Skeleton className="h-48 w-full rounded-2xl mb-4" />
        <Skeleton className="h-6 w-3/4 mb-2" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }

  if (!task) return null;

  const isOwner = user?.id === task.creator_id;
  const creatorAvatar = creator?.avatar_url || `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${task.creator_id}`;

  return (
    <div className="min-h-screen bg-background pb-24" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={goBack}>
          <ArrowRight size={20} />
        </Button>
        <h1 className="font-extrabold text-lg text-foreground truncate flex-1">{task.name}</h1>
        <Badge variant="secondary" className="rounded-xl font-bold text-xs">
          {statusLabels[task.status] || task.status}
        </Badge>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Image */}
        {task.image_url && (
          <img
            src={task.image_url}
            alt={task.name}
            className="w-full h-48 object-cover rounded-2xl"
          />
        )}

        {/* Category & Title */}
        <div className="flex items-start gap-3">
          <CategoryIcon category={task.category} className="shrink-0 mt-1" />
          <div className="flex-1">
            <h2 className="font-extrabold text-2xl text-foreground">{task.name}</h2>
            <p className="text-muted-foreground mt-1">{task.short_desc}</p>
            <Badge variant="secondary" className="mt-2 rounded-xl font-bold text-xs">
              {categoryLabels[task.category] || task.category}
            </Badge>
          </div>
        </div>

        {/* Details Grid */}
        <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <DollarSign size={16} className="text-primary" />
              <span className="text-foreground font-semibold">
                ₪{task.payment} / {task.payment_type === "hour" ? "שעה" : "משימה"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Users size={16} className="text-primary" />
              <span className="text-foreground">{task.workers_needed} עובדים</span>
            </div>
            {task.location && (
              <div className="flex items-center gap-2 col-span-2">
                <MapPin size={16} className="text-primary" />
                <span className="text-foreground">{task.location}</span>
              </div>
            )}
            {task.scheduled_date && (
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-primary" />
                <span className="text-foreground">{task.scheduled_date}</span>
              </div>
            )}
            {task.scheduled_time && (
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-primary" />
                <span className="text-foreground">{task.scheduled_time}</span>
              </div>
            )}
            {task.duration_hours && (
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-primary" />
                <span className="text-foreground">{task.duration_hours} שעות</span>
              </div>
            )}
          </div>
        </div>

        {/* Full Description */}
        {task.full_desc && (
          <div className="bg-card rounded-2xl border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <FileText size={16} className="text-primary" />
              <h3 className="font-bold text-foreground">תיאור מפורט</h3>
            </div>
            <p className="text-muted-foreground whitespace-pre-wrap">{task.full_desc}</p>
          </div>
        )}

        {/* Notes */}
        {task.notes && (
          <div className="bg-card rounded-2xl border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <StickyNote size={16} className="text-primary" />
              <h3 className="font-bold text-foreground">הערות</h3>
            </div>
            <p className="text-muted-foreground whitespace-pre-wrap">{task.notes}</p>
          </div>
        )}

        {/* Creator */}
        {creator && (
          <div className="bg-card rounded-2xl border border-border p-5 flex items-center gap-4">
            <img
              src={creatorAvatar}
              alt="פרופיל"
              className="w-12 h-12 rounded-full object-cover border-2 border-primary/20"
            />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">פורסם על ידי</p>
              <p className="font-bold text-foreground">
                {creator.first_name} {creator.last_name}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => navigate(`/profile/${creator.user_id}`)}
            >
              <User size={14} className="ml-1" />
              פרופיל
            </Button>
          </div>
        )}
      </div>

      {/* Bottom Action Bar */}
      {!isOwner && task.status === "open" && isBee && (
        <div className="fixed bottom-16 left-0 right-0 bg-background/90 backdrop-blur-lg border-t border-border p-4 z-30">
          <div className="max-w-2xl mx-auto">
            <Button
              className="w-full gradient-honey text-primary-foreground rounded-full font-bold text-lg py-6 hover:scale-[1.02] active:scale-95 transition-transform"
              onClick={handleApply}
              disabled={applying || alreadyApplied}
            >
              {alreadyApplied ? "כבר הגשת מועמדות ✓" : "אני מעוניין/ת 🐝"}
            </Button>
          </div>
        </div>
      )}

      {isOwner && (
        <div className="fixed bottom-16 left-0 right-0 bg-background/90 backdrop-blur-lg border-t border-border p-4 z-30">
          <div className="max-w-2xl mx-auto">
            <Button
              variant="outline"
              className="w-full rounded-full font-bold text-lg py-6"
              onClick={() => navigate("/my-tasks")}
            >
              ניהול מטלה
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskDetail;
