import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Bell, CheckCircle2, KeyRound, MapPin, Shield, User } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { formatDate, formatDateTime } from "@/lib/format";
import { toast } from "sonner";

type ChildSummary = {
  userId: string;
  name: string;
  age: number | null;
  activeTask: {
    name: string;
    status: string;
    location: string | null;
    scheduledDate: string | null;
    scheduledTime: string | null;
    taskerName: string;
  } | null;
  notifications: {
    id: string;
    type: "accepted" | "rejected" | "completed" | "pending";
    message: string;
    time: string;
    read: boolean;
  }[];
};

const statusLabel = (status: string) => {
  if (status === "accepted") return "התקבל";
  if (status === "in_progress") return "בביצוע";
  if (status === "completed") return "הושלם";
  if (status === "rejected") return "נדחה";
  return "ממתין";
};

const ParentalHub = () => {
  const { user } = useAuth();
  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [familyCode, setFamilyCode] = useState("");
  const [redeemingCode, setRedeemingCode] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      setLoading(true);

      const { data: links } = await supabase
        .from("parent_links")
        .select("child_user_id")
        .eq("parent_user_id", user.id);

      if (!links || links.length === 0) {
        setChildren([]);
        setLoading(false);
        return;
      }

      const childIds = links.map((link) => link.child_user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, age")
        .in("user_id", childIds);

      const nextChildren: ChildSummary[] = [];

      for (const childId of childIds) {
        const profile = profiles?.find((item) => item.user_id === childId);
        const { data: apps } = await fetchAllPages((from, to) => supabase
          .from("task_applications")
          .select("id, status, created_at, task_id")
          .eq("applicant_id", childId)
          .is("archived_at", null)
          .order("created_at", { ascending: false })
          .range(from, to));

        let activeTask: ChildSummary["activeTask"] = null;
        const notifications: ChildSummary["notifications"] = [];

        for (const app of apps || []) {
          const { data: task } = await supabase
            .from("tasks")
            .select("id, name, status, scheduled_date, scheduled_time, location, creator_id")
            .eq("id", app.task_id)
            .is("archived_at", null)
            .maybeSingle();

          if (!task) continue;

          // Through the RPC, not the table: a parent is related to their child,
          // not to whoever published the task, so RLS hides that profile from
          // the direct read and the name came back empty every time.
          const { data: taskerRows } = await supabase.rpc("get_public_profile", {
            _user_id: task.creator_id,
          });
          const taskerProfile = Array.isArray(taskerRows) ? taskerRows[0] : taskerRows;

          const taskerName =
            `${taskerProfile?.first_name ?? ""} ${taskerProfile?.last_name ?? ""}`.trim() ||
            "מציע מטלה";

          if (!activeTask && (app.status === "accepted" || task.status === "in_progress")) {
            activeTask = {
              name: task.name,
              status: task.status,
              location: task.location,
              scheduledDate: task.scheduled_date,
              scheduledTime: task.scheduled_time,
              taskerName,
            };
          }

          notifications.push({
            id: app.id,
            type:
              app.status === "accepted"
                ? "accepted"
                : app.status === "rejected"
                ? "rejected"
                : task.status === "completed"
                ? "completed"
                : "pending",
            message:
              app.status === "accepted"
                ? `${profile?.first_name || "הילד"} התקבל למטלה "${task.name}"`
                : app.status === "rejected"
                ? `${profile?.first_name || "הילד"} לא התקבל למטלה "${task.name}"`
                : task.status === "completed"
                ? `${profile?.first_name || "הילד"} סיים את המטלה "${task.name}"`
                : `${profile?.first_name || "הילד"} הגיש מועמדות למטלה "${task.name}"`,
            time: formatDate(app.created_at),
            read: app.status !== "accepted",
          });
        }

        nextChildren.push({
          userId: childId,
          name: profile ? `${profile.first_name} ${profile.last_name}`.trim() : "ילד מקושר",
          age: profile?.age ?? null,
          activeTask,
          notifications,
        });
      }

      setChildren(nextChildren);
      setLoading(false);
    };

    void load();
  }, [user, refreshKey]);

  const redeemFamilyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    const code = familyCode.replace(/\D/g, "");
    if (!/^\d{6}$/.test(code)) {
      toast.error("צריך להזין קוד בן 6 ספרות");
      return;
    }

    setRedeemingCode(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        ok?: boolean;
        childName?: string;
        error?: string;
      }>("redeem-family-link-code", { body: { code } });

      if (error || !data?.ok) {
        const message =
          data?.error === "too_many_attempts"
            ? "היו יותר מדי ניסיונות. אפשר לנסות שוב בעוד 10 דקות."
            : "הקוד שגוי או שפג תוקפו";
        toast.error(message);
        return;
      }

      toast.success(`${data.childName || "הילד"} נוסף לאזור ההורים`);
      setFamilyCode("");
      setRefreshKey((value) => value + 1);
    } finally {
      setRedeemingCode(false);
    }
  };

  const unreadCount = useMemo(
    () => children.reduce((sum, child) => sum + child.notifications.filter((item) => !item.read).length, 0),
    [children],
  );

  return (
    <div className="min-h-screen bg-muted relative" dir="rtl">
      <div className="absolute top-40 left-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />

      <PageHeader title="לוח הורים" icon={<Shield size={16} />} />

      <div className="max-w-5xl mx-auto py-8 px-4 relative z-10 space-y-6">
        <Card className="p-6 border border-border">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full gradient-honey flex items-center justify-center text-primary-foreground">
              <Shield size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-foreground">מעקב הורים</h1>
              <p className="text-muted-foreground text-sm">
                מסך זה מציג ילדים שקושרו להורה במערכת, עם עדכונים על מועמדויות ומטלות פעילות.
              </p>
            </div>
            <Badge variant="secondary" className="mr-auto rounded-xl font-bold">
              {unreadCount} עדכונים
            </Badge>
          </div>
        </Card>

        <Card className="border border-border p-6">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary-ink">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-foreground">קישור ילד באמצעות קוד</h2>
              <p className="text-sm text-muted-foreground">
                מבקשים מהילד ליצור קוד בפרופיל ומזינים אותו כאן בתוך 10 דקות.
              </p>
            </div>
          </div>
          <form onSubmit={redeemFamilyCode} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="family-code">קוד בן 6 ספרות</Label>
              <Input
                id="family-code"
                value={familyCode}
                onChange={(event) => setFamilyCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                dir="ltr"
                maxLength={6}
                placeholder="000000"
                className="mt-1 h-12 text-center text-xl font-black tracking-[0.25em] tabular-nums"
              />
            </div>
            <Button
              type="submit"
              disabled={redeemingCode || familyCode.length !== 6}
              className="h-12 rounded-xl px-7 font-bold"
            >
              {redeemingCode ? "מקשר..." : "קישור הילד"}
            </Button>
          </form>
        </Card>

        {loading ? (
          <Card className="p-8 text-center text-muted-foreground">טוען נתוני הורים...</Card>
        ) : children.length === 0 ? (
          <Card className="p-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary-ink">
                <User size={28} />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-foreground">עדיין אין ילדים מקושרים</h2>
              <p className="text-muted-foreground text-sm mt-2">
                בקשו מהילד ליצור קוד זמני בפרופיל והזינו אותו למעלה.
              </p>
            </div>
            <Link to="/tasks">
              <Button className="gradient-honey text-primary-foreground rounded-full font-bold">
                חזרה למטלות
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="grid gap-6">
            {children.map((child) => (
              <Card key={child.userId} className="p-6 border border-border space-y-5">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full gradient-honey flex items-center justify-center text-primary-foreground">
                    <User size={28} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-extrabold text-foreground">{child.name}</h2>
                    <p className="text-muted-foreground text-sm">
                      {child.age ? `גיל ${child.age}` : "גיל לא עודכן"}
                    </p>
                  </div>
                </div>

                {child.activeTask ? (
                  <div className="grid lg:grid-cols-2 gap-4">
                    <div className="bg-card rounded-3xl border border-border p-5 shadow-sm">
                      <div className="flex items-center gap-2 mb-4">
                        <MapPin size={18} className="text-primary-ink" />
                        <h3 className="font-extrabold text-foreground">מטלה פעילה</h3>
                      </div>
                      <div className="space-y-2 text-sm">
                        <p className="font-bold text-foreground">{child.activeTask.name}</p>
                        <p className="text-muted-foreground">אצל {child.activeTask.taskerName}</p>
                        {child.activeTask.location && <p className="text-muted-foreground">{child.activeTask.location}</p>}
                        <p className="text-muted-foreground">
                          {formatDateTime(child.activeTask.scheduledDate, child.activeTask.scheduledTime)}
                        </p>
                        <Badge variant="secondary" className="rounded-lg font-bold mt-2">
                          {statusLabel(child.activeTask.status)}
                        </Badge>
                      </div>
                    </div>

                    <div className="bg-card rounded-3xl border border-border p-5 shadow-sm">
                      <div className="flex items-center gap-2 mb-4">
                        <AlertCircle size={18} className="text-primary-ink" />
                        <h3 className="font-extrabold text-foreground">סטטוס מעקב</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        כרגע מוצגת המטלה הפעילה האחרונה של הילד. אפשר להרחיב בהמשך למיקום חי, היסטוריה מלאה והתראות push.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                    אין כרגע מטלה פעילה לילד הזה.
                  </div>
                )}

                <div className="bg-card rounded-3xl border border-border overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-border flex items-center gap-2">
                    <Bell size={18} className="text-primary-ink" />
                    <h3 className="font-extrabold text-foreground">עדכונים אחרונים</h3>
                  </div>
                  <div className="divide-y divide-border">
                    {child.notifications.length === 0 ? (
                      <div className="p-4 text-sm text-muted-foreground">אין עדכונים עדיין.</div>
                    ) : (
                      child.notifications.map((notif) => (
                        <div key={notif.id} className={`p-4 flex items-start gap-3 ${!notif.read ? "bg-primary/5" : ""}`}>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                            notif.type === "accepted"
                              ? "bg-blue-100 text-blue-600"
                              : notif.type === "completed"
                              ? "bg-green-100 text-green-600"
                              : notif.type === "rejected"
                              ? "bg-red-100 text-red-600"
                              : "bg-amber-100 text-amber-600"
                          }`}>
                            {notif.type === "completed" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                          </div>
                          <div className="flex-1">
                            <p className={`text-sm ${!notif.read ? "font-bold text-foreground" : "text-muted-foreground"}`}>
                              {notif.message}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">{notif.time}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ParentalHub;
