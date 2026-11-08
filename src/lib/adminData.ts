import { categoryLabel } from "@/lib/categories";
import { roleLabel } from "@/lib/roles";
import { formatDate, formatTime } from "@/lib/format";
import type { UserActivityAction } from "@/lib/activityLog";
import type { Json } from "@/integrations/supabase/types";

export interface AuditRow {
  id: string;
  admin_user_id: string;
  action: string;
  target_user_id: string | null;
  target_identifier: string | null;
  success: boolean;
  details: Json | null;
  created_at: string;
}

export interface ActivityRow {
  id: string;
  user_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Json | null;
  created_at: string;
}

export interface ProfileOption {
  user_id: string;
  first_name: string;
  last_name: string;
  age: number | null;
}

export interface ParentLinkRow {
  id: string;
  parent_user_id: string;
  child_user_id: string;
  created_at: string;
}

export interface DashboardStats {
  users: number;
  openTasks: number;
  activeTasks: number;
  parentLinks: number;
}

export type DrilldownKind = "openTasks" | "activeTasks";

export interface DrilldownItem {
  id: string;
  title: string;
  meta: string;
  /** Task rows only. User rows render `email` and `createdAt` as isolated runs. */
  detail?: string;
  href: string;
  email?: string;
  createdAt?: string;
  emailConfirmed?: boolean;
  blocked?: boolean;
  manageable?: boolean;
}

export interface AdminUserRow {
  id: string;
  displayName: string;
  email: string;
  age: number | null;
  createdAt: string;
  roles: string[];
  emailConfirmed: boolean;
  blocked: boolean;
}

export interface AdminUsersResponse {
  users?: AdminUserRow[];
  error?: string;
}

export type UserAdminAction = "block" | "unblock" | "delete" | "confirm_email";

export interface DuplicatePhoneGroup {
  phone: string;
  accounts: DrilldownItem[];
}

export const drilldownCopy: Record<DrilldownKind, { title: string; description: string }> = {
  openTasks: {
    title: "מטלות פתוחות",
    description: "מטלות שממתינות לביצוע",
  },
  activeTasks: {
    title: "מטלות בתהליך",
    description: "מטלות שאושרו או נמצאות בביצוע",
  },
};

export const EMPTY_STATS: DashboardStats = {
  users: 0,
  openTasks: 0,
  activeTasks: 0,
  parentLinks: 0,
};

export const actionLabel: Record<string, string> = {
  reset_password: "איפוס סיסמה",
  link_parent_child: "קישור הורה לילד",
  unlink_parent_child: "הסרת קישור הורה־ילד",
  block_user: "חסימת משתמש",
  unblock_user: "הסרת חסימת משתמש",
  confirm_user_email: "אישור הרשמת משתמש",
  delete_user: "מחיקת משתמש",
  admin_deleted_task: "מחיקת מטלה",
};

/** Same idea as actionLabel, for the actions ordinary users take. */
export const userActionLabel: Record<UserActivityAction, string> = {
  login: "התחברות",
  logout: "התנתקות",
  signup: "הרשמה",
  task_created: "פרסום מטלה",
  task_cancelled: "ביטול מטלה",
  task_completed: "השלמת מטלה",
  task_deleted: "מחיקת מטלה",
  application_submitted: "הגשת מועמדות",
  application_accepted: "אישור מועמדות",
  application_rejected: "דחיית מועמדות",
  profile_updated: "עדכון פרופיל",
  role_switched: "החלפת תפקיד",
};

export const fullName = (profile: Pick<ProfileOption, "first_name" | "last_name">) =>
  `${profile.first_name} ${profile.last_name}`.trim();

/**
 * Details are free-form jsonb, so render only the handful of keys we actually
 * write. Anything unexpected is skipped rather than dumped as raw JSON.
 */
export const activityDetail = (details: Json | null): string | null => {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const record = details as Record<string, Json>;
  const parts: string[] = [];
  if (typeof record.name === "string") parts.push(record.name);
  if (typeof record.taskName === "string") parts.push(record.taskName);
  if (typeof record.category === "string") parts.push(categoryLabel(record.category));
  if (typeof record.role === "string") parts.push(roleLabel(record.role));
  if (typeof record.method === "string") parts.push(record.method === "google" ? "Google" : "סיסמה");
  return parts.length > 0 ? parts.join(" · ") : null;
};

/** Hebrew agrees the noun and the verb with the count; "1 משתמשים" is wrong. */
export const usersSelectedLabel = (count: number) =>
  count === 1 ? "משתמש אחד נבחר" : `${count} משתמשים נבחרו`;

export const usersCountLabel = (count: number) =>
  count === 1 ? "משתמש אחד" : `${count} משתמשים`;

export const describeRoles = (userRoles: string[], blocked: boolean) => {
  if (blocked) return "חסום";
  if (userRoles.length === 0) return "ללא תפקיד";
  return userRoles.map(roleLabel).join(", ");
};

/**
 * An e-mail and a date are Latin runs inside a Hebrew sentence. Concatenating
 * them into one string lets the bidi algorithm reorder the whole line — the
 * address jumps to the far edge and the separator lands in the wrong place.
 * Each run is isolated in its own element instead.
 */
