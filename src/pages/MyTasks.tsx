import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface TaskWithApplications {
  id: string;
  name: string;
  short_desc: string;
  views_count: number;
  status: string;
  applications: {
    id: string;
    status: string;
    applicant_id: string;
    profile?: { first_name: string; last_name: string; age: number | null };
  }[];
}

const MyTasks = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TaskWithApplications[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchTasks = async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, name, short_desc, views_count, status")
        .eq("creator_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        toast.error("שגיאה בטעינת המטלות");
        setLoading(false);
        return;
      }

      // Fetch applications for each task
      const tasksWithApps: TaskWithApplications[] = [];
      for (const task of data || []) {
        const { data: apps } = await supabase
          .from("task_applications")
          .select("id, status, applicant_id")
          .eq("task_id", task.id);

        const enrichedApps = [];
        for (const app of apps || []) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("first_name, last_name, age")
            .eq("user_id", app.applicant_id)
            .single();
          enrichedApps.push({ ...app, profile: profile || undefined });
        }

        tasksWithApps.push({ ...task, applications: enrichedApps });
      }

      setTasks(tasksWithApps);
      setLoading(false);
    };
    fetchTasks();
  }, [user]);

  const handleApplicationStatus = async (applicationId: string, taskId: string, applicantId: string, status: "accepted" | "rejected") => {
    const { error } = await supabase
      .from("task_applications")
      .update({ status })
      .eq("id", applicationId);
    if (error) {
      toast.error("שגיאה בעדכון הסטטוס");
    } else {
      toast.success(status === "accepted" ? "המועמד התקבל! ✓" : "המועמד נדחה");

      // Auto-create conversation when accepting
      if (status === "accepted" && user) {
        const { error: convError } = await supabase.from("conversations").insert({
          participant_1: user.id,
          participant_2: applicantId,
          task_id: taskId,
        });
        if (!convError) {
          toast.success("שיחת צ'אט נפתחה עם המבצע 💬");
        }
      }

      // Refresh
      setTasks((prev) =>
        prev.map((t) => ({
          ...t,
          applications: t.applications.map((a) =>
            a.id === applicationId ? { ...a, status } : a
          ),
        }))
      );
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <p className="text-xl font-bold text-foreground mb-4">יש להתחבר כדי לצפות במטלות שלך</p>
          <Link to="/login">
            <Button className="gradient-honey text-primary-foreground rounded-full font-bold">כניסה 🐝</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted relative" dir="rtl">
      <div className="absolute top-40 right-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />

      <PageHeader
        action={
          <Link to="/create-task">
            <Button size="sm" className="bg-card text-foreground font-bold rounded-full hover:scale-105 transition-transform duration-300">
              + מטלה חדשה
            </Button>
          </Link>
        }
      />

      <div className="max-w-3xl mx-auto py-8 px-4 relative z-10">
        <h1 className="text-3xl font-extrabold text-foreground mb-6">המטלות שלי 📋</h1>

        {loading ? (
          <p className="text-center text-muted-foreground">טוען...</p>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-xl text-muted-foreground mb-4">עדיין לא פרסמת מטלות</p>
            <Link to="/create-task">
              <Button className="gradient-honey text-primary-foreground rounded-full font-bold">פרסם מטלה ראשונה 🐝</Button>
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {tasks.map((task) => (
              <div key={task.id} className="bg-card rounded-3xl p-6 border border-border card-hover">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-extrabold text-lg text-foreground">{task.name}</h3>
                    <p className="text-muted-foreground text-sm">{task.short_desc}</p>
                  </div>
                  <Badge className="gradient-honey text-primary-foreground border-none rounded-xl font-bold">
                    {task.status === "open" ? "הרחבה" : task.status === "accepted" ? "התקבלה" : task.status === "in_progress" ? "בביצוע" : task.status === "completed" ? "הושלמה" : "בוטלה"}
                  </Badge>
                </div>

                <div className="text-sm text-muted-foreground mb-4 font-semibold">
                  👁️ {task.views_count} צפיות
                </div>

                {task.applications.filter(a => a.status === "pending").length > 0 && (
                  <div className="border-t border-border pt-4">
                    <p className="text-sm font-bold text-foreground mb-3">
                      מעוניינים ({task.applications.filter(a => a.status === "pending").length}):
                    </p>
                    <div className="flex flex-col gap-2">
                      {task.applications.filter(a => a.status === "pending").map((app) => (
                        <div key={app.id} className="flex items-center justify-between bg-muted rounded-2xl p-3">
                          <div>
                            <span className="font-bold text-foreground">
                              {app.profile ? `${app.profile.first_name} ${app.profile.last_name}` : "משתמש"}
                            </span>
                            {app.profile?.age && (
                              <span className="text-muted-foreground text-sm mr-2">גיל {app.profile.age}</span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleApplicationStatus(app.id, task.id, app.applicant_id, "accepted")}
                              className="gradient-honey text-primary-foreground rounded-full border-none hover:scale-105 transition-transform duration-300 font-bold"
                            >
                              קבל ✓
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleApplicationStatus(app.id, task.id, app.applicant_id, "rejected")}
                              className="rounded-full border-border text-muted-foreground hover:text-destructive hover:border-destructive font-semibold"
                            >
                              דחה ✕
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyTasks;
