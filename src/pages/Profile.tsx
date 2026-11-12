import { useCallback, useEffect, useState } from "react";
import { taskStatusLabel } from "@/lib/taskStatus";
import { ReviewAppeal } from "@/components/reviews/ReviewAppeal";
import { ReviewTags } from "@/components/reviews/ReviewTags";
import ReviewReportsPanel from "@/components/reviews/ReviewReportsPanel";
import { ReviewResponseEditor, type ReviewResponse } from "@/components/reviews/ReviewResponseEditor";
import ReviewDialog from "@/components/reviews/ReviewDialog";
import PendingRatingsCard from "@/components/reviews/PendingRatingsCard";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AvatarPicker } from "@/components/profile/AvatarPicker";
import { supabase } from "@/integrations/supabase/client";
import { logUserActivity } from "@/lib/activityLog";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import {
  Edit3, Save, X, ClipboardList, TrendingUp, DollarSign,
  Eye, Users, CheckCircle, Clock, BarChart3, Mail, Star
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { displayName, formatCurrency, formatDate } from "@/lib/format";
import { GENDER_LABEL, GENDER_OPTIONS, type Gender } from "@shared/gender.ts";
import { geocodeAddress } from "@/lib/geocodeAddress";
import GoogleMapPicker from "@/components/tasks/GoogleMapPicker";
import { PasswordCard } from "@/components/profile/PasswordCard";
import { DeleteAccountCard } from "@/components/profile/DeleteAccountCard";
import { ParentShareLink } from "@/components/profile/ParentShareLink";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { loadBeeStats, loadPublishedTaskCounts, type BeeStats } from "@/lib/profileStats";
import { primaryRoleLabel } from "@/lib/roles";
import { inBatches } from "@/lib/people";
import { PARENT_CONTACT_ERRORS, mapDbError } from "@/lib/errors";
import { useRoles } from "@/hooks/useRoles";
import { functionErrorCode } from "@/lib/invokeFunction";

interface ReviewHistoryRow {
  id: string;
  task_id: string;
  task_name: string;
  rating: number;
  body: string | null;
  created_at: string;
  status: "pending" | "approved" | "rejected";
  published_at: string | null;
  rejection_reason: string | null;
  screening: string;
  tags: string[];
}

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
  }[];
}

const Profile = () => {
  const { user, profile, roles, loading: authLoading, refreshProfile } = useAuth();
  const { isTasker, isBee, isAdmin } = useRoles();
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

  const [taskerStats, setTaskerStats] = useState<TaskStats>({ total: 0, open: 0, inProgress: 0, completed: 0, cancelled: 0, totalApplicants: 0 });
  const [taskerStatsError, setTaskerStatsError] = useState(false);
  const [myTasks, setMyTasks] = useState<TaskWithApps[]>([]);

  const [beeStats, setBeeStats] = useState<BeeStats>({ applied: 0, accepted: 0, completed: 0, totalEarnings: 0, estimatedEarnings: false, missingHours: false });
  const [beeStatsError, setBeeStatsError] = useState(false);
  const [editingReview, setEditingReview] = useState<ReviewHistoryRow | null>(null);
  const [reviewHistory, setReviewHistory] = useState<ReviewHistoryRow[]>([]);
  const [receivedReviews, setReceivedReviews] = useState<Pick<ReviewHistoryRow, "id" | "rating" | "body" | "created_at" | "tags">[]>([]);
  const [receivedResponses, setReceivedResponses] = useState<ReviewResponse[]>([]);
  const [receivedSort, setReceivedSort] = useState("newest");
  const [receivedFilter, setReceivedFilter] = useState("all");
  const [receivedReviewsError, setReceivedReviewsError] = useState(false);
  const [parentContacts, setParentContacts] = useState<ParentContact[]>([]);
  const [parentRequests, setParentRequests] = useState<ParentRequest[]>([]);
  const [decidingRequest, setDecidingRequest] = useState<string | null>(null);
  const [newParentEmail, setNewParentEmail] = useState("");
  const [savingParentContact, setSavingParentContact] = useState(false);

  const [loadingData, setLoadingData] = useState(true);

  const loadParentRequests = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("parent_contact_requests")
      .select("id, email, requested_at")
      .eq("child_user_id", user.id)
      .order("requested_at", { ascending: true });
    if (error) {
      toast.error("לא הצלחנו לטעון את בקשות ההורים");
      return;
    }
    setParentRequests(data ?? []);
  }, [user]);

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
        const failure = error ? await functionErrorCode(error, "invoke_failed") : data?.error;
        if (failure && failure !== "already_added") {
          toast.error(mapDbError({ message: failure }, { limit_reached: PARENT_CONTACT_ERRORS.limit_reached }, "לא הצלחנו לאשר את הבקשה"));
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

  const loadParentContacts = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("parent_contacts")
      .select("id, email, created_at, view_token")
      .eq("child_user_id", user.id)
      .order("created_at", { ascending: true });
    if (error) {
      toast.error("לא הצלחנו לטעון את כתובות ההורים");
      return;
    }
    setParentContacts(data ?? []);
  }, [user]);

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

      const failure = error ? await functionErrorCode(error, "invoke_failed") : data?.error;
      if (failure) {
        toast.error(mapDbError({ message: failure }, PARENT_CONTACT_ERRORS, "לא הצלחנו לשמור את הכתובת. כדאי לנסות שוב."));
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

  const loadTaskerData = useCallback(async () => {
    if (!user) return;
    setTaskerStatsError(false);
    const { data: tasks, error } = await fetchAllPages((from, to) => supabase
      .from("tasks")
      .select("id, name, short_desc, status, views_count, payment, payment_type, category, created_at")
      .eq("creator_id", user.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to));
    if (error) {
      setTaskerStatsError(true);
      toast.error("לא הצלחנו לטעון את נתוני המטלות שפרסמתם");
      return;
    }

    const applications: (TaskWithApps["applications"][number] & { task_id: string })[] = [];
    for (const batch of inBatches(tasks.map((task) => task.id))) {
      const { data: rows, error: appsError } = await fetchAllPages((from, to) => supabase
        .from("task_applications")
        .select("id, status, applicant_id, task_id")
        .in("task_id", batch)
        .is("archived_at", null)
        .order("id")
        .range(from, to));
      if (appsError) {
        setTaskerStatsError(true);
        toast.error("לא הצלחנו לטעון את מספר המועמדויות");
        return;
      }
      applications.push(...rows);
    }

    setMyTasks(tasks.map((task) => ({
      ...task,
      applications: applications.filter((application) => application.task_id === task.id),
    })));
    try {
      setTaskerStats({ ...await loadPublishedTaskCounts(user.id), totalApplicants: applications.length });
    } catch {
      setTaskerStatsError(true);
      toast.error("לא הצלחנו לטעון את נתוני המטלות שפרסמתם");
    }
  }, [user]);

  const loadBeeData = useCallback(async () => {
    if (!user) return;
    setBeeStatsError(false);
    try {
      setBeeStats(await loadBeeStats(user.id));
    } catch {
      setBeeStatsError(true);
      toast.error("לא הצלחנו לטעון את נתוני הביצוע וההכנסות");
    }
  }, [user]);

  const loadReceivedReviews = useCallback(async () => {
    if (!user) return;
    const { data, error } = await fetchAllPages((from, to) => supabase.from("reviews")
      .select("id, rating, body, created_at, tags")
      .eq("reviewee_id", user.id).eq("status", "approved").not("published_at", "is", null)
      .order("created_at", { ascending: false }).order("id").range(from, to));
    if (error) { setReceivedReviewsError(true); setReceivedReviews([]); setReceivedResponses([]); return; }
    const reviewIds = data.map((review) => review.id);
    const responseResult = reviewIds.length ? await fetchAllPages((from, to) => supabase.from("review_responses")
      .select("review_id, body, status").in("review_id", reviewIds).order("id").range(from, to)) : { data: [], error: null };
    setReceivedReviewsError(Boolean(responseResult.error));
    setReceivedReviews(data);
    setReceivedResponses(responseResult.error ? [] : responseResult.data);
  }, [user]);

  const loadReviewHistory = useCallback(async () => {
    if (!user) return;
    const { data: reviews, error } = await supabase
      .from("reviews")
      .select("id, task_id, rating, body, created_at, status, published_at, rejection_reason, screening, tags")
      .eq("reviewer_id", user.id)
      .order("created_at", { ascending: false });
    if (error) { toast.error("לא הצלחנו לטעון את היסטוריית הדירוגים"); return; }
    const taskIds = [...new Set((reviews ?? []).map((review) => review.task_id))];
    const { data: tasks, error: tasksError } = taskIds.length
      ? await fetchAllPages((from, to) => supabase.from("tasks").select("id, name")
        .in("id", taskIds).is("archived_at", null).order("id").range(from, to))
      : { data: [], error: null };
    if (tasksError) { toast.error("לא הצלחנו לטעון את היסטוריית הדירוגים"); return; }
    const names = new Map((tasks ?? []).map((task) => [task.id, task.name]));
    const rows = (reviews ?? []).map((review) => ({
      ...review, task_name: names.get(review.task_id) ?? "מטלה שהושלמה",
    }));
    setReviewHistory(rows);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoadingData(true);
      await Promise.all([loadTaskerData(), loadBeeData(), loadReviewHistory(), loadReceivedReviews()]);
      if (isBee) await Promise.all([loadParentContacts(), loadParentRequests()]);
      setLoadingData(false);
    };
    void load();
  // isTasker is not read here: switching roles changes what these loaders must show, so it re-runs them.
  }, [user, isTasker, isBee, loadTaskerData, loadBeeData, loadReviewHistory, loadReceivedReviews, loadParentContacts, loadParentRequests]);

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

  const name = displayName(form, user.email || "משתמש");
  const roleLabel = primaryRoleLabel(roles);

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
        <PendingRatingsCard />
        <Card className="border-border overflow-hidden">
          {/* Identity sits at the top, on the banner — avatar, name and role in
              one row, so the gradient is a backdrop rather than dead space. */}
          <div className="gradient-honey px-5 py-5">
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-4">
              <AvatarPicker userId={user.id} currentAvatarUrl={avatarUrl} onAvatarChange={setAvatarUrl} />
              <div className="min-w-0 text-center sm:text-right">
                <h1 className="text-lg sm:text-2xl leading-tight font-extrabold text-foreground truncate max-w-[200px] sm:max-w-none sm:break-words sm:whitespace-normal">{name}</h1>
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

        {(isTasker || taskerStats.total > 0 || taskerStatsError) && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard icon={ClipboardList} label="סה״כ מטלות" value={loadingData ? "…" : taskerStatsError ? "-" : taskerStats.total} color="text-primary-ink" to="/my-tasks?tab=published" />
              <StatCard icon={Clock} label="פתוחות" value={loadingData ? "…" : taskerStatsError ? "-" : taskerStats.open} color="text-amber-500" to="/my-tasks?tab=published" />
              <StatCard icon={CheckCircle} label="הושלמו" value={loadingData ? "…" : taskerStatsError ? "-" : taskerStats.completed} color="text-green-600" to="/my-tasks?tab=published" />
              <StatCard icon={Users} label="נרשמים" value={loadingData ? "…" : taskerStatsError ? "-" : taskerStats.totalApplicants} color="text-blue-500" to="/my-tasks?tab=applications" />
            </div>

            {taskerStatsError && <p role="alert" className="text-sm text-destructive">נתוני המטלות לא נטענו. יש לרענן ולנסות שוב.</p>}
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
                        <Badge variant="outline" className="font-bold text-xs shrink-0">{taskStatusLabel(task.status)}</Badge>
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

        {(isBee || isTasker || beeStats.applied > 0 || beeStatsError) && (
          <>
            <Card className="border-border bg-card/80">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TrendingUp className="h-5 w-5 text-primary-ink" />
                  הביצועים שלי כמבצע/ת מטלות
                </CardTitle>
                <p className="text-sm text-muted-foreground">כאן תראו כמה מטלות השלמתם וכמה כסף הן הכניסו לכם.</p>
              </CardHeader>
            </Card>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard icon={ClipboardList} label="הגשות" value={loadingData ? "…" : beeStatsError ? "-" : beeStats.applied} color="text-primary-ink" to="/my-tasks?tab=performing" />
              <StatCard icon={CheckCircle} label="התקבלו" value={loadingData ? "…" : beeStatsError ? "-" : beeStats.accepted} color="text-green-600" to="/my-tasks?tab=performing" />
              <StatCard icon={TrendingUp} label="הושלמו" value={loadingData ? "…" : beeStatsError ? "-" : beeStats.completed} color="text-blue-500" to="/my-tasks?tab=performing" />
              <StatCard icon={DollarSign} label={beeStats.estimatedEarnings ? "הכנסות משוערות" : "הכנסות"} value={loadingData ? "…" : beeStatsError ? "-" : formatCurrency(beeStats.totalEarnings)} color="text-amber-500" />
            </div>

            {beeStatsError && <p role="alert" className="text-sm text-destructive">נתוני הביצוע וההכנסות לא נטענו. יש לרענן ולנסות שוב.</p>}
            {!beeStatsError && (beeStats.estimatedEarnings || beeStats.missingHours) && (
              <p className="text-xs text-muted-foreground">
                הסכום כולל רק משימות שהושלמו. תשלום שעתי מחושב לפי משך המשימה המשוער.
                {beeStats.missingHours && " משימות שעתיות ללא משך אינן כלולות בסכום."}
              </p>
            )}

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
<Link to="/my-tasks?tab=performing"><ClipboardList className="w-4 h-4" />
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

        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Star className="h-5 w-5 fill-yellow-400 text-yellow-500" aria-hidden="true" />
              דירוגים וביקורות שקיבלתי
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingData ? <p className="text-sm text-muted-foreground">טוענים ביקורות...</p> : receivedReviewsError ? (
              <p role="alert" className="text-sm text-destructive">לא הצלחנו לטעון את הביקורות. יש לרענן ולנסות שוב.</p>
            ) : receivedReviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">עדיין אין ביקורות שאושרו.</p>
            ) : (
              <>
              <div className="mb-4 space-y-1" aria-label="התפלגות הדירוגים שקיבלתי">
                {[5, 4, 3, 2, 1].map((stars) => {
                  const count = receivedReviews.filter((review) => review.rating === stars).length;
                  return <div key={stars} className="flex items-center gap-2 text-xs text-muted-foreground"><span className="w-3">{stars}</span><Star size={12} className="fill-yellow-400 text-yellow-500" aria-hidden="true" /><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-yellow-400" style={{ width: `${count / receivedReviews.length * 100}%` }} /></div><span className="w-5 text-end tabular-nums">{count}</span></div>;
                })}
              </div>
              <div className="mb-4 flex flex-wrap gap-3 text-sm">
                <label>מיון <select value={receivedSort} onChange={(event) => setReceivedSort(event.target.value)} className="rounded-lg border border-border bg-background px-2 py-1"><option value="newest">החדשות ביותר</option><option value="highest">הגבוהות ביותר</option><option value="lowest">הנמוכות ביותר</option></select></label>
                <label>סינון <select value={receivedFilter} onChange={(event) => setReceivedFilter(event.target.value)} className="rounded-lg border border-border bg-background px-2 py-1"><option value="all">כל הדירוגים</option>{[5, 4, 3, 2, 1].map((stars) => <option key={stars} value={stars}>{stars} כוכבים</option>)}</select></label>
              </div>
              <ul className="space-y-3">
                {[...receivedReviews].filter((review) => receivedFilter === "all" || review.rating === Number(receivedFilter)).sort((a, b) => receivedSort === "highest" ? b.rating - a.rating : receivedSort === "lowest" ? a.rating - b.rating : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((review) => (
                  <li key={review.id} className="rounded-2xl bg-muted/50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-amber-500" aria-label={`${review.rating} מתוך 5 כוכבים`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span>
                      <time className="text-xs text-muted-foreground" dateTime={review.created_at}>{formatDate(review.created_at)}</time>
                    </div>
                    {review.body && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">{review.body}</p>}
                    <ReviewTags tags={review.tags} />
                    <ReviewResponseEditor key={`${review.id}:${receivedResponses.find((response) => response.review_id === review.id)?.body ?? ""}`} reviewId={review.id} response={receivedResponses.find((response) => response.review_id === review.id)} onSaved={() => void loadReceivedReviews()} />
                  </li>
                ))}
              </ul>
              </>
            )}
          </CardContent>
        </Card>

        {reviewHistory.length > 0 && (
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Star className="h-5 w-5 fill-yellow-400 text-yellow-500" />
                הדירוגים שנתתי
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {reviewHistory.map((review) => (
                <div key={review.id} className="rounded-2xl bg-muted/50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold">{review.task_name}</span>
                    <span className="text-amber-500" aria-label={`${review.rating} מתוך 5 כוכבים`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span>
                  </div>
                  {review.body && <p className="mt-1 text-sm text-muted-foreground">{review.body}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{review.status === "pending" ? (review.screening === "pending_ai" ? "נבדקת אוטומטית" : "ממתינה לבדיקה של אדם") : review.status === "rejected" ? "לא אושר" : review.published_at ? "פורסם" : "אושר וממתין לפרסום הדדי"}</p>
                  {review.status === "rejected" && review.rejection_reason && <p className="mt-1 text-sm text-muted-foreground">סיבת ההחלטה: {review.rejection_reason}</p>}
                  {review.status === "rejected" && <ReviewAppeal reviewId={review.id} />}
                  {!review.published_at && <Button type="button" variant="outline" size="sm" className="mt-2 rounded-full" onClick={() => setEditingReview(review)}>עריכת הדירוג</Button>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        {editingReview && <ReviewDialog open onClose={() => setEditingReview(null)} onSubmitted={() => void loadReviewHistory()}
          taskId={editingReview.task_id} taskName={editingReview.task_name} revieweeId="" revieweeName=""
          initialReview={{ id: editingReview.id, rating: editingReview.rating, body: editingReview.body, tags: editingReview.tags }} />}
        <ReviewReportsPanel />
        <PasswordCard />
        {!isAdmin && <DeleteAccountCard />}
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
