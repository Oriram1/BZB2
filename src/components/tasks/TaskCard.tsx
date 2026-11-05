import { Button } from "@/components/ui/button";
import { MapPin, Pencil, Star, Heart, ChevronLeft } from "lucide-react";
import CategoryIcon from "./CategoryIcon";
import { formatCurrency, formatDateTime, formatDuration, formatDistance } from "@/lib/format";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import type { TaskPublishState } from "@/lib/taskBilling";

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
  /** Null when the task was published without a location — never a stand-in value. */
  lat: number | null;
  lng: number | null;
  /** Undefined when the user's location is unknown — never a placeholder value. */
  distance?: number;
  creatorId?: string;
  creatorRating?: { average: number; count: number } | null;
  publishState?: TaskPublishState;
}

type TaskCardProps = {
  task: Task;
  index: number;
  /** Whether the signed-in person saved this task. Hidden when no toggle is given. */
  saved?: boolean;
  onToggleSave?: (taskId: string) => void;
};

/**
 * Reading order follows what a worker decides on: the pay and the distance
 * first, then what the job is, then when. Applying happens on the detail
 * screen, where the whole task is visible, never from the list.
 */
const TaskCard = ({ task, index, saved = false, onToggleSave }: TaskCardProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isOwner = Boolean(user && task.creatorId === user.id);

  const handleCardClick = () => {
    if (task.dbId) {
      navigate(`/task/${task.dbId}`);
    }
  };

  const meta = [
    formatDateTime(task.date, task.time),
    formatDuration(task.duration),
    task.workers === 1 ? "עובד אחד" : `${task.workers} עובדים`,
  ].filter(Boolean).join(" · ");

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`מטלה: ${task.name}`}
      className="bg-card rounded-3xl p-5 border border-border card-hover cursor-pointer group relative overflow-hidden animate-fade-in opacity-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      // Cap the stagger so a long list does not make the last card wait seconds.
      style={{ animationDelay: `${Math.min(index, 8) * 0.05}s`, animationFillMode: "forwards" }}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardClick();
        }
      }}
    >
      <div className="absolute inset-0 gradient-honey opacity-0 group-hover:opacity-[0.03] transition-opacity duration-500" />

      {/* Pay and distance: the two numbers a worker scans for. */}
      <div className="relative flex items-start justify-between gap-3">
        <p className="text-2xl font-extrabold text-foreground tabular leading-none">
          {formatCurrency(task.payment)}
          <span className="text-sm font-bold text-muted-foreground"> / {task.paymentType === "hour" ? "שעה" : "משימה"}</span>
        </p>
        <div className="flex items-center gap-1 shrink-0">
          {task.distance !== undefined && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-foreground tabular">
              <MapPin size={13} aria-hidden="true" />
              <span className="sr-only">מרחק: </span>
              {formatDistance(task.distance)}
            </span>
          )}
          {onToggleSave && task.dbId && !isOwner && (
            <button
              type="button"
              aria-pressed={saved}
              aria-label={saved ? "הסרה מהמטלות השמורות" : "שמירת המטלה"}
              onClick={(e) => { e.stopPropagation(); onToggleSave(task.dbId!); }}
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Heart size={20} className={cn(saved && "fill-destructive text-destructive")} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="relative mt-3 flex items-start gap-3">
        <CategoryIcon category={task.category} className="shrink-0 group-hover:scale-110 transition-transform duration-300" />
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-lg text-foreground leading-snug">{task.name}</h3>
          <p className="text-muted-foreground text-sm mt-0.5 truncate">{task.shortDesc}</p>
        </div>
      </div>

      <p className="relative mt-3 text-sm text-muted-foreground tabular">{meta}</p>

      {isOwner && task.publishState === "pending_review" && (
        <p className="relative mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
          המטלה שלך ממתינה לאישור. בינתיים היא לא מוצגת לאחרים.
        </p>
      )}

      <div className="relative mt-3 pt-3 border-t border-border flex items-center justify-between gap-3 min-h-11">
        {task.creatorRating !== undefined ? (
          <div className="flex items-center gap-1.5 text-xs leading-5" aria-label={task.creatorRating ? `דירוג המפרסם ${task.creatorRating.average.toFixed(1)} מתוך 5, ${task.creatorRating.count} דירוגים` : "למפרסם עדיין אין דירוגים"}>
            {task.creatorRating ? (
              <>
                <Star size={13} className="fill-primary-ink text-primary-ink" aria-hidden="true" />
                <bdi className="font-bold tabular-nums text-foreground">{task.creatorRating.average.toFixed(1)}</bdi>
                <span className="text-muted-foreground">({task.creatorRating.count === 1 ? "דירוג אחד" : `${task.creatorRating.count} דירוגים`})</span>
              </>
            ) : <span className="text-muted-foreground">למפרסם אין עדיין דירוגים</span>}
          </div>
        ) : <span />}
        {isOwner ? (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => { e.stopPropagation(); navigate(`/task/${task.dbId}`, { state: { openEdit: true } }); }}
            className="rounded-full min-h-11 font-bold shrink-0 gap-1"
          >
            <Pencil size={14} />
            עריכה
          </Button>
        ) : (
          <span className="inline-flex items-center gap-0.5 text-sm font-bold text-primary-ink" aria-hidden="true">
            לפרטים <ChevronLeft size={16} />
          </span>
        )}
      </div>
    </div>
  );
};

export type { Task };
export default TaskCard;
