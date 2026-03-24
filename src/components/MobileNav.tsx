import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, Home, LogIn, ListTodo, PlusCircle, ClipboardList, CreditCard, Shield, MessageCircle, UserCircle, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
  { label: "דף הבית", to: "/", icon: Home },
  { label: "כניסה / הרשמה", to: "/auth", icon: LogIn, guestOnly: true },
  { label: "מטלות זמינות", to: "/tasks", icon: ListTodo },
  { label: "צור מטלה", to: "/create-task", icon: PlusCircle, authOnly: true },
  { label: "המטלות שלי", to: "/my-tasks", icon: ClipboardList, authOnly: true },
  { label: "צ'אט", to: "/chat", icon: MessageCircle, authOnly: true },
  { label: "לוח הורים", to: "/parent", icon: Shield, authOnly: true },
  { label: "מנויים", to: "/pricing", icon: CreditCard },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
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
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed top-4 right-4 z-[60] p-2 rounded-xl bg-primary/90 text-primary-foreground shadow-lg backdrop-blur-sm hover:bg-primary transition-colors"
        aria-label="פתח תפריט"
      >
        <Menu className="w-6 h-6" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm transition-opacity"
          onClick={() => setOpen(false)}
        />
      )}

      <div
        className={cn(
          "fixed top-0 right-0 z-[80] h-full w-72 bg-background border-l border-border shadow-2xl transition-transform duration-300 ease-in-out flex flex-col",
          open ? "translate-x-0" : "translate-x-full"
        )}
        dir="rtl"
      >
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-lg font-bold text-primary">🐝 BZB</span>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              aria-label="סגור תפריט"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <UserCircle className="w-6 h-6 text-primary" />
            </div>
            {user ? (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{displayName}</p>
                {roleLabel && <p className="text-xs text-muted-foreground">{roleLabel}</p>}
              </div>
            ) : (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">אורח</p>
                <Link to="/auth" onClick={() => setOpen(false)} className="text-xs text-primary hover:underline">
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
                className={cn(
                  "flex items-center gap-3 px-5 py-3.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary border-r-4 border-primary"
                    : "text-foreground hover:bg-muted"
                )}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border">
          {user && (
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-5 py-3.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-5 h-5 shrink-0" />
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
