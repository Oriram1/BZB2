import { Fragment, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu } from "lucide-react";
import {
  X, User as UserCircle, Heart, CaretLeft, CheckCircle, Question, SignOut as LogOut, Bell, ArrowRight, Checks as CheckCheck,
  House, SignIn, ListMagnifyingGlass, PlusCircle, FileText, ChatCircle,
  Gear, CreditCard, ShieldCheck, type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { visibleNavItems } from "@/components/navItems";
import { useNavDrawer } from "@/components/NavDrawerContext";
import NotificationBell from "@/components/NotificationBell";
import { useRoles } from "@/hooks/useRoles";
import { useNotifications } from "@/hooks/useNotifications";
import { notificationLine } from "@/lib/notificationCopy";
import { formatRelativeTime } from "@/lib/format";
import { formFor } from "@shared/gender.ts";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * A closed drawer must be unreachable by keyboard and screen reader, not just
 * translated off-screen. React 18's typings predate `inert`, so it is spread in
 * rather than written as a prop; the DOM honours it either way.
 */
/**
 * The drawer stays mounted so it can slide, so it has to be closed to assistive
 * tech while off-screen. `inert` alone does that: it drops the subtree from the
 * accessibility tree *and* refuses focus inside it. Pairing it with
 * `aria-hidden` used to add a race — a link in here could still hold focus on
 * the frame `aria-hidden` landed, which the browser reports as hiding a focused
 * element from screen readers.
 */
const SAVED_TASKS_PATH = `${ROUTES.tasks}?saved=1`;
const DONE_TASKS_PATH = `${ROUTES.myTasks}?tab=performing`;

/** The drawer follows the Figma redesign, which uses the Phosphor icon set. */
const DRAWER_ICONS: Record<string, PhosphorIcon> = {
  [ROUTES.home]: House,
  [ROUTES.auth]: SignIn,
  [ROUTES.tasks]: ListMagnifyingGlass,
  [ROUTES.createTask]: PlusCircle,
  [ROUTES.myTasks]: FileText,
  [ROUTES.chat]: ChatCircle,
  [ROUTES.settings]: Gear,
  [ROUTES.pricing]: CreditCard,
  [ROUTES.admin]: ShieldCheck,
  [SAVED_TASKS_PATH]: Heart,
  [DONE_TASKS_PATH]: CheckCircle,
  [ROUTES.help]: Question,
};

const inertWhenClosed = (open: boolean) => (open ? {} : { inert: "" }) as { inert?: string };

/**
 * Desktop-only navigation drawer. On mobile the bottom bar is the navigation,
 * so nothing here renders below the md breakpoint.
 *
 * The trigger normally lives inside PageHeader; this floating one is the
 * fallback for the screens that have no header (landing, auth, create-task).
 */
export function NavDrawerTrigger({ floating = false, className }: { floating?: boolean; className?: string }) {
  const { open, setOpen } = useNavDrawer();

  return (
    <button
      onClick={() => setOpen(true)}
      className={cn(
        "flex items-center justify-center h-11 w-11 rounded-xl transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        floating
          ? "fixed top-4 start-4 z-40 bg-primary text-primary-foreground shadow-lg hover:brightness-105"
          : "text-primary-foreground hover:bg-foreground/10",
        className,
      )}
      aria-label="פתיחת תפריט"
      aria-expanded={open}
    >
      <Menu className="w-6 h-6" aria-hidden="true" />
    </button>
  );
}

/** Renders the floating trigger only on screens that have no PageHeader. */
export function FloatingNavTrigger() {
  const { hasHeader } = useNavDrawer();
  if (hasHeader) return null;
  return <NavDrawerTrigger floating />;
}

export function MobileNav() {
  const { open, setOpen } = useNavDrawer();
  const [showNotifications, setShowNotifications] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, roles, signOut } = useAuth();
  const { items, loading, markRead, markAllRead } = useNotifications();
  const { isBee } = useRoles();

  const handleLogout = async () => {
    await signOut();
    setOpen(false);
    toast.success("התנתקת בהצלחה 👋");
    navigate("/");
  };

  const displayName = profile
    ? `${profile.first_name} ${profile.last_name}`.trim() || user?.email || "משתמש"
    : user?.email || "משתמש";


  const filteredItems = visibleNavItems(Boolean(user), roles);
  /* Entries drawn in the redesign that are views of existing screens rather than
     routes of their own: saved tasks under the list, completed work under
     "המטלות שלי", and help at the end. Only people who perform tasks get the
     first two. */
  const drawerItems = filteredItems.flatMap((item) => {
    if (item.to === ROUTES.tasks && user && isBee) return [item, { ...item, label: "מועדפים", to: SAVED_TASKS_PATH }];
    if (item.to === ROUTES.myTasks && isBee) return [item, { ...item, label: "מטלות שביצעתי", to: DONE_TASKS_PATH }];
    return [item];
  }).concat([{ label: "עזרה ותמיכה", to: ROUTES.help, icon: Question as unknown as (typeof filteredItems)[number]["icon"] }]);
  /** The design separates settings and help from the task entries with a rule. */
  const dividerBefore = drawerItems.some((item) => item.to === ROUTES.settings) ? ROUTES.settings : ROUTES.help;

  const activeConversationId = location.pathname === "/chat"
    ? new URLSearchParams(location.search).get("conversation")
    : null;
  const visibleNotifications = items.filter((item) => {
    if (item.event_type !== "message_received" || !activeConversationId) return true;
    return item.data.conversation_id !== activeConversationId;
  });
  const unreadCount = visibleNotifications.filter((n) => !n.read_at).length;

  const handleCloseDrawer = () => {
    setOpen(false);
    setShowNotifications(false);
  };

  const openNotification = (id: string, link: string | null, unread: boolean) => {
    if (unread) markRead(id);
    if (link) {
      navigate(link);
      handleCloseDrawer();
    }
  };

  return (
    <>
      {open && (
        /* Decorative scrim. Clicking it is a mouse shortcut; the keyboard
           path is Escape, handled by the drawer itself. aria-hidden keeps it
           out of the accessibility tree so it is not announced as a control. */
        <div
          aria-hidden="true"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity"
          onClick={handleCloseDrawer}
        />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-label="תפריט ניווט"
        {...inertWhenClosed(open)}
        className={cn(
          "figma fixed top-0 start-0 z-50 h-full w-72 bg-card border-e border-border shadow-2xl transition-transform duration-300 ease-in-out flex flex-col",
          open ? "translate-x-0" : "rtl:translate-x-full ltr:-translate-x-full"
        )}
      >
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            {showNotifications ? (
              <>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="flex items-center justify-center h-11 w-11 rounded-lg hover:bg-muted transition-colors"
                  aria-label="חזרה לתפריט"
                >
                  <ArrowRight className="w-5 h-5" aria-hidden="true" />
                </button>
                <span className="text-lg font-bold text-primary-ink">התראות</span>
              </>
            ) : (
              <span className="text-2xl font-bold leading-none tracking-tight text-foreground" aria-label="BZB">B<span className="text-[#F2B63C]">Z</span>B</span>
            )}
            <div className="flex-1" />
            {!showNotifications && user && (
              <button
                onClick={() => setShowNotifications(true)}
                className="relative flex items-center justify-center h-11 w-11 rounded-lg hover:bg-muted transition-colors"
                aria-label={unreadCount > 0 ? `התראות, ${unreadCount} חדשות` : "התראות"}
              >
                <Bell size={19} aria-hidden="true" />
                {unreadCount > 0 && (
                  <span className="pointer-events-none absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold flex items-center justify-center leading-none">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
            )}
            {showNotifications && unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center justify-center h-11 w-11 rounded-lg hover:bg-muted transition-colors"
                aria-label="סמן הכל כנקרא"
              >
                <CheckCheck size={18} aria-hidden="true" />
              </button>
            )}
            <button
              onClick={handleCloseDrawer}
              className="sr-only focus-visible:not-sr-only focus-visible:flex items-center justify-center h-11 w-11 rounded-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="סגירה"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {user ? (
            <Link to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-3 p-3 rounded-lg bg-muted active:bg-secondary transition-colors">
              <div className="w-11 h-11 rounded-full bg-primary-soft flex items-center justify-center overflow-hidden">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <UserCircle className="w-5 h-5 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{displayName}</p>
                <p className="text-xs text-muted-foreground">הפרופיל שלי</p>
              </div>
              <CaretLeft size={16} className="shrink-0 text-foreground" aria-hidden="true" />
            </Link>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
              <div className="w-11 h-11 rounded-full bg-primary-soft flex items-center justify-center overflow-hidden">
                <UserCircle className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">אורח</p>
                <Link to="/auth" onClick={() => setOpen(false)} className="text-xs text-primary-ink hover:underline">
                  התחבר או הירשם →
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-hidden relative">
          <div
            className="flex h-full transition-transform duration-300 ease-in-out"
            style={{ transform: showNotifications ? "translateX(100%)" : "translateX(0)" }}
          >
            <div className="w-full shrink-0 overflow-y-auto py-2">
              {drawerItems.map((item) => {
                const [itemPath, itemQuery = ""] = item.to.split("?");
                const isActive = location.pathname === itemPath && location.search.replace(/^\?/, "") === itemQuery;
                const ItemIcon = DRAWER_ICONS[item.to] ?? item.icon;
                return (
                  <Fragment key={item.to}>
                  {item.to === dividerBefore && <hr className="mx-4 my-2 border-border" />}
                  <Link
                    to={item.to}
                    onClick={handleCloseDrawer}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 px-5 py-3.5 min-h-11 text-sm transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      isActive
                        ? "bg-primary-soft text-primary-ink font-semibold border-s-[3px] border-primary"
                        : "text-foreground hover:bg-muted"
                    )}
                  >
                    <ItemIcon className="w-5 h-5 shrink-0" aria-hidden="true" />
                    <span className={cn(isActive ? "font-medium" : "font-normal")}>{item.label}</span>
                  </Link>
                  </Fragment>
                );
              })}
            </div>

            <div className="w-full shrink-0 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" } as React.CSSProperties}>
              {loading ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">טוען…</p>
            ) : visibleNotifications.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-3xl mb-2">🐝</p>
                <p className="text-sm text-muted-foreground">אין התראות חדשות</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {visibleNotifications.map((item) => {
                  const line = notificationLine(item, formFor(profile?.gender));
                  const unread = !item.read_at;
                  const taskId = typeof item.data.task_id === "string" ? item.data.task_id : null;
                  const applicationId = typeof item.data.application_id === "string" ? item.data.application_id : null;
                  const targetLink = item.event_type === "application_received" && taskId && applicationId
                    ? `/my-tasks?tab=applications&task=${encodeURIComponent(taskId)}&application=${encodeURIComponent(applicationId)}`
                    : item.link;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => openNotification(item.id, targetLink, unread)}
                        className={cn(
                          "w-full px-4 py-3 text-right hover:bg-accent/40 transition-colors",
                          unread && "bg-accent/20",
                        )}
                      >
                        <span className="flex items-center gap-2" dir="rtl">
                          {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
                          <span className="min-w-0 flex-1 truncate">
                            <span className={cn("text-sm text-foreground", unread ? "font-extrabold" : "font-bold")}>
                              {line.title}
                            </span>
                          </span>
                          <span aria-hidden="true" className="shrink-0 text-lg leading-none">{line.emoji}</span>
                        </span>
                        <span className="mt-1 block min-w-0 pr-4" dir="rtl">
                          <span className="block truncate text-sm text-muted-foreground">{line.body}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground/80">
                            {formatRelativeTime(item.created_at)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            </div>
          </div>
        </div>

        {!showNotifications && (
          <div className="border-t border-border">
            {user && (
              <button
                onClick={handleLogout}
                className="flex items-center justify-center gap-2 w-full px-5 py-3.5 min-h-12 text-sm font-normal text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-destructive"
              >
                <LogOut className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span>התנתקות</span>
              </button>
            )}
            <div className="p-4 text-center text-xs text-muted-foreground">
              Busy Bee © 2026
            </div>
          </div>
        )}
      </div>
    </>
  );
}
