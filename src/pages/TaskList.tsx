import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import BzbLogo from "@/components/BzbLogo";
import { Map, List, SlidersHorizontal, Home, Wrench, BookOpen, Baby, PawPrint, Leaf, Package, Sparkles, ArrowLeft } from "lucide-react";
import TaskCard from "@/components/tasks/TaskCard";
import MapView from "@/components/tasks/MapView";
import type { Task } from "@/components/tasks/TaskCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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

const categoryLabels: Record<string, string> = {
  housework: "🏠 עבודות בית", handyman: "🔧 הנדימן", tutoring: "📚 לימודים",
  babysitting: "👶 בייביסיטר", pets: "🐾 חיות מחמד", gardening: "🌿 גינון", other: "📦 אחר",
};

const TaskList = () => {
  const navigate = useNavigate();
  const { roles } = useAuth();
  const isTasker = roles.includes("tasker");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [maxDistance, setMaxDistance] = useState(10);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTasks = async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false });

      if (!error && data) {
        const mapped: Task[] = data.map((t, i) => ({
          id: i + 1,
          dbId: t.id,
          name: t.name,
          shortDesc: t.short_desc,
          category: t.category,
          categoryLabel: categoryLabels[t.category] || "📦 אחר",
          payment: Number(t.payment),
          paymentType: t.payment_type,
          location: t.location || "",
          date: t.scheduled_date || "",
          time: t.scheduled_time || "",
          duration: Number(t.duration_hours) || 0,
          workers: t.workers_needed,
          status: t.status,
          lat: t.latitude || 32.0753,
          lng: t.longitude || 34.7754,
          distance: Math.round(Math.random() * 8 * 10) / 10 + 0.5,
        }));
        setTasks(mapped);
      }
      setLoading(false);
    };
    fetchTasks();
  }, []);

  const filteredTasks = tasks
    .filter((t) => selectedCategory === "all" || t.category === selectedCategory)
    .filter((t) => t.distance <= maxDistance);

  return (
    <div className="min-h-screen bg-muted relative" dir="rtl">
      <div className="absolute top-40 left-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-blob" />
      <div className="absolute bottom-20 right-0 w-80 h-80 bg-accent/5 rounded-full blur-3xl animate-blob animation-delay-2000" />

      {/* Header */}
      <header className="gradient-honey py-4 px-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 hover:scale-105 transition-transform duration-300 shrink-0">
            <BzbLogo className="w-10 h-10" />
            <span className="font-extrabold text-primary-foreground text-lg">BZB</span>
          </Link>
          <nav className="flex items-center gap-4 ml-2">
            {isTasker && (
              <Link to="/create-task">
                <Button size="sm" className="bg-card text-foreground font-bold rounded-full hover:scale-105 active:scale-95 transition-transform duration-300">
                  + פרסם מטלה
                </Button>
              </Link>
            )}
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
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full text-primary-foreground hover:bg-primary-foreground/10">
              <ArrowLeft size={20} />
            </Button>
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
