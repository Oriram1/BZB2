import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { MoreHorizontal, LogOut, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { navItems } from "@/components/navItems";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/** Order the items appear in the bottom bar (most important first). */
const tabOrder = ["/", "/tasks", "/create-task", "/my-tasks", "/parent", "/chat", "/profile", "/settings", "/pricing", "/auth"];

const MAX_SLOTS = 5;

export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, roles, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    setMoreOpen(false);
    toast.success("התנתקת בהצלחה 👋");
    navigate("/");
  };

  const displayName = profile
    ? `${profile.first_name} ${profile.last_name}`.trim() || user?.email || "משתמש"
    : user?.email || "משתמש";

  const items = navItems
    .filter((item) => {
      if (item.guestOnly && user) return false;
      if (item.authOnly && !user) return false;
      if (item.requiredRoles && item.requiredRoles.length > 0) {
        if (!item.requiredRoles.some((r) => roles.includes(r))) return false;
      }
      return true;
    })
    .sort((a, b) => tabOrder.indexOf(a.to) - tabOrder.indexOf(b.to));

  const needsMore = items.length > MAX_SLOTS;
  const tabs = needsMore ? items.slice(0, MAX_SLOTS - 1) : items;
  const overflow = needsMore ? items.slice(MAX_SLOTS - 1) : [];
  const moreActive = overflow.some((item) => item.to === location.pathname);

  return (
    <>
      <nav
        dir="rtl"
        className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-background/95 backdrop-blur-lg border-t border-border pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="flex items-stretch">
          {tabs.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <li key={item.to} className="flex-1">
                <Link
                  to={item.to}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-1 h-16 transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    isActive ? "text-primary-ink" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {isActive && (
                    <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" aria-hidden="true" />
                  )}
                  <item.icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                  <span className="text-[11px] leading-none font-medium text-center px-0.5">
                    {item.shortLabel ?? item.label}
                  </span>
                </Link>
              </li>
            );
          })}

          {needsMore && (
            <li className="flex-1">
              <button
                onClick={() => setMoreOpen(true)}
                aria-label="עוד אפשרויות"
                aria-expanded={moreOpen}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-1 h-16 w-full transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  moreActive ? "text-primary-ink" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {moreActive && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" aria-hidden="true" />}
                <MoreHorizontal className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span className="text-[11px] leading-none font-medium">עוד</span>
              </button>
            </li>
          )}
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" dir="rtl" className="rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <SheetHeader className="text-right">
            <SheetTitle className="text-right">עוד</SheetTitle>
          </SheetHeader>

          {user && (
            <div className="flex items-center gap-3 p-3 my-3 rounded-xl bg-muted/50">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <UserCircle className="w-6 h-6 text-primary-ink" />
                )}
              </div>
              <p className="text-sm font-semibold truncate">{displayName}</p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 mt-2">
            {overflow.map((item) => {
              const isActive = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 p-3 min-h-16 rounded-xl text-xs font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    isActive ? "bg-primary/10 text-primary-ink" : "bg-muted/50 text-foreground hover:bg-muted"
                  )}
                >
                  <item.icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                  <span className={cn("text-center", item.bold && "font-bold")}>{item.label}</span>
                </Link>
              );
            })}

            {user && (
              <button
                onClick={handleLogout}
                className="flex flex-col items-center justify-center gap-2 p-3 min-h-16 rounded-xl text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2"
              >
                <LogOut className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span>התנתק</span>
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
