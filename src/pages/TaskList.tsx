import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePermissionPrompt } from "@/components/PermissionPromptContext";
import { Map as MapIcon, List, MapPin, ChevronDown, SearchX, Plus, Search, Heart, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import PendingRatingsCard from "@/components/reviews/PendingRatingsCard";
import { categoryFilters, categoryLabel } from "@/lib/categories";
import { distanceKm } from "@/lib/format";
import { fetchRatings } from "@/lib/people";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useRoles } from "@/hooks/useRoles";
import { toast } from "sonner";
import TaskGrid from "@/components/tasks/TaskGrid";
import MapView from "@/components/tasks/MapView";
import type { Task } from "@/components/tasks/TaskCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSavedTasks } from "@/hooks/useSavedTasks";
import { cn } from "@/lib/utils";

const MAX_DISTANCE_KEY = "bzb_max_distance";
const DEFAULT_MAX_DISTANCE_KM = 10;
/** Top of the distance slider. One step past it means "do not filter by distance". */
const MAX_DISTANCE_KM = 50;
const NO_DISTANCE_LIMIT = MAX_DISTANCE_KM + 1;
/** One-tap distances; the slider stays for anything in between. */
const QUICK_DISTANCES = [1, 3, 5, 10, NO_DISTANCE_LIMIT];

type SortKey = "new" | "near" | "price" | "soon";
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "new", label: "החדשות ביותר" },
  { value: "near", label: "הכי קרוב" },
  { value: "price", label: "התשלום הגבוה ביותר" },
  { value: "soon", label: "המועד הקרוב ביותר" },
];

const TaskList = () => {
  const { user } = useAuth();
  const { isTasker, isBee } = useRoles();
  const { pushPending } = usePermissionPrompt();
  const [locationDismissed, setLocationDismissed] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("new");
  const [onlySaved, setOnlySaved] = useState(false);
  const { saved, toggle: toggleSaved } = useSavedTasks();
  const [maxDistance, setMaxDistance] = usePersistedState(MAX_DISTANCE_KEY, DEFAULT_MAX_DISTANCE_KM, (raw) => {
    const km = Number(raw);
    return raw && !Number.isNaN(km) ? km : null;
  });
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  /** The distance slider starts collapsed: the current value is enough until the user wants to change it. */
  const [distanceOpen, setDistanceOpen] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  /** null until the browser hands us a position; distance stays hidden until then. */
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);

  /** Saved profile position: lets distance and "nearest" work when live location is blocked or unavailable. */
  const [profilePos, setProfilePos] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void supabase.from("profiles").select("latitude, longitude").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (!cancelled && data?.latitude != null && data?.longitude != null) setProfilePos({ lat: data.latitude, lng: data.longitude });
    });
    return () => { cancelled = true; };
  }, [user]);

  const [locationState, setLocationState] = useState<"checking" | "prompt" | "denied" | "unavailable" | "ready">("checking");
  const locate = () => {
    if (!navigator.geolocation) { setLocationState("unavailable"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocationState("ready"); },
      (error) => { setUserPos(null); setLocationState(error.code === 1 ? "denied" : "unavailable"); },
      { timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
  };
  useEffect(() => {
    let cancelled = false;
    if (!navigator.geolocation) { setLocationState("unavailable"); return; }
    let asked = false;
    if (!navigator.permissions?.query) { locate(); return; }
    const checkPermission = () => {
      void navigator.permissions.query({ name: "geolocation" }).then((permission) => {
        if (cancelled) return;
        if (permission.state === "granted") locate();
        else if (permission.state === "prompt" && !asked) { asked = true; locate(); }
        else { setUserPos(null); setLocationState(permission.state); }
      }).catch(() => { if (!cancelled) setLocationState("prompt"); });
    };
    const onVisible = () => { if (document.visibilityState === "visible") checkPermission(); };
    checkPermission();
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  useEffect(() => {
    const fetchTasks = async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, creator_id, name, short_desc, category, payment, payment_type, location, scheduled_date, scheduled_time, duration_hours, workers_needed, accepted_count, status, latitude, longitude, publish_state")
        .eq("status", "open")
        .eq("publish_state", "live")
        .is("archived_at", null)
        .order("created_at", { ascending: false });

      if (error) toast.error("לא הצלחנו לטעון את המטלות");
      else if (data) {
        const ratings = await fetchRatings("tasker", data.map((task) => task.creator_id));
        // accepted_count lives on the task itself: RLS hides other people's
        // applications, so counting them here returned 0 and full tasks stayed up.
        const mapped: Task[] = data
          .filter((t) => (t.accepted_count ?? 0) < t.workers_needed)
          .map((t, i) => ({
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
            lat: t.latitude,
            lng: t.longitude,
            creatorId: t.creator_id,
            creatorRating: ratings ? ratings.get(t.creator_id) ?? null : undefined,
            publishState: t.publish_state,
          }));
        setTasks(mapped);
      }
      setLoading(false);
    };
    fetchTasks();
  }, []);

  /** Distance is only real once we know where the user is AND where the task is. */
  const originPos = userPos ?? profilePos;
  const tasksWithDistance = tasks.map((t) => ({
    ...t,
    distance:
      originPos && t.lat !== null && t.lng !== null
        ? distanceKm(originPos, { lat: t.lat, lng: t.lng })
        : undefined,
  }));

  const inCategory = tasksWithDistance.filter(
    (t) => selectedCategory === "all" || t.category === selectedCategory,
  );
  const needle = query.trim().toLowerCase();
  const matchesQuery = (t: Task) =>
    !needle || [t.name, t.shortDesc, t.location].some((field) => field.toLowerCase().includes(needle));
  const when = (t: Task) => (t.date ? `${t.date}T${t.time || "00:00"}` : "9999");
  const sorters: Record<SortKey, (a: Task, b: Task) => number> = {
    new: () => 0,
    near: (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity),
    price: (a, b) => b.payment - a.payment,
    soon: (a, b) => when(a).localeCompare(when(b)),
  };
  const filteredTasks = inCategory
    .filter((t) => t.distance === undefined || maxDistance >= NO_DISTANCE_LIMIT || t.distance <= maxDistance)
    .filter(matchesQuery)
    .filter((t) => !onlySaved || (t.dbId !== undefined && saved.has(t.dbId)))
    .sort(sorters[sortKey]);
  /** How many tasks the distance slider alone is holding back, for the empty state. */
  const hiddenByDistance = inCategory.filter(matchesQuery).filter((t) => t.distance !== undefined && maxDistance < NO_DISTANCE_LIMIT && t.distance > maxDistance).length;

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
        <Dialog open={!pushPending && !locationDismissed && locationState === "denied"} onOpenChange={(open) => { if (!open) setLocationDismissed(true); }}>
          <DialogContent dir="rtl" className="rounded-2xl sm:max-w-md">
            <DialogHeader>
              <span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary-ink" aria-hidden="true"><MapPin size={24} /></span>
              <DialogTitle className="text-xl font-extrabold">נמצא יחד מטלות קרובות? 🐝</DialogTitle>
              <DialogDescription className="pt-2 leading-relaxed">
                {locationState === "denied" ? "המיקום חסום כרגע. כדי לראות מטלות לפי המרחק, אפשר לאפשר גישה למיקום בהגדרות המכשיר או הדפדפן." : "עם המיקום שלכם נוכל להציג את המרחק למטלות ולעזור למצוא מה קרוב אליכם. בלחיצה תופיע בקשת אישור מהמכשיר."}
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2 pt-2">
              {locationState !== "denied" && <Button className="flex-1 rounded-full" onClick={() => { setLocationDismissed(true); locate(); }}>שימוש במיקום שלי</Button>}
              <Button className="flex-1 rounded-full" variant="outline" onClick={() => setLocationDismissed(true)}>{locationState === "denied" ? "הבנתי" : "לא עכשיו"}</Button>
            </div>
          </DialogContent>
        </Dialog>
        {/* Icon-only toggle: two states with familiar icons need no labels, and the
            narrow control keeps the title on one line down to 320px. */}
        <div className="flex items-center justify-between gap-3 mb-4 animate-fade-in">
          <h1 className="text-2xl font-bold text-foreground">מטלות זמינות</h1>
          <div className="flex items-center gap-2 shrink-0">
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
              <MapIcon size={18} />
            </button>
            </div>
          </div>
        </div>

        {/* Search and sort sit above the filters: finding a job by name or ordering by pay is the first thing people try. */}
        <div className="flex items-center gap-2 mb-3 animate-fade-in">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש מטלה, תיאור או כתובת"
              aria-label="חיפוש מטלות"
              className="w-full h-11 rounded-2xl border border-border bg-card ps-9 pe-9 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="ניקוי החיפוש" className="absolute end-1 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
          <label className="sr-only" htmlFor="task-sort">מיון</label>
          <select
            id="task-sort"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="h-11 shrink-0 rounded-2xl border border-border bg-card px-3 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} disabled={o.value === "near" && !originPos}>{o.label}</option>
            ))}
          </select>
          {user && isBee && (
            <button
              type="button"
              aria-pressed={onlySaved}
              aria-label="מטלות שמורות בלבד"
              title="שמורות"
              onClick={() => setOnlySaved((v) => !v)}
              className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                onlySaved ? "border-transparent gradient-honey text-primary-foreground" : "border-border bg-card text-muted-foreground")}
            >
              <Heart size={18} className={cn(onlySaved && "fill-current")} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="glass rounded-3xl border border-border mb-6 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <div
            className="flex gap-2 overflow-x-auto px-4 pt-4 pb-4 [mask-image:linear-gradient(to_left,#000_calc(100%-1.5rem),transparent)]"
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

          {originPos && (
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
                  <div className="flex flex-wrap gap-2 pb-2" role="group" aria-label="מרחק מהיר">
                    {QUICK_DISTANCES.map((km) => (
                      <button
                        key={km}
                        type="button"
                        aria-pressed={maxDistance === km}
                        onClick={() => setMaxDistance(km)}
                        className={cn("min-h-11 rounded-2xl border px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          maxDistance === km ? "border-transparent gradient-honey text-primary-foreground" : "border-border bg-card text-foreground")}
                      >
                        {km >= NO_DISTANCE_LIMIT ? "הכול" : `${km} ק״מ`}
                      </button>
                    ))}
                  </div>
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

        {!loading && filteredTasks.length > 0 && (
          viewMode === "list" ? (
            <TaskGrid tasks={filteredTasks} saved={saved} onToggleSave={toggleSaved} />
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

        {!loading && filteredTasks.length > 0 && <div className="mt-6"><PendingRatingsCard /></div>}

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
