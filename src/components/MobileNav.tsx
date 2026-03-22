import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, Home, LogIn, ListTodo, PlusCircle, ClipboardList, CreditCard, Shield, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "דף הבית", to: "/", icon: Home },
  { label: "כניסה / הרשמה", to: "/auth", icon: LogIn },
  { label: "מטלות זמינות", to: "/tasks", icon: ListTodo },
  { label: "צור מטלה", to: "/create-task", icon: PlusCircle },
  { label: "המטלות שלי", to: "/my-tasks", icon: ClipboardList },
  { label: "צ'אט", to: "/chat", icon: MessageCircle },
  { label: "לוח הורים", to: "/parent", icon: Shield },
  { label: "מנויים", to: "/pricing", icon: CreditCard },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  return (
    <>
      {/* Hamburger button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed top-4 right-4 z-[60] p-2 rounded-xl bg-primary/90 text-primary-foreground shadow-lg backdrop-blur-sm hover:bg-primary transition-colors"
        aria-label="פתח תפריט"
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm transition-opacity"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed top-0 right-0 z-[80] h-full w-72 bg-background border-l border-border shadow-2xl transition-transform duration-300 ease-in-out flex flex-col",
          open ? "translate-x-0" : "translate-x-full"
        )}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <span className="text-lg font-bold text-primary">🐝 BZB</span>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            aria-label="סגור תפריט"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-2">
          {navItems.map((item) => {
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

        {/* Footer */}
        <div className="p-4 border-t border-border text-center text-xs text-muted-foreground">
          Busy Bee © 2026
        </div>
      </div>
    </>
  );
}
