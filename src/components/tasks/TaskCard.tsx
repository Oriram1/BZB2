import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DollarSign, Users, MapPin, Calendar, Clock } from "lucide-react";
import CategoryIcon from "./CategoryIcon";

interface Task {
  id: number;
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
  distance: number;
}

const TaskCard = ({ task, index }: { task: Task; index: number }) => (
  <div
    className="bg-card rounded-3xl p-6 border border-border card-hover cursor-pointer group relative overflow-hidden animate-fade-in opacity-0"
    style={{ animationDelay: `${index * 0.08}s`, animationFillMode: "forwards" }}
  >
    <div className="absolute inset-0 gradient-honey opacity-0 group-hover:opacity-[0.03] transition-opacity duration-500" />
    <div className="flex items-start gap-3 mb-3 relative">
      <CategoryIcon category={task.category} className="shrink-0 group-hover:scale-110 transition-transform duration-300" />
      <div className="flex-1 min-w-0">
        <h3 className="font-extrabold text-lg text-foreground">{task.name}</h3>
        <p className="text-muted-foreground text-sm mt-1 truncate">{task.shortDesc}</p>
      </div>
      <Badge variant="secondary" className="text-xs shrink-0 rounded-xl font-bold">
        {task.categoryLabel}
      </Badge>
    </div>
    <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground mt-4">
      <div className="flex items-center gap-1.5"><DollarSign size={14} className="text-primary" />₪{task.payment} / {task.paymentType === "hour" ? "שעה" : "משימה"}</div>
      <div className="flex items-center gap-1.5"><Users size={14} className="text-primary" />{task.workers} עובדים</div>
      <div className="flex items-center gap-1.5"><MapPin size={14} className="text-primary" />{task.distance} ק״מ</div>
      <div className="flex items-center gap-1.5"><Calendar size={14} className="text-primary" />{task.date}</div>
      <div className="flex items-center gap-1.5"><Clock size={14} className="text-primary" />{task.time}</div>
      <div className="flex items-center gap-1.5"><Clock size={14} className="text-primary" />{task.duration} שעות</div>
    </div>
    <div className="flex items-center justify-between mt-4 pt-4 border-t border-border relative">
      <Badge className="gradient-honey text-primary-foreground border-none rounded-xl font-bold animate-pulse">
        פתוחה
      </Badge>
      <Button size="sm" className="gradient-honey text-primary-foreground rounded-full border-none hover:scale-110 active:scale-95 transition-transform duration-300 font-bold">
        אני מעוניין/ת 🐝
      </Button>
    </div>
  </div>
);

export type { Task };
export default TaskCard;
