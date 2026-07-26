import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Map, List, SlidersHorizontal, SearchX } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { categoryFilters, categoryLabel } from "@/lib/categories";
import { distanceKm } from "@/lib/format";
import TaskCard from "@/components/tasks/TaskCard";
import MapView from "@/components/tasks/MapView";
import type { Task } from "@/components/tasks/TaskCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const TaskList = () => {
  const { roles } = useAuth();
  const isTasker = roles.includes("tasker");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [maxDistance, setMaxDistance] = useState(10);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  /** null until the browser hands us a position; distance stays hidden until then. */
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      // Permission denied or unavailable: leave userPos null rather than guessing.
      () => setUserPos(null),
      { timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);

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
          categoryLabel: categoryLabel(t.category),
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
        }));
        setTasks(mapped);
      }
      setLoading(false);
    };
    fetchTasks();
  }, []);

  /** Distance is only real once we know where the user is. */
  const tasksWithDistance = tasks.map((t) => ({
    ...t,
    distance: userPos ? distanceKm(userPos, { lat: t.lat, lng: t.lng }) : undefined,
  }));

  const filteredTasks = tasksWithDistance
    .filter((t) => selectedCategory === "all" || t.category === selectedCategory)
    // Without a location there is nothing to filter on, so show everything.
    .filter((t) => t.distance === undefined || t.distance <= maxDistance);

  return (
    <div className="min-h-screen bg-muted relative" dir="rtl">
      <div className="absolute top-40 left-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-blob" />
      <div className="absolute bottom-20 right-0 w-80 h-80 bg-accent/5 rounded-full blur-3xl animate-blob animation-delay-2000" />

      <PageHeader
        action={
          isTasker && (
            <Link to="/create-task">
              <Button size="sm" className="bg-card text-foreground font-bold rounded-full hover:scale-105 active:scale-95 transition-transform duration-300">
                + פרסם מטלה
              </Button>
            </Link>
          )
        }
      />

      <div className="max-w-5xl mx-auto py-8 px-4 relative z-10">
        <div className="flex items-center justify-between mb-6 animate-fade-in">
          <h1 className="text-3xl font-bold text-foreground">מטלות זמינות</h1>
          <div className="flex items-center gap-1 bg-card rounded-2xl p-1 border border-border shadow-sm" role="group" aria-label="תצוגה">
            <button
              onClick={() => setViewMode("list")}
              aria-pressed={viewMode === "list"}
              className={`flex items-center gap-1.5 min-h-11 px-4 py-2 rounded-xl text-sm font-bold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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
              aria-pressed={viewMode === "map"}
              className={`flex items-center gap-1.5 min-h-11 px-4 py-2 rounded-xl text-sm font-bold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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
          {/* Only offer a distance filter when we can actually measure distance. */}
          {userPos && (
            <div className="flex-1">
              <label htmlFor="distance-filter" className="text-sm font-bold text-muted-foreground mb-2 flex items-center gap-1.5">
                <SlidersHorizontal size={14} />
                מרחק (ק״מ): <span className="text-primary-ink font-extrabold tabular">{maxDistance}</span>
              </label>
              <input
                id="distance-filter"
                type="range"
                min={1}
                max={50}
                value={maxDistance}
                onChange={(e) => setMaxDistance(Number(e.target.value))}
                className="w-full h-11 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
              />
            </div>
          )}
          <div className="flex-1">
            <span id="category-filter-label" className="text-sm font-bold text-muted-foreground mb-2 block">
              קטגוריה
            </span>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="category-filter-label">
              {categoryFilters.map((c) => {
                const Icon = c.icon;
                const isSelected = selectedCategory === c.value;
                return (
                  <button
                    key={c.value}
                    onClick={() => setSelectedCategory(c.value)}
                    aria-pressed={isSelected}
                    className={`flex items-center gap-1.5 min-h-11 px-4 py-2 rounded-2xl text-sm font-bold transition-all duration-300 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      isSelected
                        ? "gradient-honey text-primary-foreground border-transparent shadow-honey"
                        : "bg-card text-foreground border-border hover:border-primary"
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
        {!loading && filteredTasks.length > 0 && (
          viewMode === "list" ? (
            <div className="grid md:grid-cols-2 gap-4">
              {filteredTasks.map((task, i) => (
                <TaskCard key={task.id} task={task} index={i} />
              ))}
            </div>
          ) : (
            <MapView tasks={filteredTasks} />
          )
        )}

        {loading && (
          <div className="grid md:grid-cols-2 gap-4" aria-live="polite" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-card rounded-3xl p-6 border border-border h-44 animate-pulse" />
            ))}
            <span className="sr-only">טוען מטלות</span>
          </div>
        )}

        {!loading && filteredTasks.length === 0 && (
          <div className="text-center py-16 animate-fade-in">
            <SearchX className="w-12 h-12 mx-auto mb-4 text-muted-foreground" aria-hidden="true" />
            <p className="text-lg font-semibold text-foreground">לא נמצאו מטלות</p>
            <p className="text-muted-foreground mt-1">
              {selectedCategory !== "all"
                ? "אפשר לנסות קטגוריה אחרת או להרחיב את טווח החיפוש."
                : "עוד לא פורסמו מטלות באזור. כדאי לבדוק שוב מאוחר יותר."}
            </p>
            {selectedCategory !== "all" && (
              <Button variant="outline" className="mt-4 rounded-full" onClick={() => setSelectedCategory("all")}>
                לניקוי הסינון
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskList;
