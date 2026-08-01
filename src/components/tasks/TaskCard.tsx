import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, MapPin, Calendar, Clock, Hourglass, type LucideIcon } from "lucide-react";
import CategoryIcon from "./CategoryIcon";
import { formatCurrency, formatDate, formatTime, formatDuration, formatDistance } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface Task {
  id: number;
  dbId?: string;
  name: string;
  shortDesc: string;
  category: string;
  categoryLabel: string;
  payment: number;
  paymentType: string;
  location: string;
  date: string;
  time: string;
  duration: number;
  workers: number;
  status: string;
  lat: number;
  lng: number;
  /** Undefined when the user's location is unknown — never a placeholder value. */
  distance?: number;
  creatorId?: string;
}

/**
 * One field of the card grid. Same icon size, same order (icon then value) and the
 * same alignment every time, so the eye learns a single pattern and scans it fast.
 */
const Field = ({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) => (
  <div className="flex items-center gap-1.5 min-w-0">
    <Icon size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
    <span className="sr-only">{label}: </span>
    <span className="tabular truncate">{value}</span>
  </div>
);

const TaskCard = ({ task, index }: { task: Task; index: number }) => {
  const { user, roles } = useAuth();
  const isBee = roles.includes("bee");
  const navigate = useNavigate();
  const [applying, setApplying] = useState(false);

  const handleCardClick = () => {
    if (task.dbId) {
      navigate(`/task/${task.dbId}`);
    }
  };

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
    if (!task.dbId || applying) return;
    setApplying(true);
    const { error } = await supabase.from("task_applications").insert({
      task_id: task.dbId,
      applicant_id: user.id,
    });
    setApplying(false);
    if (error) {
      if (error.code === "23505") {
        toast.info("כבר הגשת מועמדות למטלה זו");
      } else {
        toast.error("לא הצלחנו לשלוח את המועמדות. כדאי לנסות שוב בעוד רגע");
      }
    } else {
      toast.success("המועמדות נשלחה");
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`מטלה: ${task.name}`}
      className="bg-card rounded-3xl p-6 border border-border card-hover cursor-pointer group relative overflow-hidden animate-fade-in opacity-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      // Cap the stagger so a long list does not make the last card wait seconds.
      style={{ animationDelay: `${Math.min(index, 8) * 0.05}s`, animationFillMode: "forwards" }}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardClick();
        }
      }}
    >
      <div className="absolute inset-0 gradient-honey opacity-0 group-hover:opacity-[0.03] transition-opacity duration-500" />
      <div className="flex items-start gap-3 relative">
        <CategoryIcon category={task.category} className="shrink-0 group-hover:scale-110 transition-transform duration-300" />
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-lg text-foreground">{task.name}</h3>
          <p className="text-muted-foreground text-sm mt-1 truncate">{task.shortDesc}</p>
        </div>
        <Badge variant="secondary" className="text-xs shrink-0 rounded-xl font-bold">
          {task.categoryLabel}
        </Badge>
      </div>
      {/* Fixed field order — the optional distance sits last so nothing shifts when it is missing. */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-muted-foreground mt-4 pt-4 border-t border-border relative">
        <Field icon={Calendar} label="תאריך" value={formatDate(task.date)} />
        <Field icon={Clock} label="שעה" value={formatTime(task.time)} />
        <Field icon={Hourglass} label="משך" value={formatDuration(task.duration)} />
        <Field
          icon={Users}
          label="עובדים"
          value={task.workers === 1 ? "עובד אחד" : `${task.workers} עובדים`}
        />
        {/* Distance only renders when it was actually measured. */}
        {task.distance !== undefined && (
          <Field icon={MapPin} label="מרחק" value={formatDistance(task.distance)} />
        )}
      </div>
      <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-border relative">
        <p className="text-xl font-bold text-foreground tabular">
          {formatCurrency(task.payment)}
          <span className="text-sm font-bold text-muted-foreground"> / {task.paymentType === "hour" ? "שעה" : "משימה"}</span>
        </p>
        {user && isBee && (
          <Button
            size="sm"
            disabled={applying}
            onClick={(e) => { e.stopPropagation(); handleApply(); }}
            className="gradient-honey text-primary-foreground rounded-full border-none min-h-11 active:scale-95 transition-transform duration-200 font-bold shrink-0"
          >
            {applying ? "שולח..." : "להגיש מועמדות"}
          </Button>
        )}
      </div>
    </div>
  );
};

export type { Task };
export default TaskCard;
