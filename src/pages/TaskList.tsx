import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Map, List, MapPin, ChevronDown, SearchX, Plus, ExternalLink } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { categoryFilters, categoryLabel } from "@/lib/categories";
import { distanceKm } from "@/lib/format";
import TaskCard from "@/components/tasks/TaskCard";
import MapView from "@/components/tasks/MapView";
import type { Task } from "@/components/tasks/TaskCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/** Top of the distance slider. One step past it means "do not filter by distance". */
const MAX_DISTANCE_KM = 50;
const NO_DISTANCE_LIMIT = MAX_DISTANCE_KM + 1;

const TaskList = () => {
  const { roles } = useAuth();
  const isTasker = roles.includes("tasker");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [maxDistance, setMaxDistance] = useState(10);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  /** The distance slider starts collapsed: the current value is enough until the user wants to change it. */
  const [distanceOpen, setDistanceOpen] = useState(false);
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
        .is("archived_at", null)
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
          // No stand-in coordinates: a task published without a location must not
          // be measured against — and filtered out by — a place it never had.
          lat: t.latitude,
          lng: t.longitude,
          creatorId: t.creator_id,
        }));
        setTasks(mapped);
      }
      setLoading(false);
    };
    fetchTasks();
  }, []);

  /** Distance is only real once we know where the user is AND where the task is. */
  const tasksWithDistance = tasks.map((t) => ({
    ...t,
    distance:
      userPos && t.lat !== null && t.lng !== null
        ? distanceKm(userPos, { lat: t.lat, lng: t.lng })
        : undefined,
  }));

  const inCategory = tasksWithDistance.filter(
    (t) => selectedCategory === "all" || t.category === selectedCategory,
  );
  // Without a measurable distance there is nothing to filter on, so show everything.
  const filteredTasks = inCategory.filter(
    (t) => t.distance === undefined || maxDistance >= NO_DISTANCE_LIMIT || t.distance <= maxDistance,
  );
  /** How many tasks the distance slider alone is holding back, for the empty state. */
  const hiddenByDistance = inCategory.length - filteredTasks.length;

  const openFilteredTasksInGoogleMaps = () => {
    const locatedTasks = filteredTasks.filter(
      (task) => task.lat !== null && task.lng !== null,
    );
    if (locatedTasks.length === 0) return;

    const origin = userPos
      ? `${userPos.lat},${userPos.lng}`
      : `${locatedTasks[0].lat},${locatedTasks[0].lng}`;
    const destination = locatedTasks[locatedTasks.length - 1];
    const waypoints = locatedTasks
      .slice(0, -1)
      .map((task) => `${task.lat},${task.lng}`)
      .join("|");
    const params = new URLSearchParams({
      api: "1",
      origin,
      destination: `${destination.lat},${destination.lng}`,
    });
    if (waypoints) params.set("waypoints", waypoints);

    window.open(`https://www.google.com/maps/dir/?${params.toString()}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="min-h-screen bg-muted relative" dir="rtl">
      <div className="absolute top-40 left-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-blob" />
      <div className="absolute bottom-20 right-0 w-80 h-80 bg-accent/5 rounded-full blur-3xl animate-blob animation-delay-2000" />

      <PageHeader
        action={
          isTasker && (
            <Link to="/create-task">
              <button className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-white hover:bg-white/90 text-slate-950 font-black text-xs sm:text-sm rounded-full shadow-md hover:shadow-lg transition-all duration-200 border border-amber-200/60">
                <Plus size={16} className="text-amber-600 stroke-[3]" />
                <span>פרסום מטלה</span>
              </button>
            </Link>
          )
        }
      />

      <div className="max-w-5xl mx-auto py-5 px-4 pb-28 md:pb-5 relative z-10">
        {/* Icon-only toggle: two states with familiar icons need no labels, and the
            narrow control keeps the title on one line down to 320px. */}
        <div className="flex items-center justify-between gap-3 mb-4 animate-fade-in">
          <h1 className="text-2xl font-bold text-foreground">מטלות זמינות</h1>
          <div className="flex items-center gap-2 shrink-0">
            {filteredTasks.some((task) => task.lat !== null && task.lng !== null) && (
              <button
                type="button"
                onClick={openFilteredTasksInGoogleMaps}
                aria-label="פתיחת המטלות המוצגות ב-Google Maps"
                title="פתיחה ב-Google Maps"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ExternalLink size={18} aria-hidden="true" />
              </button>
            )}
            <div className="flex items-center gap-1 bg-card rounded-2xl p-1 border border-border shadow-sm" role="group" aria-label="תצוגה">
            <button
              onClick={() => setViewMode("list")}
              aria-pressed={viewMode === "list"}
              aria-label="תצוגת רשימה"
              title="רשימה"
              className={`flex items-center justify-center h-11 w-11 rounded-xl transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                viewMode === "list"
                  ? "gradient-honey text-primary-foreground shadow-honey"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List size={18} />
            </button>
            <button
              onClick={() => setViewMode("map")}
              aria-pressed={viewMode === "map"}
              aria-label="תצוגת מפה"
              title="מפה"
              className={`flex items-center justify-center h-11 w-11 rounded-xl transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                viewMode === "map"
                  ? "gradient-honey text-primary-foreground shadow-honey"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Map size={18} />
            </button>
            </div>
          </div>
        </div>

        {/* Filters: one scrolling row of categories, distance folded away behind its current value. */}
        <div className="glass rounded-3xl border border-border mb-6 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          {/* A single row that scrolls sideways instead of wrapping into three fixed rows. */}
          <div
            className="flex gap-2 overflow-x-auto px-4 pt-4 pb-4"
            role="group"
            aria-label="קטגוריה"
          >
            {categoryFilters.map((c) => {
              const Icon = c.icon;
              const isSelected = selectedCategory === c.value;
              return (
                <button
                  key={c.value}
                  onClick={() => setSelectedCategory(c.value)}
                  aria-pressed={isSelected}
                  className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap min-h-11 px-4 py-2 rounded-2xl text-sm font-bold transition-all duration-300 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
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

          {/* Only offer a distance filter when we can actually measure distance. */}
          {userPos && (
            <div className="border-t border-border">
              <button
                type="button"
                onClick={() => setDistanceOpen((open) => !open)}
                aria-expanded={distanceOpen}
                aria-controls="distance-filter-panel"
                className="w-full flex items-center justify-between gap-2 min-h-11 px-4 py-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-b-3xl"
              >
                <span className="flex items-center gap-1.5">
                  <MapPin size={14} className="shrink-0" aria-hidden="true" />
                  {maxDistance >= NO_DISTANCE_LIMIT ? (
                    <>מרחק: <span className="text-foreground">ללא הגבלה</span></>
                  ) : (
                    <>מרחק: עד <span className="tabular text-foreground">{maxDistance}</span> ק״מ</>
                  )}
                </span>
                <ChevronDown size={16} className={`shrink-0 transition-transform duration-200 ${distanceOpen ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
              {distanceOpen && (
                <div id="distance-filter-panel" className="px-4 pb-4">
                  <label htmlFor="distance-filter" className="sr-only">
                    מרחק מרבי בקילומטרים
                  </label>
                  <input
                    id="distance-filter"
                    type="range"
                    min={1}
                    // One step past the top is "ללא הגבלה", so a user far from every
                    // task can always get back to a full list.
                    max={NO_DISTANCE_LIMIT}
                    aria-valuetext={maxDistance >= NO_DISTANCE_LIMIT ? "ללא הגבלה" : `${maxDistance} ק״מ`}
                    value={maxDistance}
                    onChange={(e) => setMaxDistance(Number(e.target.value))}
                    className="w-full h-11 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/*
          WCAG 4.1.3: changing a category or the distance silently swaps the
          cards below. Sighted users see the list redraw; everyone else needs to
          be told. Polite, so it waits for the filter button to finish speaking.
        */}
        <p aria-live="polite" className="sr-only">
          {loading
            ? "טוען מטלות"
            : filteredTasks.length === 0
              ? "לא נמצאו מטלות"
              : filteredTasks.length === 1
                ? "נמצאה מטלה אחת"
                : `נמצאו ${filteredTasks.length} מטלות`}
        </p>

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
              {/* Never say "nothing was published" when a filter is what is hiding
                  things — name the filter that did it and offer the way out. */}
              {hiddenByDistance > 0
                ? `${hiddenByDistance === 1 ? "מטלה אחת נמצאת" : `${hiddenByDistance} מטלות נמצאות`} רחוק יותר מ-${maxDistance} ק״מ ממך.`
                : selectedCategory !== "all"
                  ? "אפשר לנסות קטגוריה אחרת או להרחיב את טווח החיפוש."
                  : "עוד לא פורסמו מטלות באזור. כדאי לבדוק שוב מאוחר יותר."}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {hiddenByDistance > 0 && (
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => { setMaxDistance(NO_DISTANCE_LIMIT); setDistanceOpen(true); }}
                >
                  להציג בכל המרחקים
                </Button>
              )}
              {selectedCategory !== "all" && (
                <Button variant="outline" className="rounded-full" onClick={() => setSelectedCategory("all")}>
                  לניקוי הסינון
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {isTasker && (
        <Link
          to="/create-task"
          aria-label="הוספת מטלה חדשה"
          className="fixed bottom-[calc(2.5rem+env(safe-area-inset-bottom))] left-5 z-30 flex h-[60px] w-[60px] items-center justify-center rounded-[20px] gradient-honey text-primary-foreground shadow-[0_12px_32px_rgba(245,158,11,0.38),inset_0_1px_0_rgba(255,255,255,0.35)] transition-transform duration-200 hover:scale-105 hover:rotate-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/40 md:hidden"
        >
          <Plus size={28} strokeWidth={2.5} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
};

export default TaskList;
