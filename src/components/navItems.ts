import { Home, LogIn, ListTodo, PlusCircle, ClipboardList, CreditCard, ShieldCheck, MessageCircle, Bell } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ROUTE_ROLES, ROUTES, type AppRole } from "@/lib/routes";

type NavItem = {
  label: string;
  /** Shorter label for the mobile bottom bar; falls back to `label`. */
  shortLabel?: string;
  to: string;
  icon: LucideIcon;
  guestOnly?: boolean;
  authOnly?: boolean;
  requiredRoles?: AppRole[];
  bold?: boolean;
};

export const navItems: NavItem[] = [
  /* The landing page is a marketing screen — signed-in users have no use for
     it, so it only shows up in the guest menu. */
  { label: "דף הבית", shortLabel: "בית", to: ROUTES.home, icon: Home, guestOnly: true },
  { label: "כניסה / הרשמה", shortLabel: "כניסה", to: ROUTES.auth, icon: LogIn, guestOnly: true },
  { label: "מטלות זמינות", shortLabel: "מטלות", to: ROUTES.tasks, icon: ListTodo },
  { label: "צור מטלה", shortLabel: "מטלה חדשה", to: ROUTES.createTask, icon: PlusCircle, authOnly: true, requiredRoles: ROUTE_ROLES[ROUTES.createTask] },
  { label: "המטלות שלי", shortLabel: "שלי", to: ROUTES.myTasks, icon: ClipboardList, authOnly: true, requiredRoles: ROUTE_ROLES[ROUTES.myTasks] },
  { label: "צ'אט", to: ROUTES.chat, icon: MessageCircle, authOnly: true, requiredRoles: ROUTE_ROLES[ROUTES.chat] },
  { label: "הגדרות התראות", shortLabel: "התראות", to: ROUTES.settings, icon: Bell, authOnly: true },
  /* Pricing is about the commission a publisher pays, so it is noise in a bee's
     menu — but it is also the marketing page, so guests still get it. */
  { label: "מנויים", to: ROUTES.pricing, icon: CreditCard, bold: true, requiredRoles: ["tasker"] },
  { label: "ניהול המערכת", shortLabel: "ניהול", to: ROUTES.admin, icon: ShieldCheck, authOnly: true, requiredRoles: ["admin"] },
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
