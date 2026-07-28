import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowRight, Link as LinkIcon, Shield, Trash2, UserRoundSearch } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { formatDate, formatTime } from "@/lib/format";

interface AuditRow {
  id: string;
  admin_user_id: string;
  action: string;
  target_user_id: string | null;
  target_identifier: string | null;
  success: boolean;
  details: any;
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
    const { data } = await supabase
      .from("admin_audit_log" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setAudit((data as any) ?? []);
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

  useEffect(() => {
    if (isAdmin) {
      void loadAudit();
      void loadLinks();
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

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || newPassword.length < 6) {
      toast.error("מלא אימייל/שם וסיסמה (לפחות 6 תווים)");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset-password", {
        body: { identifier: identifier.trim(), newPassword },
      });
      if (error || (data as any)?.error) {
        toast.error((data as any)?.error ?? error?.message ?? "שגיאה");
      } else {
        toast.success("הסיסמה אופסה בהצלחה");
        setIdentifier("");
        setNewPassword("");
        loadAudit();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();

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

      await supabase.from("admin_audit_log" as any).insert({
        admin_user_id: user?.id,
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
    } finally {
      setLinkSubmitting(false);
    }
  };

  const handleDeleteLink = async (link: ParentLinkRow) => {
    setRemovingLinkId(link.id);

    try {
      const { error } = await supabase.from("parent_links").delete().eq("id", link.id);

      if (error) {
        toast.error("מחיקת הקישור נכשלה");
        return;
      }

      await supabase.from("admin_audit_log" as any).insert({
        admin_user_id: user?.id,
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
    } finally {
      setRemovingLinkId(null);
    }
  };

  if (loading || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-background pb-20" dir="rtl">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <Shield className="h-5 w-5 text-yellow-500" />
          <h1 className="text-lg font-bold">פאנל אדמין</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <Card className="p-5 space-y-4">
          <div>
            <h2 className="font-bold text-lg">איפוס סיסמה למשתמש</h2>
            <p className="text-sm text-muted-foreground">חפש לפי אימייל או שם פרטי/משפחה</p>
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
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "מאפס..." : "אפס סיסמה"}
            </Button>
          </form>
        </Card>

        <Card className="p-5 space-y-4">
          <div>
            <h2 className="font-bold text-lg">קישור הורה־ילד</h2>
            <p className="text-sm text-muted-foreground">יוצרים ומסירים קישורים אמיתיים לאזור ההורים מתוך המערכת.</p>
          </div>

          <form onSubmit={handleCreateLink} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
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

            <Button type="submit" disabled={linkSubmitting} className="w-full">
              <LinkIcon className="h-4 w-4" />
              {linkSubmitting ? "יוצר קישור..." : "צור קישור הורה־ילד"}
            </Button>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="font-bold text-lg mb-3">קישורים קיימים</h2>
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

        <Card className="p-5">
          <h2 className="font-bold text-lg mb-3">יומן פעולות אחרון</h2>
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
                    <span className="font-medium">{row.action}</span>
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
                  {row.details && (
                    /* JSON is code: keep it LTR and left-aligned inside the RTL page. */
                    <pre dir="ltr" className="text-xs bg-muted rounded p-2 overflow-x-auto text-left">
                      {JSON.stringify(row.details, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </main>
    </div>
  );
}
