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
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import bzbLogo from "@/assets/bzb-logo.png";
import {
  User, Edit3, Save, X, ClipboardList, TrendingUp, DollarSign,
  Eye, Users, CheckCircle, Clock, BarChart3, ArrowLeft
} from "lucide-react";

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
  const { user, profile, roles, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", age: "", address: "", phone: "" });

  // Tasker state
  const [taskerStats, setTaskerStats] = useState<TaskStats>({ total: 0, open: 0, inProgress: 0, completed: 0, cancelled: 0, totalApplicants: 0 });
  const [myTasks, setMyTasks] = useState<TaskWithApps[]>([]);

  // Bee state
  const [beeStats, setBeeStats] = useState<BeeStats>({ applied: 0, accepted: 0, completed: 0, totalEarnings: 0 });

  const [loadingData, setLoadingData] = useState(true);

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
      });
      setAvatarUrl(profile.avatar_url);
    }
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoadingData(true);
      if (isTasker) await loadTaskerData();
      if (isBee) await loadBeeData();
      setLoadingData(false);
    };
    load();
  }, [user, isTasker, isBee]);

  const loadTaskerData = async () => {
    if (!user) return;
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, name, short_desc, status, views_count, payment, payment_type, category, created_at")
      .eq("creator_id", user.id)
      .order("created_at", { ascending: false });

    if (!tasks) return;

    const enriched: TaskWithApps[] = [];
    let totalApplicants = 0;

    for (const task of tasks) {
      const { data: apps } = await supabase
        .from("task_applications")
        .select("id, status, applicant_id")
        .eq("task_id", task.id);

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
      .eq("applicant_id", user.id);

    if (!apps) return;

    const acceptedTaskIds = apps.filter(a => a.status === "accepted").map(a => a.task_id);
    let totalEarnings = 0;

    if (acceptedTaskIds.length > 0) {
      const { data: completedTasks } = await supabase
        .from("tasks")
        .select("payment, status")
        .in("id", acceptedTaskIds);

      totalEarnings = (completedTasks || [])
        .filter(t => t.status === "completed")
        .reduce((sum, t) => sum + Number(t.payment), 0);
    }

    setBeeStats({
      applied: apps.length,
      accepted: apps.filter(a => a.status === "accepted").length,
      completed: apps.filter(a => a.status === "accepted").length, // approximation
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
      })
      .eq("user_id", user.id);

    if (error) {
      toast.error("שגיאה בשמירת הפרופיל");
    } else {
      toast.success("הפרופיל עודכן בהצלחה!");
      setEditing(false);
    }
    setSaving(false);
  };

  const handleApplicationStatus = async (applicationId: string, status: "accepted" | "rejected") => {
    const { error } = await supabase
      .from("task_applications")
      .update({ status })
      .eq("id", applicationId);
    if (error) {
      toast.error("שגיאה בעדכון הסטטוס");
    } else {
      toast.success(status === "accepted" ? "המועמד התקבל! ✓" : "המועמד נדחה");
      await loadTaskerData();
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
          <Link to="/auth">
            <Button className="gradient-honey text-primary-foreground rounded-full font-bold">כניסה 🐝</Button>
          </Link>
        </div>
      </div>
    );
  }

  const defaultAvatar = `https://api.multiavatar.com/${user.id}.svg`;
  const displayAvatar = avatarUrl || defaultAvatar;
  const displayName = `${form.first_name} ${form.last_name}`.trim() || user.email || "משתמש";
  const roleLabel = isTasker ? "מציע מטלות" : isBee ? "מבצע מטלות 🐝" : roles.includes("parent") ? "הורה" : "";
  const statusLabel = (s: string) => s === "open" ? "הרחבה" : s === "accepted" ? "התקבלה" : s === "in_progress" ? "בביצוע" : s === "completed" ? "הושלמה" : "בוטלה";

  return (
    <div className="min-h-screen bg-muted relative" dir="rtl">
      <div className="absolute top-40 right-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />

      <header className="gradient-honey py-4 px-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full text-primary-foreground hover:bg-primary-foreground/10">
              <ArrowLeft size={20} />
            </Button>
            <Link to="/" className="flex items-center gap-2">
              <img src={bzbLogo} alt="BZB" className="w-10 h-10" />
              <span className="font-extrabold text-primary-foreground text-lg">BZB</span>
            </Link>
          </div>
          <Link to="/tasks">
            <Button size="sm" className="bg-card text-foreground font-bold rounded-full hover:scale-105 transition-transform duration-300">
              מטלות זמינות
            </Button>
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto py-8 px-4 relative z-10 space-y-6">
        {/* Profile Card */}
        <Card className="overflow-hidden border-border">
          <div className="h-24 gradient-honey" />
          <CardContent className="relative pt-0 -mt-12 pb-6">
            <div className="flex items-end gap-4 mb-4">
              <AvatarPicker userId={user.id} currentAvatarUrl={avatarUrl} onAvatarChange={setAvatarUrl} />
              <div className="pb-1">
                <h1 className="text-2xl font-extrabold text-foreground">{displayName}</h1>
                {roleLabel && <Badge className="gradient-honey text-primary-foreground border-none font-bold mt-1">{roleLabel}</Badge>}
              </div>
              <div className="mr-auto pb-1">
                {!editing ? (
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="rounded-full">
                    <Edit3 className="w-4 h-4 ml-1" /> עריכה
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSave} disabled={saving} className="gradient-honey text-primary-foreground rounded-full border-none font-bold">
                      <Save className="w-4 h-4 ml-1" /> {saving ? "שומר..." : "שמור"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setEditing(false)} className="rounded-full">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {editing ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">שם פרטי</Label>
                  <Input value={form.first_name} onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">שם משפחה</Label>
                  <Input value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">גיל</Label>
                  <Input type="number" value={form.age} onChange={e => setForm(p => ({ ...p, age: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">טלפון</Label>
                  <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} dir="ltr" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">כתובת</Label>
                  <Input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
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

        {/* Stats */}
        {isTasker && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard icon={ClipboardList} label="סה״כ מטלות" value={taskerStats.total} color="text-primary" />
              <StatCard icon={Clock} label="פתוחות" value={taskerStats.open} color="text-amber-500" />
              <StatCard icon={CheckCircle} label="הושלמו" value={taskerStats.completed} color="text-green-600" />
              <StatCard icon={Users} label="נרשמים" value={taskerStats.totalApplicants} color="text-blue-500" />
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  המטלות שלי
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {loadingData ? (
                  <p className="text-center text-muted-foreground py-4">טוען...</p>
                ) : myTasks.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-muted-foreground mb-3">עדיין לא פרסמת מטלות</p>
                    <Link to="/create-task">
                      <Button className="gradient-honey text-primary-foreground rounded-full font-bold">פרסם מטלה 🐝</Button>
                    </Link>
                  </div>
                ) : (
                  myTasks.map((task) => (
                    <div key={task.id} className="bg-muted/50 rounded-2xl p-4 border border-border">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-bold text-foreground">{task.name}</h3>
                          <p className="text-sm text-muted-foreground">{task.short_desc}</p>
                        </div>
                        <Badge variant="outline" className="font-bold text-xs">{statusLabel(task.status)}</Badge>
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground mb-2">
                        <span>👁️ {task.views_count} צפיות</span>
                        <span>₪{task.payment} {task.payment_type === "hour" ? "/שעה" : "/מטלה"}</span>
                        <span>📝 {task.applications.length} נרשמים</span>
                      </div>

                      {task.applications.filter(a => a.status === "pending").length > 0 && (
                        <div className="border-t border-border pt-3 mt-2 space-y-2">
                          <p className="text-xs font-bold text-foreground">ממתינים לאישור:</p>
                          {task.applications.filter(a => a.status === "pending").map(app => (
                            <div key={app.id} className="flex items-center justify-between bg-card rounded-xl p-2.5">
                              <div className="flex items-center gap-2">
                                <Avatar className="w-8 h-8">
                                  <AvatarImage src={app.profile?.avatar_url || `https://api.multiavatar.com/${app.applicant_id}.svg`} />
                                  <AvatarFallback>👤</AvatarFallback>
                                </Avatar>
                                <div>
                                  <span className="text-sm font-bold text-foreground">
                                    {app.profile ? `${app.profile.first_name} ${app.profile.last_name}` : "משתמש"}
                                  </span>
                                  {app.profile?.age && <span className="text-xs text-muted-foreground mr-2">גיל {app.profile.age}</span>}
                                </div>
                              </div>
                              <div className="flex gap-1.5">
                                <Button size="sm" onClick={() => handleApplicationStatus(app.id, "accepted")} className="gradient-honey text-primary-foreground rounded-full border-none text-xs h-7 px-3 font-bold">
                                  קבל ✓
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => handleApplicationStatus(app.id, "rejected")} className="rounded-full text-xs h-7 px-3 font-semibold">
                                  דחה
                                </Button>
                              </div>
                            </div>
                          ))}
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={ClipboardList} label="הגשות" value={beeStats.applied} color="text-primary" />
            <StatCard icon={CheckCircle} label="התקבלו" value={beeStats.accepted} color="text-green-600" />
            <StatCard icon={TrendingUp} label="הושלמו" value={beeStats.completed} color="text-blue-500" />
            <StatCard icon={DollarSign} label="הכנסות" value={`₪${beeStats.totalEarnings}`} color="text-amber-500" />
          </div>
        )}
      </div>
    </div>
  );
};

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <Card className="border-border">
      <CardContent className="p-4 flex flex-col items-center text-center gap-1">
        <Icon className={`w-6 h-6 ${color}`} />
        <span className="text-2xl font-extrabold text-foreground">{value}</span>
        <span className="text-xs text-muted-foreground font-semibold">{label}</span>
      </CardContent>
    </Card>
  );
}

export default Profile;
