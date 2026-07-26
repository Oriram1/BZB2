import { Home, LogIn, ListTodo, PlusCircle, ClipboardList, CreditCard, Shield, MessageCircle, UserCircle } from "lucide-react";
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
  { label: "דף הבית", shortLabel: "בית", to: "/", icon: Home },
  { label: "כניסה / הרשמה", shortLabel: "כניסה", to: "/auth", icon: LogIn, guestOnly: true },
  { label: "מטלות זמינות", shortLabel: "מטלות", to: "/tasks", icon: ListTodo },
  { label: "צור מטלה", shortLabel: "מטלה חדשה", to: "/create-task", icon: PlusCircle, authOnly: true, requiredRoles: ["tasker"] },
  { label: "המטלות שלי", shortLabel: "שלי", to: "/my-tasks", icon: ClipboardList, authOnly: true, requiredRoles: ["tasker"] },
  { label: "צ'אט", to: "/chat", icon: MessageCircle, authOnly: true, requiredRoles: ["tasker", "bee"] },
  { label: "הפרופיל שלי", shortLabel: "פרופיל", to: "/profile", icon: UserCircle, authOnly: true, requiredRoles: ["tasker", "bee"] },
  { label: "לוח הורים", shortLabel: "הורים", to: "/parent", icon: Shield, authOnly: true, requiredRoles: ["parent"] },
  { label: "מנויים", to: "/pricing", icon: CreditCard, bold: true },
];
