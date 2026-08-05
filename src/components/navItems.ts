import { Home, LogIn, ListTodo, PlusCircle, ClipboardList, CreditCard, Shield, ShieldCheck, MessageCircle, UserCircle, Bell } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  label: string;
  /** Shorter label for the mobile bottom bar; falls back to `label`. */
  shortLabel?: string;
  to: string;
  icon: LucideIcon;
  guestOnly?: boolean;
  authOnly?: boolean;
  requiredRoles?: string[];
  bold?: boolean;
};

export const navItems: NavItem[] = [
  /* The landing page is a marketing screen — signed-in users have no use for
     it, so it only shows up in the guest menu. */
  { label: "דף הבית", shortLabel: "בית", to: "/", icon: Home, guestOnly: true },
  { label: "כניסה / הרשמה", shortLabel: "כניסה", to: "/auth", icon: LogIn, guestOnly: true },
  { label: "מטלות זמינות", shortLabel: "מטלות", to: "/tasks", icon: ListTodo },
  { label: "צור מטלה", shortLabel: "מטלה חדשה", to: "/create-task", icon: PlusCircle, authOnly: true, requiredRoles: ["tasker"] },
  { label: "המטלות שלי", shortLabel: "שלי", to: "/my-tasks", icon: ClipboardList, authOnly: true, requiredRoles: ["tasker", "bee"] },
  { label: "צ'אט", to: "/chat", icon: MessageCircle, authOnly: true, requiredRoles: ["tasker", "bee"] },
  { label: "הפרופיל שלי", shortLabel: "פרופיל", to: "/profile", icon: UserCircle, authOnly: true, requiredRoles: ["tasker", "bee"] },
  { label: "לוח הורים", shortLabel: "הורים", to: "/parent", icon: Shield, authOnly: true, requiredRoles: ["parent"] },
  { label: "הגדרות התראות", shortLabel: "התראות", to: "/settings", icon: Bell, authOnly: true },
  /* Pricing is about the commission a publisher pays, so it is noise in a bee's
     menu — but it is also the marketing page, so guests still get it. */
  { label: "מנויים", to: "/pricing", icon: CreditCard, bold: true, requiredRoles: ["tasker"] },
  /* Admin and parent are mutually exclusive roles, so the two shields never
     appear in the same menu. */
  { label: "ניהול המערכת", shortLabel: "ניהול", to: "/admin", icon: ShieldCheck, authOnly: true, requiredRoles: ["admin"] },
];

/**
 * Who sees which entry. Shared by the drawer and the bottom bar so the two
 * menus cannot drift apart.
 *
 * `requiredRoles` only narrows a menu that already belongs to someone signed
 * in. A guest has no roles at all, so applying it to them would hide public
 * pages; every entry that is genuinely private carries `authOnly` as well.
 */
export const visibleNavItems = (signedIn: boolean, roles: string[]) =>
  navItems.filter((item) => {
    if (item.guestOnly && signedIn) return false;
    if (item.authOnly && !signedIn) return false;
    if (signedIn && item.requiredRoles?.length) {
      return item.requiredRoles.some((role) => roles.includes(role));
    }
    return true;
  });
