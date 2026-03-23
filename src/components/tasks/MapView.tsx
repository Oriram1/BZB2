import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MapPin, DollarSign, Calendar, Clock } from "lucide-react";
import CategoryIcon from "./CategoryIcon";
import type { Task } from "./TaskCard";

const MapView = ({ tasks }: { tasks: Task[] }) => {
  const [selectedTask, setSelectedTask] = useState<number | null>(null);
  const selected = tasks.find((t) => t.id === selectedTask);

  return (
    <div className="rounded-3xl overflow-hidden border border-border shadow-lg animate-fade-in">
      <div className="relative bg-gradient-to-br from-accent/20 via-muted to-primary/5 h-[500px]">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: `
            linear-gradient(hsl(var(--border)) 1px, transparent 1px),
            linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }} />

        <div className="absolute top-4 left-4 bg-card/90 backdrop-blur-sm rounded-2xl px-4 py-2 border border-border shadow-sm">
          <p className="text-xs font-bold text-muted-foreground flex items-center gap-1">
            <MapPin size={12} /> מרכז ישראל
          </p>
        </div>

        {tasks.map((task, i) => {
          const x = ((task.lng - 34.7) / 0.3) * 80 + 10;
          const y = ((32.2 - task.lat) / 0.3) * 80 + 10;
          return (
            <button
              key={task.id}
              onClick={() => setSelectedTask(task.id === selectedTask ? null : task.id)}
              className={`absolute transition-all duration-300 group animate-pop-in opacity-0 ${
                task.id === selectedTask ? "z-30 scale-125" : "z-20 hover:scale-110"
              }`}
              style={{
                left: `${Math.min(Math.max(x, 5), 90)}%`,
                top: `${Math.min(Math.max(y, 5), 85)}%`,
                animationDelay: `${i * 0.12}s`,
                animationFillMode: "forwards",
              }}
            >
              <div className="relative flex flex-col items-center">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg border-2 transition-all duration-300 ${
                  task.id === selectedTask
                    ? "gradient-honey border-primary-foreground shadow-glow"
                    : "bg-card border-border group-hover:border-primary group-hover:shadow-honey"
                }`}>
                  <CategoryIcon category={task.category} showBg={false} size={18} />
                </div>
                <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-transparent border-t-card -mt-0.5" />
                <span className={`absolute -bottom-5 text-[10px] font-bold whitespace-nowrap px-2 py-0.5 rounded-full transition-all duration-300 ${
                  task.id === selectedTask ? "bg-primary text-primary-foreground scale-110" : "bg-card/90 text-foreground"
                }`}>
                  ₪{task.payment}
                </span>
              </div>
            </button>
          );
        })}

        {selected && (
          <div className="absolute bottom-4 left-4 right-4 bg-card rounded-2xl p-4 border border-border shadow-xl animate-slide-up z-40">
            <div className="flex items-start gap-3">
              <CategoryIcon category={selected.category} />
              <div className="flex-1">
                <h3 className="font-extrabold text-foreground">{selected.name}</h3>
                <p className="text-sm text-muted-foreground">{selected.shortDesc}</p>
                <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><DollarSign size={12} />₪{selected.payment}/{selected.paymentType === "hour" ? "שעה" : "משימה"}</span>
                  <span className="flex items-center gap-1"><MapPin size={12} />{selected.distance} ק״מ</span>
                  <span className="flex items-center gap-1"><Calendar size={12} />{selected.date}</span>
                  <span className="flex items-center gap-1"><Clock size={12} />{selected.time}</span>
                </div>
              </div>
              <Button size="sm" className="gradient-honey text-primary-foreground rounded-full border-none font-bold shrink-0 hover:scale-105 active:scale-95 transition-transform duration-300">
                אני מעוניין/ת 🐝
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MapView;
