import { Button } from "@/components/ui/button";
import { MapPin, PencilSimple as Pencil, Star, Heart, ArrowLeft, ArrowUpLeft, CalendarBlank as Calendar, Timer } from "@phosphor-icons/react";
import CategoryIcon from "./CategoryIcon";
import { formatCurrency, formatTaskWhen, formatDuration, formatDistance } from "@/lib/format";
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
  /** "popup": the card as drawn over the map — icon at the trailing edge, price on one line. */
  variant?: "list" | "popup";
};

/**
 * Reading order follows what a worker decides on: the pay and the distance
 * first, then what the job is, then when. Applying happens on the detail
 * screen, where the whole task is visible, never from the list.
 */
const TaskCard = ({ task, index, saved = false, onToggleSave, variant = "list" }: TaskCardProps) => {
  const isPopup = variant === "popup";
  const { user } = useAuth();
  const navigate = useNavigate();
  const isOwner = Boolean(user && task.creatorId === user.id);

  const handleCardClick = () => {
    if (task.dbId) {
      navigate(`/task/${task.dbId}`);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`מטלה: ${task.name}`}
      className={cn("min-w-0 bg-card rounded-lg p-3.5 border-[1.2px] shadow-card cursor-pointer flex flex-col", isPopup ? "gap-5 border-primary-soft-border" : "gap-4 border-border", "animate-fade-in opacity-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2")}
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
      {/* What the job is, with its category on the trailing edge. */}
      <div className={cn("flex items-start gap-2.5", isPopup && "flex-row-reverse")}>
        <CategoryIcon variant="figma" category={task.category} className="shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-lg text-foreground leading-6">{task.name}</h3>
          <p className="text-muted-foreground text-[13px] leading-[18px] truncate">{task.shortDesc}</p>
        </div>
        {!isPopup && (
          <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs leading-4 text-muted-foreground">
            {task.categoryLabel}
          </span>
        )}
      </div>

      {/* When, how long, where. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs leading-[18px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Calendar size={14} aria-hidden="true" />
          {formatTaskWhen(task.date, task.time)}
        </span>
        {task.duration > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <Timer size={14} aria-hidden="true" />
            {formatDuration(task.duration)}
          </span>
        )}
        {task.location && (
          <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
            <MapPin size={14} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{task.location}</span>
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {task.distance !== undefined && (
          <span className="rounded-[4px] bg-honey-light/85 px-2.5 py-[3px] text-xs leading-6 text-foreground tabular">
            <span className="sr-only">מרחק: </span>
            {formatDistance(task.distance)}
          </span>
        )}
        <span className="rounded-[4px] bg-secondary px-2.5 py-[3px] text-xs leading-6 text-foreground">
          {task.workers === 1 ? "עובד אחד" : `${task.workers} עובדים`}
        </span>
        {task.creatorRating !== undefined && (
          <span
            className="inline-flex items-center gap-1 rounded-[4px] bg-secondary px-2.5 py-[3px] text-xs leading-6 text-foreground"
            aria-label={task.creatorRating ? `דירוג המפרסם ${task.creatorRating.average.toFixed(1)} מתוך 5, ${task.creatorRating.count} דירוגים` : "למפרסם עדיין אין דירוגים"}
          >
            {task.creatorRating ? (
              <>
                <Star size={12} weight="fill" className="text-primary" aria-hidden="true" />
                <bdi className="tabular-nums">{task.creatorRating.average.toFixed(1)}</bdi>
                <span className="text-muted-foreground">({task.creatorRating.count})</span>
              </>
            ) : "מפרסם חדש"}
          </span>
        )}
      </div>

      {isOwner && task.publishState === "pending_review" && (
        <p className="rounded-lg border border-primary-soft-border bg-primary-soft px-3 py-2 text-sm text-foreground">
          המטלה שלך ממתינה לאישור. בינתיים היא לא מוצגת לאחרים.
        </p>
      )}

      <div className={cn("border-t border-border pt-4", isPopup && "flex items-center justify-between gap-3")}>
        <p className="text-[22px] font-medium leading-7 text-foreground tabular text-right">{formatCurrency(task.payment)}</p>
        <p className="text-xs leading-[18px] text-muted-foreground">
          {task.paymentType === "hour" ? "לשעת עבודה" : isPopup ? "עבור המשימה" : "למשימה זו"}
        </p>
      </div>

      <div className="flex items-center gap-2.5">
        {isOwner ? (
          <Button
            variant="outline"
            onClick={(e) => { e.stopPropagation(); navigate(`/task/${task.dbId}`, { state: { openEdit: true } }); }}
            className="h-12 flex-1 gap-2 rounded-full font-medium"
          >
            <Pencil size={16} />
            עריכה
          </Button>
        ) : (
          <Button
            onClick={(e) => { e.stopPropagation(); handleCardClick(); }}
            className="h-12 flex-1 gap-2.5 rounded-full font-medium"
          >
            לפרטי המשימה
            {isPopup ? <ArrowUpLeft size={16} aria-hidden="true" /> : <ArrowLeft size={16} aria-hidden="true" />}
          </Button>
        )}
        {onToggleSave && task.dbId && !isOwner && (
          <button
            type="button"
            aria-pressed={saved}
            aria-label={saved ? "הסרה מהמטלות השמורות" : "שמירת המטלה"}
            onClick={(e) => { e.stopPropagation(); onToggleSave(task.dbId!); }}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#DBD6F0] bg-card text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Heart size={20} weight={saved ? "fill" : "regular"} className={cn(saved && "text-primary")} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
};

export type { Task };
export default TaskCard;
