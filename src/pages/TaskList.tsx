import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePermissionPrompt } from "@/components/PermissionPromptContext";
import { MapTrifold as MapIcon, ListBullets as List, MapPin, CaretDown as ChevronDown, MagnifyingGlassMinus as SearchX, Plus, MagnifyingGlass as Search, Heart, X, SlidersHorizontal, Check } from "@phosphor-icons/react";
import { figmaCategoryIcon } from "@/components/tasks/figmaCategoryIcons";
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
import { CONSENT_CHANGED, getStoredConsent } from "@/lib/performanceConsent";

const MAX_DISTANCE_KEY = "bzb_max_distance";
const LOCATION_SNOOZE_KEY = "bzb_location_prompt_snooze";
const LOCATION_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_DISTANCE_KM = 10;
/** Top of the distance slider. One step past it means "do not filter by distance". */
const MAX_DISTANCE_KM = 50;
const NO_DISTANCE_LIMIT = MAX_DISTANCE_KM + 1;
/** One-tap distances; the slider stays for anything in between. */
const QUICK_DISTANCES = [1, 3, 5, 10, NO_DISTANCE_LIMIT];

type SortKey = "new" | "near" | "price" | "soon";
/** Category chips in the order drawn in the redesign. */
const FIGMA_CATEGORY_ORDER = ["all", "housework", "handyman", "babysitting", "pets", "gardening", "tutoring", "other"];
const figmaOrdered = <T extends { value: string }>(items: T[]): T[] =>
  [...items].sort((a, b) => FIGMA_CATEGORY_ORDER.indexOf(a.value) - FIGMA_CATEGORY_ORDER.indexOf(b.value));

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "new", label: "הכי חדשות" },
  { value: "near", label: "הכי קרובות אליי" },
  { value: "price", label: "התשלום הכי גבוה" },
  { value: "soon", label: "המועד הכי קרוב" },
];

const TaskList = () => {
  const { user } = useAuth();
  const { isTasker, isBee } = useRoles();
  const { pushPending } = usePermissionPrompt();
  /* One ask at a time: the location explainer waits until the cookie banner is answered. */
  const [cookiesAnswered, setCookiesAnswered] = useState(() => getStoredConsent() !== null);
  useEffect(() => {
    if (cookiesAnswered) return;
    const onConsent = () => setCookiesAnswered(true);
    window.addEventListener(CONSENT_CHANGED, onConsent);
    return () => window.removeEventListener(CONSENT_CHANGED, onConsent);
  }, [cookiesAnswered]);
  /* Soft-ask snooze: "לא עכשיו" hides the explainer for a few days so it never nags on every visit. */
  const [locationDismissed, setLocationDismissedState] = useState(() => {
    try { return Date.now() < Number(localStorage.getItem(LOCATION_SNOOZE_KEY) || 0); } catch { return false; }
  });
  const setLocationDismissed = (snooze: boolean) => {
    setLocationDismissedState(true);
    if (snooze) try { localStorage.setItem(LOCATION_SNOOZE_KEY, String(Date.now() + LOCATION_SNOOZE_MS)); } catch { /* storage blocked */ }
  };
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("new");
  /** Sort sheet: the choice applies only on "אישור", so it is held here until then. */
  const [sortOpen, setSortOpen] = useState(false);
  const [pendingSort, setPendingSort] = useState<SortKey>("new");
  useEffect(() => {
    if (!sortOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSortOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sortOpen]);
  /* The saved filter is the drawer's "מועדפים" entry, as drawn; it lives in the URL. */
  const [searchParams] = useSearchParams();
  const onlySaved = searchParams.get("saved") === "1";
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
    // No Permissions API (older Safari): we can't tell if the OS will prompt, so show the explainer first.
    if (!navigator.permissions?.query) { setLocationState("prompt"); return; }
    const checkPermission = () => {
      void navigator.permissions.query({ name: "geolocation" }).then((permission) => {
        if (cancelled) return;
        if (permission.state === "granted") locate();
        // "prompt": never fire the native dialog cold; the explainer modal asks first.
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
    <div className="figma min-h-screen bg-background relative" dir="rtl">

      <PageHeader
        variant="figma"
        showBack={false}
        action={
          isTasker && (
            <Link to="/create-task">
              <button className="inline-flex items-center gap-1.5 h-10 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-sm rounded-full transition-colors">
                <Plus size={16} />
                <span>פרסום מטלה</span>
              </button>
            </Link>
          )
        }
      />

      <div className="max-w-5xl mx-auto py-5 px-4 pb-28 md:pb-5 relative z-10">
        <Dialog open={!pushPending && cookiesAnswered && !locationDismissed && (locationState === "denied" || locationState === "prompt")} onOpenChange={(open) => { if (!open) setLocationDismissed(true); }}>
          {/* Portal renders outside the page, so the dialog opts into the Figma tokens itself. */}
          <DialogContent dir="rtl" className="figma w-[calc(100%-2rem)] gap-0 rounded-[20px] border-0 bg-card p-6 shadow-card sm:max-w-sm">
            <DialogHeader className="items-center text-center">
              <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary" aria-hidden="true"><MapPin size={28} weight="fill" /></span>
              <DialogTitle className="text-xl font-bold">{locationState === "denied" ? "המיקום חסום" : "מטלות קרובות אליכם"}</DialogTitle>
              <DialogDescription className="pt-1 text-sm leading-relaxed text-muted-foreground">
                {locationState === "denied" ? "כדי לראות מרחק למטלות, אפשרו גישה למיקום בהגדרות הדפדפן או המכשיר." : "נשתמש במיקום כדי להציג כמה רחוקה כל מטלה. אפשר לשנות את זה בכל רגע."}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2 pt-6">
              {locationState !== "denied" && <Button className="h-12 w-full rounded-full text-base font-medium" onClick={() => { setLocationDismissed(false); locate(); }}>אישור מיקום</Button>}
              <Button className="h-12 w-full rounded-full bg-secondary text-base font-medium text-foreground hover:bg-secondary/80" variant="ghost" onClick={() => setLocationDismissed(true)}>{locationState === "denied" ? "הבנתי" : "לא עכשיו"}</Button>
            </div>
          </DialogContent>
        </Dialog>
        {/* Icon-only toggle: two states with familiar icons need no labels, and the
            narrow control keeps the title on one line down to 320px. */}
        <div className="-mx-4 -mt-5 mb-4 flex items-center justify-between gap-3 bg-card px-4 py-4 animate-fade-in">
          <h1 className="text-[22px] font-semibold leading-7 text-foreground">מוצאים משימה</h1>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center rounded-[22px] border border-[#E3E3E3] bg-muted p-1 shadow-[0_1px_2px_rgba(31,33,43,0.06)]" role="group" aria-label="תצוגה">
            <button
              onClick={() => setViewMode("list")}
              aria-pressed={viewMode === "list"}
              aria-label="תצוגת רשימה"
              title="רשימה"
              className={`flex h-10 items-center justify-center gap-2 rounded-[20px] px-3.5 text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                viewMode === "list"
                  ? "bg-card font-medium text-[#242129]"
                  : "font-normal text-[#85838C] hover:text-foreground"
              }`}
            >
              <List size={18} aria-hidden="true" />
              רשימה
            </button>
            <button
              onClick={() => setViewMode("map")}
              aria-pressed={viewMode === "map"}
              aria-label="תצוגת מפה"
              title="מפה"
              className={`flex h-10 items-center justify-center gap-2 rounded-[20px] px-3.5 text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                viewMode === "map"
                  ? "bg-card font-medium text-[#242129]"
                  : "font-normal text-[#85838C] hover:text-foreground"
              }`}
            >
              <MapIcon size={18} aria-hidden="true" />
              מפה
            </button>
            </div>
          </div>
        </div>

        <div className="mb-4 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <div
            className="flex gap-2 overflow-x-auto pb-1 [mask-image:linear-gradient(to_left,#000_calc(100%-1.5rem),transparent)]"
            role="group"
            aria-label="קטגוריה"
          >
            {figmaOrdered(categoryFilters).map((c) => {
              const Icon = figmaCategoryIcon(c.value);
              const isSelected = selectedCategory === c.value;
              return (
                <button
                  key={c.value}
                  onClick={() => setSelectedCategory(c.value)}
                  aria-pressed={isSelected}
                  className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap min-h-11 px-4 py-2 rounded-full text-sm font-medium transition-colors border-[1.2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    isSelected
                      ? "bg-primary-soft text-foreground border-primary"
                      : "bg-card text-foreground border-border hover:border-primary"
                  }`}
                >
                  <Icon size={16} />
                  {c.label}
                </button>
              );
            })}
          </div>

          {originPos && (
            <div className="mt-3 rounded-lg border border-border bg-card">
              <button
                type="button"
                onClick={() => setDistanceOpen((open) => !open)}
                aria-expanded={distanceOpen}
                aria-controls="distance-filter-panel"
                className="w-full flex items-center justify-between gap-2 min-h-11 px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
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
                        className={cn("min-h-11 rounded-lg border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          maxDistance === km ? "border-primary bg-primary-soft text-foreground" : "border-border bg-card text-foreground")}
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

        {/* Search and sort sit above the filters: finding a job by name or ordering by pay is the first thing people try. */}
        {viewMode === "list" && (
        <div className="flex items-center gap-2 mb-4 animate-fade-in">
          <div className="relative flex-1">
            <Search size={18} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש מטלה"
              aria-label="חיפוש מטלות"
              className="w-full h-[52px] rounded-lg border-[1.2px] border-border bg-card ps-10 pe-9 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="ניקוי החיפוש" className="absolute end-1 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
          <button
            type="button"
            aria-label="מיון"
            aria-haspopup="dialog"
            aria-expanded={sortOpen}
            onClick={() => { setPendingSort(sortKey); setSortOpen(true); }}
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg border-[1.2px] border-border bg-card text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <SlidersHorizontal size={18} aria-hidden="true" />
          </button>
        </div>
        )}

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
            <MapView tasks={filteredTasks} saved={saved} onToggleSave={toggleSaved} />
          )
        )}

        {loading && (
          <div className="grid md:grid-cols-2 gap-4" aria-live="polite" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-card rounded-lg p-6 border border-border h-44 animate-pulse" />
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

      {sortOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div aria-hidden="true" className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setSortOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sort-sheet-title"
            className="relative m-4 w-full max-w-md rounded-lg bg-card p-4 shadow-card animate-slide-up"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="sort-sheet-title" className="text-lg font-semibold text-foreground">מיון תוצאות</h2>
              <button type="button" aria-label="סגירה" onClick={() => setSortOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div role="radiogroup" aria-labelledby="sort-sheet-title" className="space-y-2.5">
              {SORT_OPTIONS.map((o) => {
                const disabled = o.value === "near" && !originPos;
                const checked = pendingSort === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    disabled={disabled}
                    onClick={() => setPendingSort(o.value)}
                    className="flex h-[58px] w-full items-center justify-between rounded-lg bg-secondary px-3.5 text-sm text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {o.label}
                    <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] bg-card", checked ? "border-primary" : "border-foreground")}>
                      {checked && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                    </span>
                  </button>
                );
              })}
            </div>
            <Button className="mt-5 h-14 w-full gap-2 rounded-full bg-primary text-sm font-medium text-primary-foreground" onClick={() => { setSortKey(pendingSort); setSortOpen(false); }}>
              אישור
              <Check size={18} aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskList;
