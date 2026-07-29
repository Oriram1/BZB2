import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowRight,
  ChevronLeft,
  ClipboardList,
  Link as LinkIcon,
  Loader2,
  Shield,
  Trash2,
  UserRoundSearch,
  Users,
} from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { formatDate, formatTime } from "@/lib/format";
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
    }
  }, [isAdmin]);

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

  const openDrilldown = async (kind: DrilldownKind) => {
    setActiveDrilldown(kind);
    setDrilldownItems([]);
    setDrilldownError(false);
    setDrilldownLoading(true);

    try {
      if (kind === "users") {
        const { data, error } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name, age, created_at")
          .order("created_at", { ascending: false });

        if (error) throw error;

        setDrilldownItems(
          (data ?? []).map((profile) => ({
            id: profile.user_id,
            title: fullName(profile) || "משתמש ללא שם",
            meta: profile.age ? `גיל ${profile.age}` : "גיל לא צוין",
            detail: `הצטרפות: ${formatDate(profile.created_at)}`,
            href: `/profile/${profile.user_id}`,
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

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || newPassword.length < 6) {
      toast.error("מלא אימייל/שם וסיסמה (לפחות 6 תווים)");
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
                      <li key={item.id}>
                        <button
                          type="button"
                          className="group w-full rounded-xl border bg-card p-4 text-right outline-none transition-all hover:border-primary/40 hover:bg-primary/[0.03] focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => {
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
                            </div>
                            <ChevronLeft className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-1" />
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
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
