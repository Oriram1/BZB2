import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, UserCircle, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { navItems } from "@/components/navItems";
import { useNavDrawer } from "@/components/NavDrawerContext";

/**
 * A closed drawer must be unreachable by keyboard and screen reader, not just
 * translated off-screen. React 18's typings predate `inert`, so it is spread in
 * rather than written as a prop; the DOM honours it either way.
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
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, roles, signOut } = useAuth();

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

  const filteredItems = navItems.filter((item) => {
    if (item.guestOnly && user) return false;
    if (item.authOnly && !user) return false;
    if (item.requiredRoles && item.requiredRoles.length > 0) {
      if (!item.requiredRoles.some((r) => roles.includes(r))) return false;
    }
    return true;
  });

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity"
          onClick={() => setOpen(false)}
        />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-label="תפריט ניווט"
        aria-hidden={!open}
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
            <span className="text-lg font-bold text-primary-ink">🐝 BZB</span>
            <button
              onClick={() => setOpen(false)}
              className="flex items-center justify-center h-11 w-11 rounded-lg hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="סגירה"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <UserCircle className="w-6 h-6 text-primary-ink" />
              )}
            </div>
            {user ? (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{displayName}</p>
                {roleLabel && <p className="text-xs text-muted-foreground">{roleLabel}</p>}
              </div>
            ) : (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">אורח</p>
                <Link to="/auth" onClick={() => setOpen(false)} className="text-xs text-primary-ink hover:underline">
                  התחבר או הירשם →
                </Link>
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {filteredItems.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
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
        </nav>

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
      </div>
    </>
  );
}
