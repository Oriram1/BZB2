import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { AvatarPicker } from "@/components/profile/AvatarPicker";
import { supabase } from "@/integrations/supabase/client";
import { logUserActivity } from "@/lib/activityLog";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import {
  User, Edit3, Save, X, ClipboardList, TrendingUp, DollarSign,
  Eye, Users, CheckCircle, Clock, BarChart3, Copy, KeyRound, RefreshCw, Mail, Trash2, AlertTriangle
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import type { LucideIcon } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { GENDER_LABEL, GENDER_OPTIONS, type Gender } from "@/lib/gender";
import { geocodeAddress } from "@/lib/geocodeAddress";
import GoogleMapPicker from "@/components/tasks/GoogleMapPicker";
import { ParentShareLink } from "@/components/profile/ParentShareLink";
import QRCode from "qrcode";

/** Someone who asked, from the public view page, to be added to the list. */
interface ParentRequest {
  id: string;
  email: string;
  requested_at: string;
}

/** A parent reachable by email, with no account behind it. */
interface ParentContact {
  id: string;
  email: string;
  created_at: string;
  view_token: string;
}

interface TaskStats {
  total: number;
  open: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  totalApplicants: number;
}

interface BeeStats {
  applied: number;
  accepted: number;
  completed: number;
  totalEarnings: number;
}

interface TaskWithApps {
  id: string;
  name: string;
  short_desc: string;
  status: string;
  views_count: number;
  payment: number;
  payment_type: string;
  category: string;
  created_at: string;
  applications: {
    id: string;
    status: string;
    applicant_id: string;
    profile?: { first_name: string; last_name: string; age: number | null; avatar_url: string | null; user_id: string };
  }[];
}

const Profile = () => {
  const { user, profile, roles, loading: authLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", age: "", address: "", phone: "", gender: "unspecified" as Gender });
  const [addressPosition, setAddressPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);

  const handleAddressBlur = async () => {
    if (!form.address.trim()) return;
    setAddressLoading(true);
    const result = await geocodeAddress(form.address);
    if (result) {
      setForm((current) => ({ ...current, address: result.formattedAddress }));
      setAddressPosition({ lat: result.lat, lng: result.lng });
    }
    setAddressLoading(false);
  };

  // Tasker state
  const [taskerStats, setTaskerStats] = useState<TaskStats>({ total: 0, open: 0, inProgress: 0, completed: 0, cancelled: 0, totalApplicants: 0 });
  const [myTasks, setMyTasks] = useState<TaskWithApps[]>([]);

  // Bee state
  const [beeStats, setBeeStats] = useState<BeeStats>({ applied: 0, accepted: 0, completed: 0, totalEarnings: 0 });
  const [familyCode, setFamilyCode] = useState<string | null>(null);
  const [familyCodeExpiresAt, setFamilyCodeExpiresAt] = useState<string | null>(null);
  const [familyQr, setFamilyQr] = useState<string | null>(null);
  const [creatingFamilyCode, setCreatingFamilyCode] = useState(false);
  const [parentEmail, setParentEmail] = useState("");
  const [parentContacts, setParentContacts] = useState<ParentContact[]>([]);
  const [parentRequests, setParentRequests] = useState<ParentRequest[]>([]);
  const [decidingRequest, setDecidingRequest] = useState<string | null>(null);
  const [newParentEmail, setNewParentEmail] = useState("");
  const [savingParentContact, setSavingParentContact] = useState(false);

  const [loadingData, setLoadingData] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const loadParentRequests = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("parent_contact_requests")
      .select("id, email, requested_at")
      .eq("child_user_id", user.id)
      .order("requested_at", { ascending: true });
    setParentRequests(data ?? []);
  };

  /**
   * Approving reuses add-parent-contact rather than inserting directly, so an
   * approved parent gets the same welcome email and share link as one the child
   * typed in themselves. The request row is cleared only after that succeeds —
   * a dropped request with no contact behind it is a silent loss.
   */
  const decideParentRequest = async (request: ParentRequest, approve: boolean) => {
    setDecidingRequest(request.id);
    try {
      if (approve) {
        const { data, error } = await supabase.functions.invoke<{ error?: string }>(
          "add-parent-contact",
          { body: { email: request.email } },
        );
        const failure = error ? "invoke_failed" : data?.error;
        if (failure && failure !== "already_added") {
          toast.error(
            failure === "limit_reached"
              ? "אפשר לקשר עד 3 כתובות"
              : "לא הצלחנו לאשר את הבקשה",
          );
          return;
        }
      }

      const { error: deleteError } = await supabase
        .from("parent_contact_requests")
        .delete()
        .eq("id", request.id);
      if (deleteError) {
        toast.error("לא הצלחנו לעדכן את הבקשה");
        return;
      }

      setParentRequests((current) => current.filter((row) => row.id !== request.id));
      if (approve) await loadParentContacts();
      toast.success(approve ? "הכתובת אושרה ונוספה 📧" : "הבקשה נדחתה");
    } finally {
      setDecidingRequest(null);
    }
  };

  const loadParentContacts = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("parent_contacts")
      .select("id, email, created_at, view_token")
      .eq("child_user_id", user.id)
      .order("created_at", { ascending: true });
    setParentContacts(data ?? []);
  };

  const addParentContact = async () => {
    const email = newParentEmail.trim().toLowerCase();
    if (!email) return;
    setSavingParentContact(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        ok?: boolean;
        emailed?: boolean;
        error?: string;
      }>("add-parent-contact", { body: { email } });

      const failure = error ? "invoke_failed" : data?.error;
      if (failure) {
        toast.error(
          failure === "already_added"
            ? "הכתובת הזו כבר מקושרת"
            : failure === "limit_reached"
            ? "אפשר לקשר עד 3 כתובות"
            : failure === "invalid_email"
            ? "כתובת המייל לא תקינה"
            : "לא הצלחנו לשמור את הכתובת. כדאי לנסות שוב.",
        );
        return;
      }

      setNewParentEmail("");
      await loadParentContacts();
      toast[data?.emailed ? "success" : "warning"](
        data?.emailed
          ? "הכתובת קושרה, ועדכון נשלח במייל 📧"
          : "הכתובת נשמרה, אבל שליחת המייל נכשלה. כדאי לבדוק את הכתובת.",
      );
    } finally {
      setSavingParentContact(false);
    }
  };

  const removeParentContact = async (id: string) => {
    const { error } = await supabase.from("parent_contacts").delete().eq("id", id);
    if (error) {
      toast.error("לא הצלחנו להסיר את הכתובת");
      return;
    }
    setParentContacts((current) => current.filter((contact) => contact.id !== id));
    toast.success("הכתובת הוסרה");
  };

  /** `parentEmail` mails the code as well, for a parent who isn't in the room. */
  const createFamilyCode = async (parentEmail?: string) => {
    setCreatingFamilyCode(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        code?: string;
        expiresAt?: string;
        emailed?: boolean;
        error?: string;
      }>("create-family-link-code", parentEmail ? { body: { parentEmail } } : undefined);

      if (error || !data?.code || !data.expiresAt) {
        toast.error("לא הצלחנו ליצור קוד. כדאי לנסות שוב.");
        return;
      }

      setFamilyCode(data.code);
      setFamilyCodeExpiresAt(data.expiresAt);

      if (parentEmail) {
        setParentEmail("");
        toast[data.emailed ? "success" : "warning"](
          data.emailed
            ? "הקישור נשלח למייל של ההורה 📧"
            : "נוצר קישור, אבל שליחת המייל נכשלה. אפשר לסרוק את קוד ה־QR",
        );
      } else {
        toast.success("נוצר קוד QR חדש להורה");
      }
    } finally {
      setCreatingFamilyCode(false);
    }
  };

  /** The parent scans or opens this — no digits to read aloud or mistype. */
  const familyLinkUrl = familyCode
    ? `${window.location.origin}/parent?code=${familyCode}`
    : null;

  useEffect(() => {
    if (!familyLinkUrl) {
      setFamilyQr(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(familyLinkUrl, { width: 320, margin: 1 }).then((url) => {
      if (!cancelled) setFamilyQr(url);
    });
    return () => {
      cancelled = true;
    };
  }, [familyLinkUrl]);

  const copyFamilyLink = async () => {
    if (!familyLinkUrl) return;
    try {
      await navigator.clipboard.writeText(familyLinkUrl);
      toast.success("הקישור הועתק");
    } catch {
      toast.error("לא הצלחנו להעתיק את הקישור");
    }
  };

  const isTasker = roles.includes("tasker");
  const isBee = roles.includes("bee");

  useEffect(() => {
    if (profile) {
      setForm({
        first_name: profile.first_name || "",
        last_name: profile.last_name || "",
        age: profile.age?.toString() || "",
        address: profile.address || "",
        phone: profile.phone || "",
        gender: profile.gender ?? "unspecified",
      });
      setAvatarUrl(profile.avatar_url);
    }
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoadingData(true);
      if (isTasker) await loadTaskerData();
      if (isBee) await Promise.all([loadBeeData(), loadParentContacts(), loadParentRequests()]);
      setLoadingData(false);
    };
    load();
  // Loaders are local workflow functions; rerun only when auth or role state changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isTasker, isBee]);

  const loadTaskerData = async () => {
    if (!user) return;
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, name, short_desc, status, views_count, payment, payment_type, category, created_at")
      .eq("creator_id", user.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    if (!tasks) return;

    const enriched: TaskWithApps[] = [];
    let totalApplicants = 0;

    for (const task of tasks) {
      const { data: apps } = await supabase
        .from("task_applications")
        .select("id, status, applicant_id")
        .eq("task_id", task.id)
        .is("archived_at", null);

      const enrichedApps = [];
      for (const app of apps || []) {
        const { data: p } = await supabase
          .from("profiles")
          .select("first_name, last_name, age, avatar_url, user_id")
          .eq("user_id", app.applicant_id)
          .single();
        enrichedApps.push({ ...app, profile: p || undefined });
      }
      totalApplicants += (apps || []).length;
      enriched.push({ ...task, applications: enrichedApps });
    }

    setMyTasks(enriched);
    setTaskerStats({
      total: tasks.length,
      open: tasks.filter(t => t.status === "open").length,
      inProgress: tasks.filter(t => t.status === "in_progress").length,
      completed: tasks.filter(t => t.status === "completed").length,
      cancelled: tasks.filter(t => t.status === "cancelled").length,
      totalApplicants,
    });
  };

  const loadBeeData = async () => {
    if (!user) return;
    const { data: apps } = await supabase
      .from("task_applications")
      .select("id, status, task_id")
      .eq("applicant_id", user.id)
      .is("archived_at", null);

    if (!apps) return;

    const acceptedTaskIds = apps.filter(a => a.status === "accepted").map(a => a.task_id);
    let completed = 0;
    let totalEarnings = 0;

    if (acceptedTaskIds.length > 0) {
      const { data: acceptedTasks } = await supabase
        .from("tasks")
        .select("payment, status")
        .in("id", acceptedTaskIds)
        .is("archived_at", null);

      // Being accepted is not being paid: only a task the publisher closed
      // through complete_task counts towards either number.
      const completedTasks = (acceptedTasks || []).filter(t => t.status === "completed");
      completed = completedTasks.length;
      totalEarnings = completedTasks.reduce((sum, t) => sum + Number(t.payment), 0);
    }

    setBeeStats({
      applied: apps.length,
      accepted: apps.filter(a => a.status === "accepted").length,
      completed,
      totalEarnings,
    });
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: form.first_name,
        last_name: form.last_name,
        age: form.age ? parseInt(form.age) : null,
        address: form.address || null,
        phone: form.phone || null,
        gender: form.gender,
      })
      .eq("user_id", user.id);

    if (error) {
      toast.error("שגיאה בשמירת הפרופיל");
    } else {
      logUserActivity(user.id, "profile_updated", { entityType: "profile", entityId: user.id });
      await refreshProfile();
      toast.success("הפרופיל עודכן בהצלחה!");
      setEditing(false);
    }
    setSaving(false);
  };

  const handleDeleteAccount = async () => {
    if (!user || deleteConfirmText !== "מחק את החשבון") return;
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke("admin-manage-users", {
        body: { action: "delete_self" },
      });
      if (error) {
        toast.error("לא הצלחנו למחוק את החשבון. נסו שוב או פנו אלינו ב-privacy@bzb.co.il");
        setDeleting(false);
        return;
      }
      await supabase.auth.signOut();
      toast.success("החשבון נמחק. נתראה 👋");
      navigate("/", { replace: true });
    } catch {
      toast.error("שגיאה במחיקת החשבון");
      setDeleting(false);
    }
  };

  if (authLoading) {
    return <div className="min-h-screen bg-muted flex items-center justify-center"><p className="text-muted-foreground">טוען...</p></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <p className="text-xl font-bold text-foreground mb-4">יש להתחבר כדי לצפות בפרופיל</p>
          <Button className="gradient-honey text-primary-foreground rounded-full font-bold" asChild>
<Link to="/auth">כניסה 🐝</Link>
</Button>
        </div>
      </div>
    );
  }

  const defaultAvatar = `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${user.id}`;
  const displayAvatar = avatarUrl || defaultAvatar;
  const displayName = `${form.first_name} ${form.last_name}`.trim() || user.email || "משתמש";
  const roleLabel = isTasker ? "מציע מטלות" : isBee ? "מבצע מטלות 🐝" : roles.includes("parent") ? "הורה" : "";
  const statusLabel = (s: string) => s === "open" ? "הרחבה" : s === "accepted" ? "התקבלה" : s === "in_progress" ? "בביצוע" : s === "completed" ? "הושלמה" : "בוטלה";

  return (
    <div className="min-h-screen bg-muted relative" dir="rtl">
      <div className="absolute top-40 right-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />

      <PageHeader
        action={
          <Button size="sm" className="bg-card text-foreground font-bold rounded-full hover:scale-105 transition-transform duration-300" asChild>
<Link to="/tasks">מטלות זמינות</Link>
</Button>
        }
      />

      <div className="max-w-3xl mx-auto py-8 px-4 relative z-10 space-y-6">
        {/* Profile Card */}
        <Card className="border-border overflow-hidden">
          {/* Identity sits at the top, on the banner — avatar, name and role in
              one row, so the gradient is a backdrop rather than dead space. */}
          <div className="gradient-honey px-5 py-5">
            {/* Mobile: vertical stack. Desktop: horizontal row. */}
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-4">
              <AvatarPicker userId={user.id} currentAvatarUrl={avatarUrl} onAvatarChange={setAvatarUrl} />
              <div className="min-w-0 text-center sm:text-right">
                <h1 className="text-lg sm:text-2xl leading-tight font-extrabold text-foreground truncate max-w-[200px] sm:max-w-none sm:break-words sm:whitespace-normal">{displayName}</h1>
                {roleLabel && (
                  <Badge className="bg-card text-foreground border-none font-bold mt-1.5 shadow-sm">{roleLabel}</Badge>
                )}
              </div>
              <div className="sm:mr-auto shrink-0">
                {!editing ? (
                  <Button size="sm" onClick={() => setEditing(true)} className="bg-card text-foreground hover:bg-card/90 rounded-full font-bold shadow-sm px-3">
                    <Edit3 className="w-4 h-4 ml-1" /> עריכה
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSave} disabled={saving} className="bg-card text-foreground hover:bg-card/90 rounded-full font-bold shadow-sm">
                      <Save className="w-4 h-4 ml-1" /> {saving ? "שומר..." : "שמור"}
                    </Button>
                    <Button size="sm" onClick={() => setEditing(false)} className="bg-card text-foreground hover:bg-card/90 rounded-full shadow-sm">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <CardContent className="pt-5 pb-6">

            {editing ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="profile-first-name" className="text-xs text-muted-foreground">שם פרטי</Label>
                  <Input id="profile-first-name" autoComplete="given-name" value={form.first_name} onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="profile-last-name" className="text-xs text-muted-foreground">שם משפחה</Label>
                  <Input id="profile-last-name" autoComplete="family-name" value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="profile-age" className="text-xs text-muted-foreground">גיל</Label>
                  <Input id="profile-age" type="text" inputMode="numeric" dir="ltr" value={form.age} onChange={e => setForm(p => ({ ...p, age: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <Label id="profile-gender-label" className="text-xs text-muted-foreground">מין</Label>
                  {/* Drives how every email and notification addresses this
                      person. "מעדיפ/ה לא לציין" reads in the plural. */}
                  <div role="radiogroup" aria-labelledby="profile-gender-label" className="mt-1 grid grid-cols-3 gap-2">
                    {GENDER_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={form.gender === option}
                        onClick={() => setForm(p => ({ ...p, gender: option }))}
                        className={`h-10 rounded-xl border-2 px-2 text-sm font-bold transition-colors ${
                          form.gender === option
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-background text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {GENDER_LABEL[option]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label htmlFor="profile-phone" className="text-xs text-muted-foreground">טלפון</Label>
                  <Input id="profile-phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} dir="ltr" />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="profile-address" className="text-xs text-muted-foreground">כתובת</Label>
                  <Input id="profile-address" autoComplete="street-address" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} onBlur={handleAddressBlur} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void handleAddressBlur(); } }} />
                  {addressLoading && <p className="mt-1 text-xs text-muted-foreground">מאתר את הכתובת...</p>}
                  <div className="mt-3">
                    <GoogleMapPicker
                      lat={addressPosition?.lat ?? null}
                      lng={addressPosition?.lng ?? null}
                      onLocationSelect={(lat, lng) => setAddressPosition({ lat, lng })}
                      onAddressFound={(address) => setForm((current) => ({ ...current, address }))}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 text-sm">
                {form.age && <div><span className="text-muted-foreground">גיל:</span> <span className="font-semibold">{form.age}</span></div>}
                {form.phone && <div><span className="text-muted-foreground">טלפון:</span> <span className="font-semibold" dir="ltr">{form.phone}</span></div>}
                {form.address && <div className="col-span-2"><span className="text-muted-foreground">כתובת:</span> <span className="font-semibold">{form.address}</span></div>}
                <div className="col-span-2"><span className="text-muted-foreground">אימייל:</span> <span className="font-semibold" dir="ltr">{user.email}</span></div>
              </div>
            )}
          </CardContent>
        </Card>

        {isBee && (
          <Card className="overflow-hidden border-border">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Mail className="h-5 w-5 text-primary-ink" />
                עדכונים להורה
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                מוסיפים את המייל של ההורה, והוא/היא יקבלו עדכון כשאתם מתחברים. ההורה לא צריך/ה
                להירשם או לפתוח חשבון. אפשר עד 3 כתובות, ולהסיר בכל רגע.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Someone holding your share link asked to be added. Nothing was
                  sent to them and nothing will be until you say so. */}
              {parentRequests.length > 0 && (
                <ul className="space-y-2">
                  {parentRequests.map((request) => (
                    <li
                      key={request.id}
                      className="rounded-xl border-2 border-primary/40 bg-primary/5 px-3 py-2 space-y-2"
                    >
                      <div>
                        <p className="text-sm font-bold text-foreground">בקשה לקבל עדכונים</p>
                        <p dir="ltr" className="truncate text-sm text-muted-foreground">
                          {request.email}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={decidingRequest === request.id}
                          onClick={() => void decideParentRequest(request, true)}
                          className="rounded-full font-bold"
                        >
                          אישור
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={decidingRequest === request.id}
                          onClick={() => void decideParentRequest(request, false)}
                          className="rounded-full font-bold text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          דחייה
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {parentContacts.length > 0 && (
                <ul className="space-y-2">
                  {parentContacts.map((contact) => (
                    <li
                      key={contact.id}
                      className="rounded-xl border border-border bg-muted/50 px-3 py-2 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span dir="ltr" className="truncate text-sm font-semibold">{contact.email}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void removeParentContact(contact.id)}
                          className="shrink-0 rounded-full font-bold text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                          הסרה
                        </Button>
                      </div>
                      <ParentShareLink viewToken={contact.view_token} />
                    </li>
                  ))}
                </ul>
              )}

              {parentContacts.length < 3 ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="new-parent-email"
                    type="email"
                    dir="ltr"
                    value={newParentEmail}
                    onChange={(e) => setNewParentEmail(e.target.value)}
                    placeholder="parent@example.com"
                    className="h-11 rounded-xl"
                  />
                  <Button
                    type="button"
                    disabled={savingParentContact || !newParentEmail.trim()}
                    onClick={() => void addParentContact()}
                    className="min-h-11 shrink-0 rounded-xl font-bold"
                  >
                    <Mail className="h-4 w-4" />
                    {savingParentContact ? "שומר..." : "הוספת הורה"}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  הגעתם למקסימום של 3 כתובות. כדי להוסיף אחרת, צריך להסיר אחת קודם.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {isBee && (
          <Card className="overflow-hidden border-border">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <KeyRound className="h-5 w-5 text-primary-ink" />
                קישור להורה עם חשבון
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                לא חובה. זה מיועד להורה שרוצה חשבון ומרכז הורים מלא — לעדכונים בלבד מספיק
                להוסיף מייל למעלה. ההורה סורק את הקוד מהמסך, או מקבל קישור למייל. אין מה
                להקליד. הקישור תקף ל־10 דקות ולשימוש אחד.
              </p>
            </CardHeader>
            <CardContent>
              {familyCode ? (
                <div className="rounded-2xl border bg-primary/5 p-5 text-center">
                  <p className="mb-3 text-sm font-semibold text-muted-foreground">
                    ההורה סורק את הקוד עם המצלמה
                  </p>
                  {familyQr && (
                    <img
                      src={familyQr}
                      alt="קוד QR לקישור ההורה"
                      className="mx-auto h-44 w-44 rounded-xl bg-white p-2"
                    />
                  )}
                  <p className="mt-3 text-xs text-muted-foreground">
                    בתוקף עד{" "}
                    {familyCodeExpiresAt
                      ? new Intl.DateTimeFormat("he-IL", {
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(familyCodeExpiresAt))
                      : ""}
                  </p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <Button type="button" onClick={() => void copyFamilyLink()} className="min-h-11 rounded-xl font-bold">
                      <Copy className="h-4 w-4" />
                      העתקת הקישור
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void createFamilyCode()}
                      disabled={creatingFamilyCode}
                      className="min-h-11 rounded-xl font-bold"
                    >
                      <RefreshCw className={`h-4 w-4 ${creatingFamilyCode ? "animate-spin" : ""}`} />
                      יצירת קוד מחדש
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  onClick={() => void createFamilyCode()}
                  disabled={creatingFamilyCode}
                  className="min-h-11 w-full rounded-xl font-bold"
                >
                  <KeyRound className="h-4 w-4" />
                  {creatingFamilyCode ? "יוצר..." : "יצירת קוד QR להורה"}
                </Button>
              )}

              {/* For when the parent isn't standing next to the phone. */}
              <div className="mt-4 border-t border-border pt-4">
                <Label htmlFor="parent-email" className="text-sm font-semibold">
                  או שלחו קישור למייל של ההורה
                </Label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="parent-email"
                    type="email"
                    dir="ltr"
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                    placeholder="parent@example.com"
                    className="h-11 rounded-xl"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={creatingFamilyCode || !parentEmail.trim()}
                    onClick={() => void createFamilyCode(parentEmail.trim())}
                    className="min-h-11 rounded-xl font-bold shrink-0"
                  >
                    <Mail className="h-4 w-4" />
                    שליחה במייל
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        {isTasker && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard icon={ClipboardList} label="סה״כ מטלות" value={taskerStats.total} color="text-primary-ink" to="/my-tasks?tab=published" />
              <StatCard icon={Clock} label="פתוחות" value={taskerStats.open} color="text-amber-500" to="/my-tasks?tab=published" />
              <StatCard icon={CheckCircle} label="הושלמו" value={taskerStats.completed} color="text-green-600" to="/my-tasks?tab=published" />
              <StatCard icon={Users} label="נרשמים" value={taskerStats.totalApplicants} color="text-blue-500" to="/my-tasks?tab=applications" />
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-primary-ink" />
                  המטלות שלי
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {loadingData ? (
                  <p className="text-center text-muted-foreground py-4">טוען...</p>
                ) : myTasks.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-muted-foreground mb-3">עדיין לא פרסמת מטלות</p>
                    <Button className="gradient-honey text-primary-foreground rounded-full font-bold" asChild>
<Link to="/create-task">פרסם מטלה 🐝</Link>
</Button>
                  </div>
                ) : (
                  myTasks.map((task) => (
                    <div key={task.id} className="bg-muted/50 rounded-2xl p-4 border border-border">
                      <div className="flex items-start justify-between mb-2 gap-3">
                        <div className="min-w-0">
                          {/* The title is the obvious thing to click, so it is
                              the link — the button below is for anyone who
                              does not think to try. */}
                          <Link to={`/task/${task.id}`} className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <h3 className="font-bold text-foreground hover:text-primary-ink hover:underline underline-offset-4 transition-colors">
                              {task.name}
                            </h3>
                          </Link>
                          <p className="text-sm text-muted-foreground">{task.short_desc}</p>
                        </div>
                        <Badge variant="outline" className="font-bold text-xs shrink-0">{statusLabel(task.status)}</Badge>
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground mb-2">
                        <span>👁️ {task.views_count} צפיות</span>
                        <span className="tabular">{formatCurrency(task.payment)} {task.payment_type === "hour" ? "/שעה" : "/מטלה"}</span>
                        <span>📝 {task.applications.length} נרשמים</span>
                      </div>

                      <div className="border-t border-border pt-3 mt-2">
                        <Button size="sm" variant="outline" className="w-full rounded-full font-bold" asChild>
<Link to={`/task/${task.id}`}><Eye className="w-4 h-4" />
                            לפרטי המטלה</Link>
</Button>
                      </div>

                      {task.applications.filter(a => a.status === "pending").length > 0 && (
                        <div className="pt-3 mt-1 space-y-2">
                          <p className="text-xs font-bold text-foreground">
                            {task.applications.filter(a => a.status === "pending").length} מועמדויות ממתינות
                          </p>
                          <Button size="sm" className="w-full rounded-full gradient-honey text-primary-foreground font-bold" asChild>
<Link to={`/my-tasks?tab=applications&task=${task.id}`}>לניהול המועמדויות</Link>
</Button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        )}

        {isBee && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard icon={ClipboardList} label="הגשות" value={beeStats.applied} color="text-primary-ink" to="/my-tasks?tab=applications" />
              <StatCard icon={CheckCircle} label="התקבלו" value={beeStats.accepted} color="text-green-600" to="/my-tasks?tab=performing" />
              <StatCard icon={TrendingUp} label="הושלמו" value={beeStats.completed} color="text-blue-500" to="/my-tasks?tab=performing" />
              <StatCard icon={DollarSign} label="הכנסות" value={formatCurrency(beeStats.totalEarnings)} color="text-amber-500" />
            </div>

            {/* The stats above answer "how am I doing". This answers "take me there". */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-primary-ink" />
                  המטלות שלי
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-3">
                <Button variant="outline" className="w-full min-h-11 rounded-xl font-bold" asChild>
<Link to="/my-tasks?tab=applications"><ClipboardList className="w-4 h-4" />
                    המועמדויות שלי</Link>
</Button>
                <Button variant="outline" className="w-full min-h-11 rounded-xl font-bold" asChild>
<Link to="/my-tasks?tab=performing"><CheckCircle className="w-4 h-4" />
                    מטלות שאני מבצע</Link>
</Button>
                <Button className="w-full min-h-11 rounded-xl font-bold gradient-honey text-primary-foreground border-none" asChild>
<Link to="/tasks"><Eye className="w-4 h-4" />
                    חיפוש מטלות</Link>
</Button>
              </CardContent>
            </Card>
          </>
        )}
        {/* Account deletion — privacy right (hidden for admins) */}
        {!roles.includes("admin") && <><Card className="border-destructive/30">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-foreground">מחיקת חשבון</p>
                <p className="text-xs text-muted-foreground">מחיקה לצמיתות של כל המידע שלך מהמערכת</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                className="rounded-xl font-bold text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive shrink-0"
              >
                <Trash2 className="w-4 h-4" />
                מחיקה
              </Button>
            </div>
          </CardContent>
        </Card>

        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent className="max-w-md rounded-3xl" dir="rtl">
            <DialogHeader>
              <div className="mx-auto mb-2 w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-destructive" />
              </div>
              <DialogTitle className="text-center text-xl font-extrabold">מחיקת חשבון</DialogTitle>
              <DialogDescription className="text-center text-sm text-muted-foreground pt-2">
                הפעולה הזו <strong className="text-foreground">בלתי הפיכה</strong>. כל המידע שלך — פרופיל, מטלות, מועמדויות, שיחות והיסטוריה — יימחק לצמיתות ולא ניתן יהיה לשחזר אותו.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-2">
              <Label htmlFor="delete-confirm" className="text-sm font-semibold">הקלידו &laquo;מחק את החשבון&raquo; לאישור:</Label>
              <Input
                id="delete-confirm"
                dir="rtl"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="מחק את החשבון"
                className="mt-2 rounded-xl"
              />
            </div>
            <DialogFooter className="flex flex-col sm:flex-col gap-2 mt-4">
              <Button
                variant="destructive"
                disabled={deleteConfirmText !== "מחק את החשבון" || deleting}
                onClick={() => void handleDeleteAccount()}
                className="w-full rounded-xl font-bold"
              >
                {deleting ? "מוחק..." : "מחיקה לצמיתות"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => { setShowDeleteDialog(false); setDeleteConfirmText(""); }}
                className="w-full rounded-xl font-bold"
              >
                ביטול
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog></>}
      </div>
    </div>
  );
};

function StatCard({ icon: Icon, label, value, color, to }: { icon: LucideIcon; label: string; value: string | number; color: string; to?: string }) {
  const card = (
    <Card className={`border-border h-full ${to ? "transition-transform hover:scale-[1.03] hover:border-primary/40" : ""}`}>
      <CardContent className="p-4 flex flex-col items-center text-center gap-1">
        <Icon className={`w-6 h-6 ${color}`} />
        <span className="text-2xl font-extrabold text-foreground">{value}</span>
        <span className="text-xs text-muted-foreground font-semibold">{label}</span>
      </CardContent>
    </Card>
  );

  // A number the person cannot act on is a dead end; where the figure has a
  // page behind it, the card is the way in.
  return to ? (
    <Link to={to} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {card}
    </Link>
  ) : (
    card
  );
}

export default Profile;
