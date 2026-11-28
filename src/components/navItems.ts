import { Home, LogIn, TextSearch, WandSparkles, FileText, Wallet, ShieldCheck, MessageCircleMore, Settings } from "lucide-react";
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
  { label: "מטלות זמינות", shortLabel: "מטלות", to: ROUTES.tasks, icon: TextSearch },
  { label: "צור מטלה", shortLabel: "מטלה חדשה", to: ROUTES.createTask, icon: WandSparkles, authOnly: true, requiredRoles: ROUTE_ROLES[ROUTES.createTask] },
  { label: "המטלות שלי", shortLabel: "שלי", to: ROUTES.myTasks, icon: FileText, authOnly: true, requiredRoles: ROUTE_ROLES[ROUTES.myTasks] },
  { label: "צ'אט", to: ROUTES.chat, icon: MessageCircleMore, authOnly: true, requiredRoles: ROUTE_ROLES[ROUTES.chat] },
  { label: "הגדרות התראות", shortLabel: "התראות", to: ROUTES.settings, icon: Settings, authOnly: true },
  /* Pricing is about the commission a publisher pays, so it is noise in a bee's
     menu — but it is also the marketing page, so guests still get it. */
  { label: "מנויים", to: ROUTES.pricing, icon: Wallet, bold: true, requiredRoles: ["tasker"] },
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

/** A task-specific action is available only when the current screen identifies it. */
export function selectedTaskDetailsPath(pathname: string, search: string): string | null {
  if (pathname !== ROUTES.myTasks) return null;
  const taskId = new URLSearchParams(search).get("task");
  return taskId ? `/task/${encodeURIComponent(taskId)}` : null;
}

/** Match the selected drawer view without treating extra URL parameters as a different page. */
export function isDrawerItemActive(to: string, pathname: string, search: string, showBeeMenu: boolean): boolean {
  const [itemPath, query = ""] = to.split("?");
  if (pathname !== itemPath) return false;
  const current = new URLSearchParams(search);
  const expected = new URLSearchParams(query);
  if (query) return [...expected].every(([key, value]) => current.get(key) === value);
  if (showBeeMenu && itemPath === ROUTES.tasks && current.get("saved") === "1") return false;
  if (showBeeMenu && itemPath === ROUTES.myTasks && current.get("tab") === "performing" && current.get("completed") === "1") return false;
  return true;
}
