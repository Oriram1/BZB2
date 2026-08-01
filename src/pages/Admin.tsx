import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  ArrowRight,
  Ban,
  ChevronLeft,
  ClipboardList,
  Link as LinkIcon,
  Loader2,
  MailCheck,
  Shield,
  Trash2,
  UserCheck,
  UserRoundSearch,
  Users,
} from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { isStrongPassword, passwordRequirementsMessage } from "@/lib/password";
import { formatDate, formatPhone, formatTime } from "@/lib/format";
import type { Json } from "@/integrations/supabase/types";

interface AuditRow {
  id: string;
  admin_user_id: string;
  action: string;
  target_user_id: string | null;
  target_identifier: string | null;
  success: boolean;
  details: Json | null;
  created_at: string;
}

interface ProfileOption {
  user_id: string;
  first_name: string;
  last_name: string;
  age: number | null;
}

interface ParentLinkRow {
  id: string;
  parent_user_id: string;
  child_user_id: string;
  created_at: string;
}

interface DashboardStats {
  users: number;
  openTasks: number;
  activeTasks: number;
  parentLinks: number;
}

type DrilldownKind = "users" | "openTasks" | "activeTasks" | "parentLinks";

interface DrilldownItem {
  id: string;
  title: string;
  meta: string;
  detail: string;
  href: string;
  email?: string;
  emailConfirmed?: boolean;
  blocked?: boolean;
  manageable?: boolean;
}

interface AdminUserRow {
  id: string;
  displayName: string;
  email: string;
  age: number | null;
  createdAt: string;
  roles: string[];
  emailConfirmed: boolean;
  blocked: boolean;
}

interface AdminUsersResponse {
  users?: AdminUserRow[];
  error?: string;
}

type UserAdminAction = "block" | "unblock" | "delete" | "confirm_email";

/**
 * Accounts sharing one phone number.
 *
 * Sharing is allowed on purpose — a parent and child, or two siblings, may use
 * one phone — so registration only warns. This view is the counterweight: it
 * surfaces every shared number so an admin can tell a family apart from one
 * person farming duplicate accounts.
 */
interface DuplicatePhoneGroup {
  phone: string;
  accounts: DrilldownItem[];
}

const drilldownCopy: Record<DrilldownKind, { title: string; description: string }> = {
  users: {
    title: "כל המשתמשים",
    description: "המשתמשים הרשומים במערכת",
  },
  openTasks: {
    title: "מטלות פתוחות",
    description: "מטלות שממתינות לביצוע",
  },
  activeTasks: {
    title: "מטלות בתהליך",
    description: "מטלות שאושרו או נמצאות בביצוע",
  },
  parentLinks: {
    title: "קישורי משפחה",
    description: "הקשרים הפעילים בין הורים לילדים",
  },
};

const EMPTY_STATS: DashboardStats = {
  users: 0,
  openTasks: 0,
  activeTasks: 0,
  parentLinks: 0,
};

const actionLabel: Record<string, string> = {
  reset_password: "איפוס סיסמה",
  link_parent_child: "קישור הורה לילד",
  unlink_parent_child: "הסרת קישור הורה־ילד",
  block_user: "חסימת משתמש",
  unblock_user: "הסרת חסימת משתמש",
  confirm_user_email: "אישור הרשמת משתמש",
  delete_user: "מחיקת משתמש",
};

const fullName = (profile: Pick<ProfileOption, "first_name" | "last_name">) =>
  `${profile.first_name} ${profile.last_name}`.trim();

export default function Admin() {
  const { user, roles, loading } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [parentQuery, setParentQuery] = useState("");
  const [childQuery, setChildQuery] = useState("");
  const [parentResults, setParentResults] = useState<ProfileOption[]>([]);
  const [childResults, setChildResults] = useState<ProfileOption[]>([]);
  const [selectedParent, setSelectedParent] = useState<ProfileOption | null>(null);
  const [selectedChild, setSelectedChild] = useState<ProfileOption | null>(null);
  const [links, setLinks] = useState<ParentLinkRow[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, ProfileOption>>({});
  const [searchingParent, setSearchingParent] = useState(false);
  const [searchingChild, setSearchingChild] = useState(false);
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [removingLinkId, setRemovingLinkId] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [statsLoading, setStatsLoading] = useState(true);
  const [activeDrilldown, setActiveDrilldown] = useState<DrilldownKind | null>(null);
  const [drilldownItems, setDrilldownItems] = useState<DrilldownItem[]>([]);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldownError, setDrilldownError] = useState(false);
  const [pendingUserAction, setPendingUserAction] = useState<{
    item: DrilldownItem;
    action: UserAdminAction;
  } | null>(null);
  const [managingUser, setManagingUser] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [duplicatePhones, setDuplicatePhones] = useState<DuplicatePhoneGroup[]>([]);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);
  const [duplicatesError, setDuplicatesError] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const lastSelectedUserIdRef = useRef<string | null>(null);
  const checkboxShiftPressedRef = useRef(false);

  const isAdmin = roles.includes("admin");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      toast.error("יש להתחבר");
      navigate("/login", { replace: true });
      return;
    }
    if (!isAdmin) {
      toast.error("אין לך הרשאת אדמין");
      navigate("/tasks", { replace: true });
    }
  }, [user, isAdmin, loading, navigate]);

  const loadAudit = async () => {
    const { data, error } = await supabase
      .from("admin_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      toast.error("לא הצלחתי לטעון את הפעילות האחרונה");
      return;
    }

    setAudit(data ?? []);
  };

  const loadLinks = async () => {
    const { data, error } = await supabase
      .from("parent_links")
      .select("id, parent_user_id, child_user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      toast.error("לא הצלחתי לטעון קישורי הורה־ילד");
      return;
    }

    const rows = data ?? [];
    setLinks(rows);

    const userIds = Array.from(
      new Set(rows.flatMap((row) => [row.parent_user_id, row.child_user_id])),
    );

    if (userIds.length === 0) {
      setProfilesById({});
      return;
    }

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, age")
      .in("user_id", userIds);

    if (profilesError) {
      toast.error("לא הצלחתי לטעון פרטי משתמשים");
      return;
    }

    const nextProfiles = (profiles ?? []).reduce<Record<string, ProfileOption>>((acc, profile) => {
      acc[profile.user_id] = profile;
      return acc;
    }, {});

    setProfilesById(nextProfiles);
  };

  const loadStats = async () => {
    setStatsLoading(true);

    const [usersResult, openTasksResult, activeTasksResult, linksResult] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .in("status", ["accepted", "in_progress"]),
      supabase.from("parent_links").select("id", { count: "exact", head: true }),
    ]);

    const firstError =
      usersResult.error ?? openTasksResult.error ?? activeTasksResult.error ?? linksResult.error;

    if (firstError) {
      toast.error("לא הצלחתי לטעון את תמונת המצב");
      setStatsLoading(false);
      return;
    }

    setStats({
      users: usersResult.count ?? 0,
      openTasks: openTasksResult.count ?? 0,
      activeTasks: activeTasksResult.count ?? 0,
      parentLinks: linksResult.count ?? 0,
    });
    setStatsLoading(false);
  };

  useEffect(() => {
    if (isAdmin) {
      void loadAudit();
      void loadLinks();
      void loadStats();
      void loadDuplicatePhones();
    }
  }, [isAdmin, loadDuplicatePhones]);

  const searchProfiles = async (
    query: string,
    setter: (rows: ProfileOption[]) => void,
    setSearching: (value: boolean) => void,
  ) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setter([]);
      return;
    }

    setSearching(true);
    const safeTerm = trimmed.replace(/[%_,]/g, "");
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, age")
      .or(`first_name.ilike.%${safeTerm}%,last_name.ilike.%${safeTerm}%`)
      .limit(8);

    setSearching(false);

    if (error) {
      toast.error("חיפוש המשתמשים נכשל");
      return;
    }

    setter(data ?? []);
  };

  const loadDuplicatePhones = useCallback(async () => {
    setDuplicatesLoading(true);
    setDuplicatesError(false);
    try {
      const [{ data: profiles, error: profilesError }, { data: adminData, error: adminError }] =
        await Promise.all([
          supabase.from("profiles").select("user_id, phone").not("phone", "is", null).neq("phone", ""),
          supabase.functions.invoke<AdminUsersResponse>("admin-manage-users", {
            body: { action: "list" },
          }),
        ]);

      if (profilesError || adminError || adminData?.error) throw profilesError ?? adminError;

      const usersById = new Map((adminData?.users ?? []).map((row) => [row.id, row]));

      const byPhone = new Map<string, string[]>();
      for (const profile of profiles ?? []) {
        const phone = (profile.phone ?? "").trim();
        if (!phone) continue;
        byPhone.set(phone, [...(byPhone.get(phone) ?? []), profile.user_id]);
      }

      const groups: DuplicatePhoneGroup[] = [];
      for (const [phone, userIds] of byPhone) {
        if (userIds.length < 2) continue;

        const accounts = userIds
          .map((userId) => usersById.get(userId))
          .filter((row): row is AdminUserRow => Boolean(row))
          .map((row) => ({
            id: row.id,
            title: row.displayName,
            meta: row.blocked
              ? "חסום"
              : row.roles.length > 0
                ? row.roles.join(", ")
                : "ללא תפקיד",
            detail: `${row.email || "ללא אימייל"} · הצטרפות: ${formatDate(row.createdAt)}`,
            href: `/profile/${row.id}`,
            email: row.email,
            emailConfirmed: row.emailConfirmed,
            blocked: row.blocked,
            manageable: !row.roles.includes("admin"),
          }));

        // A profile whose auth user is gone leaves a stale row; without this
        // the group could show a single account and read as a false positive.
        if (accounts.length > 1) groups.push({ phone, accounts });
      }

      groups.sort((a, b) => b.accounts.length - a.accounts.length);
      setDuplicatePhones(groups);
    } catch {
      setDuplicatesError(true);
      setDuplicatePhones([]);
    } finally {
      setDuplicatesLoading(false);
    }
  }, []);

  const openDrilldown = async (kind: DrilldownKind) => {
    setActiveDrilldown(kind);
    setDrilldownItems([]);
    setSelectedUserIds([]);
    lastSelectedUserIdRef.current = null;
    setDrilldownError(false);
    setDrilldownLoading(true);

    try {
      if (kind === "users") {
        const { data, error } = await supabase.functions.invoke<AdminUsersResponse>(
          "admin-manage-users",
          { body: { action: "list" } },
        );
        if (error || data?.error) throw error ?? new Error(data?.error);

        setDrilldownItems(
          (data?.users ?? []).map((adminUser) => ({
            id: adminUser.id,
            title: adminUser.displayName,
            meta: adminUser.blocked
              ? "חסום"
              : adminUser.roles.length > 0
                ? adminUser.roles.join(", ")
                : "ללא תפקיד",
            detail: `${adminUser.email || "ללא אימייל"} · הצטרפות: ${formatDate(adminUser.createdAt)}`,
            href: `/profile/${adminUser.id}`,
            email: adminUser.email,
            emailConfirmed: adminUser.emailConfirmed,
            blocked: adminUser.blocked,
            manageable: !adminUser.roles.includes("admin"),
          })),
        );
        return;
      }

      if (kind === "openTasks" || kind === "activeTasks") {
        let query = supabase
          .from("tasks")
          .select("id, name, status, location, created_at")
          .order("created_at", { ascending: false });

        query =
          kind === "openTasks"
            ? query.eq("status", "open")
            : query.in("status", ["accepted", "in_progress"]);

        const { data, error } = await query;
        if (error) throw error;

        setDrilldownItems(
          (data ?? []).map((task) => ({
            id: task.id,
            title: task.name,
            meta:
              task.status === "open"
                ? "פתוחה"
                : task.status === "accepted"
                  ? "אושרה"
                  : "בתהליך",
            detail: `${task.location || "ללא מיקום"} · ${formatDate(task.created_at)}`,
            href: `/task/${task.id}`,
          })),
        );
        return;
      }

      const { data: linkRows, error: linksError } = await supabase
        .from("parent_links")
        .select("id, parent_user_id, child_user_id, created_at")
        .order("created_at", { ascending: false });

      if (linksError) throw linksError;

      const ids = Array.from(
        new Set((linkRows ?? []).flatMap((link) => [link.parent_user_id, link.child_user_id])),
      );
      const { data: profileRows, error: profilesError } = ids.length
        ? await supabase
            .from("profiles")
            .select("user_id, first_name, last_name, age")
            .in("user_id", ids)
        : { data: [], error: null };

      if (profilesError) throw profilesError;

      const namesById = (profileRows ?? []).reduce<Record<string, string>>((acc, profile) => {
        acc[profile.user_id] = fullName(profile);
        return acc;
      }, {});

      setDrilldownItems(
        (linkRows ?? []).map((link) => ({
          id: link.id,
          title: namesById[link.parent_user_id] || "הורה ללא שם",
          meta: `ילד: ${namesById[link.child_user_id] || "ללא שם"}`,
          detail: `נוצר בתאריך ${formatDate(link.created_at)}`,
          href: `/profile/${link.child_user_id}`,
        })),
      );
    } catch {
      setDrilldownError(true);
    } finally {
      setDrilldownLoading(false);
    }
  };

  const manageUser = async () => {
    if (!pendingUserAction) return;

    setManagingUser(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
        "admin-manage-users",
        {
          body: {
            action: pendingUserAction.action,
            userId: pendingUserAction.item.id,
          },
        },
      );

      if (error || !data?.ok) {
        toast.error("הפעולה לא הושלמה");
        return;
      }

      const successMessage =
        pendingUserAction.action === "delete"
          ? "המשתמש נמחק לצמיתות"
          : pendingUserAction.action === "confirm_email"
            ? "ההרשמה אושרה והמשתמש יכול להתחבר"
          : pendingUserAction.action === "block"
            ? "המשתמש נחסם"
            : "חסימת המשתמש הוסרה";
      toast.success(successMessage);
      setPendingUserAction(null);
      if (activeDrilldown === "users") await openDrilldown("users");
      await loadStats();
      await loadAudit();
      await loadDuplicatePhones();
    } finally {
      setManagingUser(false);
    }
  };

  const deleteSelectedUsers = async () => {
    if (selectedUserIds.length === 0) return;

    setManagingUser(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        ok?: boolean;
        deleted?: string[];
        failed?: { userId: string; error: string }[];
        error?: string;
      }>("admin-manage-users", {
        body: { action: "delete_many", userIds: selectedUserIds },
      });

      const deletedCount = data?.deleted?.length ?? 0;
      const failedCount = data?.failed?.length ?? 0;

      if (error || deletedCount === 0) {
        toast.error("המחיקה הקבוצתית לא הושלמה");
        return;
      }

      if (failedCount > 0) {
        toast.warning(`${deletedCount} משתמשים נמחקו, ${failedCount} לא נמחקו`);
      } else {
        toast.success(`${deletedCount} משתמשים וכל המידע שלהם נמחקו`);
      }

      setBulkDeleteOpen(false);
      setSelectedUserIds([]);
      await openDrilldown("users");
      await loadStats();
      await loadAudit();
    } finally {
      setManagingUser(false);
    }
  };

  const updateUserSelection = (userId: string, selected: boolean, selectRange: boolean) => {
    const anchorId = lastSelectedUserIdRef.current;
    const anchorIndex = anchorId ? selectableUserIds.indexOf(anchorId) : -1;
    const currentIndex = selectableUserIds.indexOf(userId);

    setSelectedUserIds((current) => {
      if (selectRange && anchorIndex >= 0 && currentIndex >= 0) {
        const start = Math.min(anchorIndex, currentIndex);
        const end = Math.max(anchorIndex, currentIndex);
        const range = selectableUserIds.slice(start, end + 1);
        return selected
          ? [...new Set([...current, ...range])]
          : current.filter((id) => !range.includes(id));
      }

      return selected
        ? [...new Set([...current, userId])]
        : current.filter((id) => id !== userId);
    });

    lastSelectedUserIdRef.current = userId;
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !isStrongPassword(newPassword)) {
      toast.error(identifier.trim() ? passwordRequirementsMessage : "מלא אימייל/שם וסיסמה");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ error?: string }>("admin-reset-password", {
        body: { identifier: identifier.trim(), newPassword },
      });
      if (error || data?.error) {
        toast.error(data?.error ?? error?.message ?? "שגיאה");
      } else {
        toast.success("הסיסמה אופסה בהצלחה");
        setIdentifier("");
        setNewPassword("");
        await loadAudit();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) return;

    if (!selectedParent || !selectedChild) {
      toast.error("צריך לבחור גם הורה וגם ילד");
      return;
    }

    if (selectedParent.user_id === selectedChild.user_id) {
      toast.error("אי אפשר לקשר משתמש לעצמו");
      return;
    }

    setLinkSubmitting(true);
    try {
      const { error } = await supabase.from("parent_links").insert({
        parent_user_id: selectedParent.user_id,
        child_user_id: selectedChild.user_id,
      });

      if (error) {
        toast.error(error.message.includes("duplicate") ? "הקישור הזה כבר קיים" : "יצירת הקישור נכשלה");
        return;
      }

      await supabase.from("admin_audit_log").insert({
        admin_user_id: user.id,
        action: "link_parent_child",
        target_user_id: selectedChild.user_id,
        target_identifier: `${fullName(selectedParent)} -> ${fullName(selectedChild)}`,
        success: true,
        details: {
          parent_user_id: selectedParent.user_id,
          child_user_id: selectedChild.user_id,
        },
      });

      toast.success("קישור הורה־ילד נוצר");
      setParentQuery("");
      setChildQuery("");
      setParentResults([]);
      setChildResults([]);
      setSelectedParent(null);
      setSelectedChild(null);
      await loadLinks();
      await loadAudit();
      await loadStats();
    } finally {
      setLinkSubmitting(false);
    }
  };

  const handleDeleteLink = async (link: ParentLinkRow) => {
    if (!user) return;

    setRemovingLinkId(link.id);

    try {
      const { error } = await supabase.from("parent_links").delete().eq("id", link.id);

      if (error) {
        toast.error("מחיקת הקישור נכשלה");
        return;
      }

      await supabase.from("admin_audit_log").insert({
        admin_user_id: user.id,
        action: "unlink_parent_child",
        target_user_id: link.child_user_id,
        target_identifier: `${profilesById[link.parent_user_id] ? fullName(profilesById[link.parent_user_id]) : link.parent_user_id} -> ${profilesById[link.child_user_id] ? fullName(profilesById[link.child_user_id]) : link.child_user_id}`,
        success: true,
        details: {
          parent_user_id: link.parent_user_id,
          child_user_id: link.child_user_id,
        },
      });

      toast.success("הקישור הוסר");
      await loadLinks();
      await loadAudit();
      await loadStats();
    } finally {
      setRemovingLinkId(null);
    }
  };

  const selectableUserIds =
    activeDrilldown === "users"
      ? drilldownItems
          .filter((item) => item.manageable && item.id !== user?.id)
          .map((item) => item.id)
      : [];
  const allSelectableUsersSelected =
    selectableUserIds.length > 0 &&
    selectableUserIds.every((id) => selectedUserIds.includes(id));

  if (loading || !isAdmin) return null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background pb-20" dir="rtl">
      <div className="pointer-events-none absolute -right-24 top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 top-[32rem] h-64 w-64 rounded-full bg-amber-200/20 blur-3xl" />
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="חזרה">
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary-ink">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold">ניהול המערכת</h1>
            <p className="text-xs text-muted-foreground">תמונת מצב ופעולות חשובות במקום אחד</p>
          </div>
        </div>
      </header>

      <main className="relative z-[1] max-w-5xl mx-auto px-4 py-6 space-y-6">
        <section aria-labelledby="overview-title">
          <h2 id="overview-title" className="mb-3 text-lg font-extrabold">תמונת מצב</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="משתמשים" value={stats.users} loading={statsLoading} icon={Users} onClick={() => void openDrilldown("users")} />
            <StatCard label="מטלות פתוחות" value={stats.openTasks} loading={statsLoading} icon={ClipboardList} onClick={() => void openDrilldown("openTasks")} />
            <StatCard label="מטלות בתהליך" value={stats.activeTasks} loading={statsLoading} icon={Loader2} onClick={() => void openDrilldown("activeTasks")} />
            <StatCard label="קישורי משפחה" value={stats.parentLinks} loading={statsLoading} icon={LinkIcon} onClick={() => void openDrilldown("parentLinks")} />
          </div>
        </section>

        <section aria-labelledby="duplicates-title">
          <div className="mb-3">
            <h2 id="duplicates-title" className="text-lg font-extrabold">מספרי טלפון משותפים</h2>
            <p className="text-sm text-muted-foreground">
              חשבונות שנרשמו עם אותו מספר. שיתוף בין הורה לילד או בין אחים הוא תקין —
              ריבוי חשבונות של אותו אדם הוא לא.
            </p>
          </div>

          <Card className="p-5 border-border/80 shadow-sm">
            {duplicatesLoading ? (
              <div className="space-y-3">
                {[0, 1].map((index) => <Skeleton key={index} className="h-24 w-full rounded-2xl" />)}
              </div>
            ) : duplicatesError ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">לא הצלחתי לטעון את הרשימה.</p>
                <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => void loadDuplicatePhones()}>
                  נסה שוב
                </Button>
              </div>
            ) : duplicatePhones.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                אין כרגע מספרים משותפים 🎉
              </p>
            ) : (
              <ul className="space-y-4">
                {duplicatePhones.map((group) => (
                  <li key={group.phone} className="rounded-2xl border border-border/80 overflow-hidden">
                    <div className="flex items-center justify-between gap-3 bg-muted/40 px-4 py-2.5">
                      <span dir="ltr" className="font-bold tabular-nums">{formatPhone(group.phone)}</span>
                      <span className="text-xs font-semibold text-muted-foreground">
                        {group.accounts.length} חשבונות
                      </span>
                    </div>

                    <ul className="divide-y divide-border">
                      {group.accounts.map((account) => (
                        <li key={account.id} className="px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-bold">
                                {account.title}
                                {account.blocked && (
                                  <span className="mr-2 rounded-lg bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive">
                                    חסום
                                  </span>
                                )}
                              </p>
                              <p className="text-sm text-muted-foreground break-all">{account.detail}</p>
                            </div>

                            {account.manageable && account.id !== user?.id ? (
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="min-h-10 rounded-xl"
                                  onClick={() =>
                                    setPendingUserAction({
                                      item: account,
                                      action: account.blocked ? "unblock" : "block",
                                    })
                                  }
                                >
                                  {account.blocked ? <UserCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                                  {account.blocked ? "הסרת חסימה" : "חסימה"}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  className="min-h-10 rounded-xl"
                                  onClick={() => setPendingUserAction({ item: account, action: "delete" })}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  מחיקה
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {account.id === user?.id ? "זה אתה" : "חשבון אדמין"}
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        <section aria-labelledby="actions-title">
          <div className="mb-3">
            <h2 id="actions-title" className="text-lg font-extrabold">פעולות אדמין</h2>
            <p className="text-sm text-muted-foreground">שתי הפעולות השימושיות לניהול היומיומי</p>
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card className="p-5 space-y-4 border-border/80 shadow-sm">
          <div>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary-ink">
              <Users className="h-5 w-5" />
            </div>
            <h3 className="font-extrabold text-lg">ניהול משתמש</h3>
            <p className="text-sm text-muted-foreground">איפוס סיסמה לפי אימייל או שם</p>
          </div>
          <form onSubmit={handleReset} className="space-y-3">
            <div>
              <Label htmlFor="identifier">אימייל או שם משתמש</Label>
              <Input
                id="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="user@example.com או 'אליה'"
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="newPassword">סיסמה חדשה</Label>
              <PasswordInput
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="לפחות 6 תווים"
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" disabled={submitting} className="w-full min-h-11 rounded-xl font-bold">
              {submitting ? "מאפס..." : "אפס סיסמה"}
            </Button>
          </form>
        </Card>

        <Card className="p-5 space-y-4 border-border/80 shadow-sm">
          <div>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary-ink">
              <LinkIcon className="h-5 w-5" />
            </div>
            <h3 className="font-extrabold text-lg">ניהול משפחה</h3>
            <p className="text-sm text-muted-foreground">קישור הורה לילד לצורך אזור ההורים</p>
          </div>

          <form onSubmit={handleCreateLink} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="parentQuery">חיפוש הורה</Label>
                <div className="flex gap-2">
                  <Input
                    id="parentQuery"
                    value={parentQuery}
                    onChange={(e) => setParentQuery(e.target.value)}
                    placeholder="שם פרטי או שם משפחה"
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void searchProfiles(parentQuery, setParentResults, setSearchingParent)}
                    disabled={searchingParent}
                    aria-label="חיפוש הורה"
                    className="min-h-11 min-w-11"
                  >
                    <UserRoundSearch className="h-4 w-4" />
                  </Button>
                </div>
                {selectedParent && (
                  <div className="text-sm rounded-md border bg-muted px-3 py-2">
                    נבחר הורה: {fullName(selectedParent)} {selectedParent.age ? `· גיל ${selectedParent.age}` : ""}
                  </div>
                )}
                {parentResults.length > 0 && (
                  <div className="space-y-2">
                    {parentResults.map((profile) => (
                      <button
                        key={profile.user_id}
                        type="button"
                        className="w-full rounded-md border px-3 py-2 text-right text-sm hover:bg-muted"
                        onClick={() => {
                          setSelectedParent(profile);
                          setParentResults([]);
                          setParentQuery(fullName(profile));
                        }}
                      >
                        <div className="font-medium">{fullName(profile)}</div>
                        <div className="text-xs text-muted-foreground">{profile.user_id}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="childQuery">חיפוש ילד</Label>
                <div className="flex gap-2">
                  <Input
                    id="childQuery"
                    value={childQuery}
                    onChange={(e) => setChildQuery(e.target.value)}
                    placeholder="שם פרטי או שם משפחה"
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void searchProfiles(childQuery, setChildResults, setSearchingChild)}
                    disabled={searchingChild}
                    aria-label="חיפוש ילד"
                    className="min-h-11 min-w-11"
                  >
                    <UserRoundSearch className="h-4 w-4" />
                  </Button>
                </div>
                {selectedChild && (
                  <div className="text-sm rounded-md border bg-muted px-3 py-2">
                    נבחר ילד: {fullName(selectedChild)} {selectedChild.age ? `· גיל ${selectedChild.age}` : ""}
                  </div>
                )}
                {childResults.length > 0 && (
                  <div className="space-y-2">
                    {childResults.map((profile) => (
                      <button
                        key={profile.user_id}
                        type="button"
                        className="w-full rounded-md border px-3 py-2 text-right text-sm hover:bg-muted"
                        onClick={() => {
                          setSelectedChild(profile);
                          setChildResults([]);
                          setChildQuery(fullName(profile));
                        }}
                      >
                        <div className="font-medium">{fullName(profile)}</div>
                        <div className="text-xs text-muted-foreground">{profile.user_id}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <Button type="submit" disabled={linkSubmitting} className="w-full min-h-11 rounded-xl font-bold">
              <LinkIcon className="h-4 w-4" />
              {linkSubmitting ? "יוצר קישור..." : "צור קישור הורה־ילד"}
            </Button>
          </form>
        </Card>
          </div>
        </section>

        <Card className="p-5 border-border/80 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-extrabold text-lg">קישורי משפחה</h2>
              <p className="text-sm text-muted-foreground">הקישורים האחרונים שנוצרו</p>
            </div>
            <span className="rounded-full bg-muted px-3 py-1 text-sm font-bold tabular-nums">{links.length}</span>
          </div>
          {links.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין קישורים עדיין</p>
          ) : (
            <ul className="space-y-2">
              {links.map((link) => {
                const parent = profilesById[link.parent_user_id];
                const child = profilesById[link.child_user_id];

                return (
                  <li key={link.id} className="border rounded-md p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="text-sm">
                      <div className="font-medium">
                        {parent ? fullName(parent) : link.parent_user_id} ← הורה
                      </div>
                      <div>
                        {child ? fullName(child) : link.child_user_id} ← ילד
                      </div>
                      <div className="text-xs text-muted-foreground tabular mt-1">
                        {formatDate(link.created_at)} {formatTime(new Date(link.created_at))}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleDeleteLink(link)}
                      disabled={removingLinkId === link.id}
                      className="min-h-11"
                    >
                      <Trash2 className="h-4 w-4" />
                      {removingLinkId === link.id ? "מסיר..." : "הסר קישור"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="p-5 border-border/80 shadow-sm">
          <h2 className="font-extrabold text-lg">פעילות אחרונה</h2>
          <p className="mb-3 text-sm text-muted-foreground">פעולות שבוצעו על ידי מנהלי המערכת</p>
          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין רשומות עדיין</p>
          ) : (
            <ul className="space-y-2">
              {audit.map((row) => (
                <li
                  key={row.id}
                  className="text-sm border rounded-md p-3 flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{actionLabel[row.action] ?? row.action}</span>
                    <span
                      className={
                        row.success
                          ? "text-green-600 text-xs"
                          : "text-red-600 text-xs"
                      }
                    >
                      {row.success ? "הצלחה" : "כשל"}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    יעד: {row.target_identifier ?? row.target_user_id ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground tabular">
                    {formatDate(row.created_at)} {formatTime(new Date(row.created_at))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </main>

      <Dialog
        open={activeDrilldown !== null}
        onOpenChange={(open) => {
          if (!open) setActiveDrilldown(null);
        }}
      >
        <DialogContent
          dir="rtl"
          className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl gap-0 overflow-hidden rounded-2xl p-0 text-right [&>button]:left-4 [&>button]:right-auto"
        >
          {activeDrilldown && (
            <>
              <DialogHeader className="border-b px-5 py-5 ps-14 text-right sm:text-right">
                <DialogTitle className="text-xl font-extrabold">
                  {drilldownCopy[activeDrilldown].title}
                </DialogTitle>
                <DialogDescription>
                  {drilldownCopy[activeDrilldown].description}
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[65dvh] overflow-y-auto p-4">
                {activeDrilldown === "users" && !drilldownLoading && !drilldownError && (
                  <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur">
                    <div>
                      <label className="flex min-h-8 cursor-pointer items-center gap-3 font-bold">
                        <Checkbox
                          checked={
                            allSelectableUsersSelected
                              ? true
                              : selectedUserIds.length > 0
                                ? "indeterminate"
                                : false
                          }
                          onCheckedChange={(checked) => {
                            setSelectedUserIds(checked === true ? selectableUserIds : []);
                            lastSelectedUserIdRef.current =
                              checked === true ? selectableUserIds.at(-1) ?? null : null;
                          }}
                          aria-label="בחירת כל המשתמשים הניתנים למחיקה"
                        />
                        {selectedUserIds.length > 0
                          ? `${selectedUserIds.length} נבחרו`
                          : "בחירת הכול"}
                      </label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Shift + לחיצה מסמנים טווח
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={selectedUserIds.length === 0}
                      className="min-h-11 rounded-xl font-bold"
                      onClick={() => setBulkDeleteOpen(true)}
                    >
                      <Trash2 className="h-4 w-4" />
                      מחיקת הנבחרים
                    </Button>
                  </div>
                )}
                {drilldownLoading ? (
                  <div className="space-y-3" aria-label="טוען נתונים">
                    {[0, 1, 2, 3].map((item) => (
                      <Skeleton key={item} className="h-20 w-full rounded-xl" />
                    ))}
                  </div>
                ) : drilldownError ? (
                  <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-center">
                    <p className="font-bold">לא הצלחנו לטעון את הנתונים</p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3 min-h-11"
                      onClick={() => void openDrilldown(activeDrilldown)}
                    >
                      נסו שוב
                    </Button>
                  </div>
                ) : drilldownItems.length === 0 ? (
                  <div className="rounded-xl border bg-muted/40 p-8 text-center text-muted-foreground">
                    אין פריטים להצגה
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {drilldownItems.map((item) => (
                      <li key={item.id} className="relative overflow-hidden rounded-xl border bg-card">
                        {activeDrilldown === "users" && item.id !== user?.id && item.manageable && (
                          <div className="absolute end-4 top-4 z-[1] flex h-8 w-8 items-center justify-center rounded-lg bg-background shadow-sm">
                            <Checkbox
                              checked={selectedUserIds.includes(item.id)}
                              onClick={(event) => {
                                checkboxShiftPressedRef.current = event.shiftKey;
                              }}
                              onCheckedChange={(checked) => {
                                updateUserSelection(
                                  item.id,
                                  checked === true,
                                  checkboxShiftPressedRef.current,
                                );
                                checkboxShiftPressedRef.current = false;
                              }}
                              aria-label={`בחירת ${item.title} למחיקה`}
                            />
                          </div>
                        )}
                        <button
                          type="button"
                          className={`group w-full p-4 text-right outline-none transition-all hover:bg-primary/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                            activeDrilldown === "users" && item.manageable ? "pe-16" : ""
                          }`}
                          onClick={(event) => {
                            if (
                              activeDrilldown === "users" &&
                              item.manageable &&
                              item.id !== user?.id &&
                              event.shiftKey
                            ) {
                              event.preventDefault();
                              updateUserSelection(item.id, true, true);
                              return;
                            }
                            setActiveDrilldown(null);
                            navigate(item.href);
                          }}
                          aria-label={`מעבר אל ${item.title}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <span className="font-extrabold">{item.title}</span>
                                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary-ink">
                                  {item.meta}
                                </span>
                              </div>
                              <p className="mt-2 text-sm text-muted-foreground">{item.detail}</p>
                              {activeDrilldown === "users" && (
                                <span
                                  className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                                    item.emailConfirmed
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-amber-100 text-amber-900"
                                  }`}
                                >
                                  {item.emailConfirmed
                                    ? "אימייל מאושר"
                                    : "ממתין לאישור אימייל"}
                                </span>
                              )}
                            </div>
                            <ChevronLeft className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-1" />
                          </div>
                        </button>
                        {activeDrilldown === "users" && item.id !== user?.id && item.manageable && (
                          <div className="flex flex-wrap gap-2 border-t bg-muted/30 p-3">
                            {!item.emailConfirmed && (
                              <Button
                                type="button"
                                size="sm"
                                className="min-h-10 rounded-xl"
                                onClick={() =>
                                  setPendingUserAction({
                                    item,
                                    action: "confirm_email",
                                  })
                                }
                              >
                                <MailCheck className="h-4 w-4" />
                                אישור הרשמה
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="min-h-10 rounded-xl"
                              onClick={() =>
                                setPendingUserAction({
                                  item,
                                  action: item.blocked ? "unblock" : "block",
                                })
                              }
                            >
                              {item.blocked ? (
                                <UserCheck className="h-4 w-4" />
                              ) : (
                                <Ban className="h-4 w-4" />
                              )}
                              {item.blocked ? "הסרת חסימה" : "חסימת משתמש"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              className="min-h-10 rounded-xl"
                              onClick={() => setPendingUserAction({ item, action: "delete" })}
                            >
                              <Trash2 className="h-4 w-4" />
                              מחיקה לצמיתות
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingUserAction !== null}
        onOpenChange={(open) => {
          if (!open && !managingUser) setPendingUserAction(null);
        }}
      >
        <AlertDialogContent dir="rtl" className="text-right">
          <AlertDialogHeader className="text-right sm:text-right">
            <AlertDialogTitle>
              {pendingUserAction?.action === "delete"
                ? "מחיקת משתמש לצמיתות"
                : pendingUserAction?.action === "confirm_email"
                  ? "אישור הרשמת משתמש"
                : pendingUserAction?.action === "block"
                  ? "חסימת משתמש"
                  : "הסרת חסימה"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingUserAction?.action === "delete"
                ? `החשבון של ${pendingUserAction.item.title} וכל המידע המקושר אליו יימחקו ולא ניתן יהיה לשחזר אותם.`
                : pendingUserAction?.action === "confirm_email"
                  ? `האימייל של ${pendingUserAction?.item.title} יסומן כמאושר, והמשתמש יוכל להתחבר למערכת ללא לחיצה על קישור האישור.`
                : pendingUserAction?.action === "block"
                  ? `${pendingUserAction?.item.title} לא יוכל להתחבר למערכת עד להסרת החסימה.`
                  : `${pendingUserAction?.item.title} יוכל להתחבר שוב למערכת.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:space-x-0">
            <AlertDialogCancel disabled={managingUser}>ביטול</AlertDialogCancel>
            <AlertDialogAction
              disabled={managingUser}
              onClick={(event) => {
                event.preventDefault();
                void manageUser();
              }}
              className={
                pendingUserAction?.action === "delete"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
            >
              {managingUser
                ? "מבצע..."
                : pendingUserAction?.action === "delete"
                  ? "כן, למחוק לצמיתות"
                  : "אישור"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={bulkDeleteOpen}
        onOpenChange={(open) => {
          if (!managingUser) setBulkDeleteOpen(open);
        }}
      >
        <AlertDialogContent dir="rtl" className="text-right">
          <AlertDialogHeader className="text-right sm:text-right">
            <AlertDialogTitle>
              מחיקה לצמיתות של {selectedUserIds.length} משתמשים
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                הפעולה תמחק את החשבונות ואת כל המידע המקושר אליהם: פרופילים, מטלות,
                מועמדויות, שיחות, הודעות, קישורי משפחה וקבצים שהועלו.
              </span>
              <span className="block font-bold text-destructive">
                לא ניתן לשחזר את המידע לאחר המחיקה.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:space-x-0">
            <AlertDialogCancel disabled={managingUser}>ביטול</AlertDialogCancel>
            <AlertDialogAction
              disabled={managingUser || selectedUserIds.length === 0}
              onClick={(event) => {
                event.preventDefault();
                void deleteSelectedUsers();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {managingUser
                ? "מוחק..."
                : `כן, למחוק ${selectedUserIds.length} משתמשים`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: number;
  loading: boolean;
  icon: typeof Users;
  onClick: () => void;
}) {
  return (
    <Card className="overflow-hidden border-border/80 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        aria-label={`פתיחת פירוט ${label}`}
        className="group min-h-36 w-full cursor-pointer p-4 text-right outline-none transition-colors hover:bg-primary/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-wait"
      >
        <div className="mb-3 flex items-start justify-between">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary-ink">
            <Icon className="h-4 w-4" />
          </div>
          <ChevronLeft className="h-5 w-5 text-muted-foreground transition-transform group-hover:-translate-x-1" />
        </div>
        {loading ? (
          <Skeleton className="mb-2 h-8 w-16" />
        ) : (
          <div className="text-3xl font-black tabular-nums">{value.toLocaleString("he-IL")}</div>
        )}
        <div className="text-sm font-semibold text-muted-foreground">{label}</div>
      </button>
    </Card>
  );
}
