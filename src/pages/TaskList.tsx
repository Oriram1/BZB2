import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import bzbLogo from "@/assets/bzb-logo.png";
import { Map, List, SlidersHorizontal, Home, Wrench, BookOpen, Baby, PawPrint, Leaf, Package, Sparkles } from "lucide-react";
import TaskCard from "@/components/tasks/TaskCard";
import MapView from "@/components/tasks/MapView";
import type { Task } from "@/components/tasks/TaskCard";

const categoryOptions = [
  { value: "all", label: "הכל", icon: Sparkles },
  { value: "housework", label: "עבודות בית", icon: Home },
  { value: "handyman", label: "הנדימן", icon: Wrench },
  { value: "tutoring", label: "לימודים", icon: BookOpen },
  { value: "babysitting", label: "בייביסיטר", icon: Baby },
  { value: "pets", label: "חיות מחמד", icon: PawPrint },
  { value: "gardening", label: "גינון", icon: Leaf },
  { value: "other", label: "אחר", icon: Package },
];

const mockTasks: Task[] = [
  { id: 1, name: "ניקיון בית", shortDesc: "ניקיון כללי של דירה 3 חדרים", category: "housework", categoryLabel: "🏠 עבודות בית", payment: 80, paymentType: "task", location: "תל אביב, רח׳ דיזנגוף 50", date: "2026-02-20", time: "10:00", duration: 3, workers: 1, status: "open", lat: 32.0753, lng: 34.7754, distance: 1.2 },
  { id: 2, name: "טיול עם כלב", shortDesc: "טיול שעה עם גולדן רטריבר", category: "pets", categoryLabel: "🐾 חיות מחמד", payment: 40, paymentType: "hour", location: "הרצליה, פארק הנשיא", date: "2026-02-18", time: "16:00", duration: 1, workers: 1, status: "open", lat: 32.1629, lng: 34.7908, distance: 3.5 },
  { id: 3, name: "גיזום גינה", shortDesc: "גיזום עצים ושיחים בגינה", category: "gardening", categoryLabel: "🌿 גינון", payment: 60, paymentType: "hour", location: "רמת גן, רח׳ ביאליק 12", date: "2026-02-22", time: "08:00", duration: 4, workers: 2, status: "open", lat: 32.0686, lng: 34.8248, distance: 2.8 },
  { id: 4, name: "בייביסיטר ערב", shortDesc: "השגחה על 2 ילדים גילאי 4-7", category: "babysitting", categoryLabel: "👶 בייביסיטר", payment: 50, paymentType: "hour", location: "גבעתיים, רח׳ כצנלסון 8", date: "2026-02-19", time: "18:00", duration: 4, workers: 1, status: "open", lat: 32.0715, lng: 34.8117, distance: 4.1 },
  { id: 5, name: "עזרה במתמטיקה", shortDesc: "שיעור פרטי מתמטיקה לכיתה י׳", category: "tutoring", categoryLabel: "📚 לימודים", payment: 70, paymentType: "hour", location: "פתח תקווה, רח׳ רוטשילד 5", date: "2026-02-21", time: "15:00", duration: 1.5, workers: 1, status: "open", lat: 32.0841, lng: 34.8878, distance: 6.2 },
  { id: 6, name: "הרכבת ארון", shortDesc: "הרכבת ארון איקאה 3 דלתות", category: "handyman", categoryLabel: "🔧 הנדימן", payment: 100, paymentType: "task", location: "ראשון לציון, רח׳ הרצל 20", date: "2026-02-18", time: "12:00", duration: 2, workers: 1, status: "open", lat: 31.9642, lng: 34.8048, distance: 8.0 },
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
      <div className="absolute top-40 left-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-blob" />
      <div className="absolute bottom-20 right-0 w-80 h-80 bg-accent/5 rounded-full blur-3xl animate-blob animation-delay-2000" />

      {/* Header */}
      <header className="gradient-honey py-4 px-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 hover:scale-105 transition-transform duration-300">
            <img src={bzbLogo} alt="BZB" className="w-10 h-10" />
            <span className="font-extrabold text-primary-foreground text-lg">BZB</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/create-task">
              <Button size="sm" className="bg-card text-foreground font-bold rounded-full hover:scale-105 active:scale-95 transition-transform duration-300">
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
        <div className="flex items-center justify-between mb-6 animate-fade-in">
          <h1 className="text-3xl font-extrabold text-foreground">מטלות זמינות 🐝</h1>
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
        <div className="glass rounded-3xl p-6 border border-border mb-6 flex flex-col md:flex-row gap-4 animate-fade-in" style={{ animationDelay: "0.1s" }}>
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
              {categoryOptions.map((c) => {
                const Icon = c.icon;
                return (
                  <button
                    key={c.value}
                    onClick={() => setSelectedCategory(c.value)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-bold transition-all duration-300 border ${
                      selectedCategory === c.value
                        ? "gradient-honey text-primary-foreground border-transparent scale-105 shadow-honey"
                        : "bg-card text-foreground border-border hover:border-primary hover:scale-105"
                    }`}
                  >
                    <Icon size={14} />
                    {c.label}
                  </button>
                );
              })}
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
          <div className="text-center py-16 text-muted-foreground animate-fade-in">
            <p className="text-6xl mb-4">🔍</p>
            <p className="text-lg font-semibold">לא נמצאו מטלות בטווח זה</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskList;
