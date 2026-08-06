import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, UserCircle, LogOut, Bell, ArrowRight, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { visibleNavItems } from "@/components/navItems";
import { useNavDrawer } from "@/components/NavDrawerContext";
import NotificationBell from "@/components/NotificationBell";
import BzbLogo from "@/components/BzbLogo";
import { useNotifications } from "@/hooks/useNotifications";
import { notificationLine } from "@/lib/notificationCopy";
import { formatRelativeTime } from "@/lib/format";
import { formFor } from "@/lib/gender";
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
const inertWhenClosed = (open: boolean) => (open ? {} : { inert: "" }) as { inert?: string };

/**
 * Desktop-only navigation drawer. On mobile the bottom bar is the navigation,
 * so nothing here renders below the md breakpoint.
 *
 * The trigger normally lives inside PageHeader; this floating one is the
 * fallback for the screens that have no header (landing, auth, create-task).
 */
export function NavDrawerTrigger({ floating = false }: { floating?: boolean }) {
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

  const handleLogout = async () => {
    await signOut();
    setOpen(false);
    toast.success("התנתקת בהצלחה 👋");
    navigate("/");
  };

  const displayName = profile
    ? `${profile.first_name} ${profile.last_name}`.trim() || user?.email || "משתמש"
    : user?.email || "משתמש";

  const roleLabel = roles.includes("tasker")
    ? "מציע מטלות"
    : roles.includes("bee")
    ? "מבצע מטלות 🐝"
    : roles.includes("parent")
    ? "הורה"
    : "";

  const filteredItems = visibleNavItems(Boolean(user), roles);

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
        <div
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
          // Logical inset: start-0 is the right edge in Hebrew, the left edge if
          // the app is ever switched to LTR. border-e faces the page content.
          "fixed top-0 start-0 z-50 h-full w-72 bg-background border-e border-border shadow-2xl transition-transform duration-300 ease-in-out flex flex-col",
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
              <><BzbLogo className="w-9 h-9" /><span className="text-lg font-bold text-primary-ink">BZB</span></>
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
              className="flex items-center justify-center h-11 w-11 rounded-lg hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="סגירה"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {user ? (
            <Link to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 active:bg-muted transition-colors">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <UserCircle className="w-6 h-6 text-primary-ink" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{displayName}</p>
                {roleLabel && <p className="text-xs text-muted-foreground">{roleLabel}</p>}
              </div>
            </Link>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
                <UserCircle className="w-6 h-6 text-primary-ink" />
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
          {/* Two panels side by side, sliding via transform */}
          <div
            className="flex h-full transition-transform duration-300 ease-in-out"
            style={{ transform: showNotifications ? "translateX(100%)" : "translateX(0)" }}
          >
            {/* Menu panel */}
            <div className="w-full shrink-0 overflow-y-auto py-2">
              {filteredItems.map((item) => {
                const isActive = location.pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={handleCloseDrawer}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 px-5 py-3.5 min-h-11 text-sm font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      isActive
                        ? "bg-primary/10 text-primary-ink border-s-4 border-primary"
                        : "text-foreground hover:bg-muted"
                    )}
                  >
                    <item.icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                    <span className={cn("font-medium", item.bold && "font-bold")}>{item.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Notifications panel */}
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
                className="flex items-center gap-3 w-full px-5 py-3.5 min-h-11 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-destructive"
              >
                <LogOut className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span>התנתק</span>
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
