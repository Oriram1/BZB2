import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import bzbLogo from "@/assets/bzb-logo.png";
import { Map, List, MapPin, Clock, Users, DollarSign, Calendar, SlidersHorizontal } from "lucide-react";

const categoryOptions = [
  { value: "all", label: "הכל" },
  { value: "housework", label: "🏠 עבודות בית" },
  { value: "gardening", label: "🌿 גינון" },
  { value: "babysitting", label: "👶 בייביסיטר" },
  { value: "pets", label: "🐾 חיות מחמד" },
  { value: "handyman", label: "🔧 הנדימן" },
  { value: "delivery", label: "🚚 משלוחים" },
  { value: "school", label: "📚 בית ספר" },
  { value: "tutoring", label: "👨‍🏫 שיעורים" },
  { value: "other", label: "📦 אחר" },
];

const mockTasks = [
  { id: 1, name: "ניקיון בית", shortDesc: "ניקיון כללי של דירה 3 חדרים", category: "housework", categoryLabel: "🏠 עבודות בית", payment: 80, paymentType: "task", location: "תל אביב, רח׳ דיזנגוף 50", date: "2026-02-20", time: "10:00", duration: 3, workers: 1, status: "open", lat: 32.08, lng: 34.77, distance: 1.2 },
  { id: 2, name: "טיול עם כלב", shortDesc: "טיול שעה עם גולדן רטריבר", category: "pets", categoryLabel: "🐾 חיות מחמד", payment: 40, paymentType: "hour", location: "הרצליה, פארק הנשיא", date: "2026-02-18", time: "16:00", duration: 1, workers: 1, status: "open", lat: 32.16, lng: 34.79, distance: 3.5 },
  { id: 3, name: "גיזום גינה", shortDesc: "גיזום עצים ושיחים בגינה", category: "gardening", categoryLabel: "🌿 גינון", payment: 60, paymentType: "hour", location: "רמת גן, רח׳ ביאליק 12", date: "2026-02-22", time: "08:00", duration: 4, workers: 2, status: "open", lat: 32.07, lng: 34.81, distance: 2.8 },
  { id: 4, name: "בייביסיטר ערב", shortDesc: "השגחה על 2 ילדים גילאי 4-7", category: "babysitting", categoryLabel: "👶 בייביסיטר", payment: 50, paymentType: "hour", location: "גבעתיים, רח׳ כצנלסון 8", date: "2026-02-19", time: "18:00", duration: 4, workers: 1, status: "open", lat: 32.07, lng: 34.81, distance: 4.1 },
  { id: 5, name: "עזרה במתמטיקה", shortDesc: "שיעור פרטי מתמטיקה לכיתה י׳", category: "tutoring", categoryLabel: "👨‍🏫 שיעורים פרטיים", payment: 70, paymentType: "hour", location: "פתח תקווה", date: "2026-02-21", time: "15:00", duration: 1.5, workers: 1, status: "open", lat: 32.09, lng: 34.88, distance: 6.2 },
  { id: 6, name: "משלוח חבילות", shortDesc: "איסוף ומסירה של 3 חבילות", category: "delivery", categoryLabel: "🚚 משלוחים", payment: 100, paymentType: "task", location: "ראשון לציון", date: "2026-02-18", time: "12:00", duration: 2, workers: 1, status: "open", lat: 31.96, lng: 34.80, distance: 8.0 },
];

const TaskList = () => {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [maxDistance, setMaxDistance] = useState(10);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");

  const filteredTasks = mockTasks
    .filter((t) => selectedCategory === "all" || t.category === selectedCategory)
    .filter((t) => t.distance <= maxDistance);

  return (
    <div className="min-h-screen bg-muted relative" dir="rtl">
      <div className="absolute top-40 left-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-0 w-80 h-80 bg-accent/5 rounded-full blur-3xl" />

      {/* Header */}
      <header className="gradient-honey py-4 px-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={bzbLogo} alt="BZB" className="w-10 h-10" />
            <span className="font-extrabold text-primary-foreground text-lg">BZB</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/create-task">
              <Button size="sm" className="bg-card text-foreground font-bold rounded-full hover:scale-105 transition-transform duration-300">
                + פרסם מטלה
              </Button>
            </Link>
            <Link to="/pricing">
              <Button size="sm" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10 rounded-full font-semibold">
                מחירים
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="sm" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10 rounded-full font-semibold">
                כניסה
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <div className="max-w-5xl mx-auto py-8 px-4 relative z-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-extrabold text-foreground">מטלות זמינות 🐝</h1>
          {/* View Toggle */}
          <div className="flex items-center gap-1 bg-card rounded-2xl p-1 border border-border shadow-sm">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all duration-300 ${
                viewMode === "list"
                  ? "gradient-honey text-primary-foreground shadow-honey"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List size={16} />
              רשימה
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all duration-300 ${
                viewMode === "map"
                  ? "gradient-honey text-primary-foreground shadow-honey"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Map size={16} />
              מפה
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="glass rounded-3xl p-6 border border-border mb-6 flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="text-sm font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
              <SlidersHorizontal size={14} />
              מרחק (ק״מ): <span className="text-primary font-extrabold">{maxDistance}</span>
            </label>
            <input
              type="range"
              min={1}
              max={50}
              value={maxDistance}
              onChange={(e) => setMaxDistance(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
          <div className="flex-1">
            <label className="text-sm font-bold text-muted-foreground mb-2 block">
              קטגוריה
            </label>
            <div className="flex flex-wrap gap-2">
              {categoryOptions.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setSelectedCategory(c.value)}
                  className={`px-4 py-2 rounded-2xl text-sm font-bold transition-all duration-300 border ${
                    selectedCategory === c.value
                      ? "gradient-honey text-primary-foreground border-transparent scale-105 shadow-honey"
                      : "bg-card text-foreground border-border hover:border-primary hover:scale-105"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        {viewMode === "list" ? (
          <div className="grid md:grid-cols-2 gap-4">
            {filteredTasks.map((task, i) => (
              <TaskCard key={task.id} task={task} index={i} />
            ))}
          </div>
        ) : (
          <MapView tasks={filteredTasks} />
        )}

        {filteredTasks.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-6xl mb-4">🔍</p>
            <p className="text-lg font-semibold">לא נמצאו מטלות בטווח זה</p>
          </div>
        )}
      </div>
    </div>
  );
};

const MapView = ({ tasks }: { tasks: typeof mockTasks }) => {
  const [selectedTask, setSelectedTask] = useState<number | null>(null);
  const selected = tasks.find((t) => t.id === selectedTask);

  return (
    <div className="rounded-3xl overflow-hidden border border-border shadow-lg">
      {/* Simulated Map */}
      <div className="relative bg-gradient-to-br from-emerald-100 via-green-50 to-teal-50 h-[500px]">
        {/* Grid lines for map feel */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: `
            linear-gradient(hsl(var(--border)) 1px, transparent 1px),
            linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }} />
        
        {/* Map label */}
        <div className="absolute top-4 left-4 bg-card/90 backdrop-blur-sm rounded-2xl px-4 py-2 border border-border shadow-sm">
          <p className="text-xs font-bold text-muted-foreground flex items-center gap-1">
            <MapPin size={12} /> מרכז ישראל
          </p>
        </div>

        {/* Task Pins */}
        {tasks.map((task) => {
          const x = ((task.lng - 34.7) / 0.3) * 80 + 10;
          const y = ((32.2 - task.lat) / 0.3) * 80 + 10;
          return (
            <button
              key={task.id}
              onClick={() => setSelectedTask(task.id === selectedTask ? null : task.id)}
              className={`absolute transition-all duration-300 group ${
                task.id === selectedTask ? "z-30 scale-125" : "z-20 hover:scale-110"
              }`}
              style={{ left: `${Math.min(Math.max(x, 5), 90)}%`, top: `${Math.min(Math.max(y, 5), 85)}%` }}
            >
              <div className={`relative flex flex-col items-center`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg border-2 transition-all duration-300 ${
                  task.id === selectedTask
                    ? "gradient-honey border-primary-foreground shadow-glow"
                    : "bg-card border-border group-hover:border-primary"
                }`}>
                  <span className="text-sm">{task.categoryLabel.split(" ")[0]}</span>
                </div>
                <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-transparent border-t-card -mt-0.5" />
                <span className={`absolute -bottom-5 text-[10px] font-bold whitespace-nowrap px-2 py-0.5 rounded-full ${
                  task.id === selectedTask ? "bg-primary text-primary-foreground" : "bg-card/90 text-foreground"
                }`}>
                  ₪{task.payment}
                </span>
              </div>
            </button>
          );
        })}

        {/* Selected task popup */}
        {selected && (
          <div className="absolute bottom-4 left-4 right-4 bg-card rounded-2xl p-4 border border-border shadow-xl animate-slide-up z-40">
            <div className="flex items-start justify-between">
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
              <Button size="sm" className="gradient-honey text-primary-foreground rounded-full border-none font-bold shrink-0 mr-3">
                אני מעוניין/ת
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const TaskCard = ({ task, index }: { task: (typeof mockTasks)[0]; index: number }) => (
  <div
    className="bg-card rounded-3xl p-6 border border-border card-hover cursor-pointer group relative overflow-hidden"
    style={{ animationDelay: `${index * 0.05}s` }}
  >
    <div className="absolute inset-0 gradient-honey opacity-0 group-hover:opacity-[0.03] transition-opacity duration-500" />
    <div className="flex items-start justify-between mb-3 relative">
      <div>
        <h3 className="font-extrabold text-lg text-foreground">{task.name}</h3>
        <p className="text-muted-foreground text-sm mt-1">{task.shortDesc}</p>
      </div>
      <Badge variant="secondary" className="text-xs shrink-0 rounded-xl font-bold">
        {task.categoryLabel}
      </Badge>
    </div>
    <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground mt-4">
      <div className="flex items-center gap-1.5"><DollarSign size={14} />₪{task.payment} / {task.paymentType === "hour" ? "שעה" : "משימה"}</div>
      <div className="flex items-center gap-1.5"><Users size={14} />{task.workers} עובדים</div>
      <div className="flex items-center gap-1.5"><MapPin size={14} />{task.distance} ק״מ</div>
      <div className="flex items-center gap-1.5"><Calendar size={14} />{task.date}</div>
      <div className="flex items-center gap-1.5"><Clock size={14} />{task.time}</div>
      <div className="flex items-center gap-1.5"><Clock size={14} />{task.duration} שעות</div>
    </div>
    <div className="flex items-center justify-between mt-4 pt-4 border-t border-border relative">
      <Badge className="gradient-honey text-primary-foreground border-none rounded-xl font-bold">
        פתוחה
      </Badge>
      <Button size="sm" className="gradient-honey text-primary-foreground rounded-full border-none hover:scale-105 transition-transform duration-300 font-bold">
        אני מעוניין/ת
      </Button>
    </div>
  </div>
);

export default TaskList;
