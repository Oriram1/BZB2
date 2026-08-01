import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, Eye, MessageCircle, Plus, Star, Trash2, UserRound, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ensureAcceptedTaskConversation } from "@/lib/taskConversations";
import { toast } from "sonner";

type ApplicationStatus = "pending" | "accepted" | "rejected";

interface PublishedTask {
  id: string;
  name: string;
  short_desc: string;
  views_count: number;
  status: string;
}

interface CandidateApplication {
  id: string;
  taskId: string;
  taskName: string;
  applicantId: string;
  status: ApplicationStatus;
  firstName: string;
  lastName: string;
  age: number | null;
  avatarUrl: string | null;
  completedTasks: number;
}

interface PerformingTask {
  applicationId: string;
  applicationStatus: ApplicationStatus;
  id: string;
  name: string;
  shortDesc: string;
  status: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  location: string;
}

const taskStatusLabel = (status: string) => {
  if (status === "open") return "פתוחה";
  if (status === "accepted") return "התקבלה";
  if (status === "in_progress") return "בביצוע";
  if (status === "completed") return "הושלמה";
  return "בוטלה";
};

const applicationStatusLabel: Record<ApplicationStatus, string> = {
  pending: "ממתינה להחלטה",
  accepted: "התקבלה",
  rejected: "לא התקבלה",
};

const MyTasks = () => {
  const { user, roles } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isTasker = roles.includes("tasker");
  const isBee = roles.includes("bee");
  const [publishedTasks, setPublishedTasks] = useState<PublishedTask[]>([]);
  const [applications, setApplications] = useState<CandidateApplication[]>([]);
  const [performingTasks, setPerformingTasks] = useState<PerformingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const pendingCount = useMemo(
    () => applications.filter((application) => application.status === "pending").length,
    [applications],
  );

  const requestedTab = searchParams.get("tab");
  const activeTab = requestedTab === "applications" && isTasker
    ? "applications"
    : requestedTab === "performing" && isBee
      ? "performing"
      : requestedTab === "published" && isTasker
        ? "published"
        : isTasker
          ? "applications"
          : "performing";

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);

      const nextPublishedTasks: PublishedTask[] = [];
      const nextApplications: CandidateApplication[] = [];
      const nextPerformingTasks: PerformingTask[] = [];

      if (isTasker) {
        const { data: taskRows, error: taskError } = await supabase
          .from("tasks")
          .select("id, name, short_desc, views_count, status")
          .eq("creator_id", user.id)
          .order("created_at", { ascending: false });

        if (taskError) {
          toast.error("לא הצלחנו לטעון את המטלות שפרסמתם");
        } else {
          nextPublishedTasks.push(...(taskRows ?? []));

          const applicationGroups = await Promise.all(
            (taskRows ?? []).map(async (task) => {
              const { data: applicationRows } = await supabase
                .from("task_applications")
                .select("id, status, applicant_id")
                .eq("task_id", task.id);

              return Promise.all(
                (applicationRows ?? []).map(async (application) => {
                  const [{ data: profile }, { data: completedTasks }] = await Promise.all([
                    supabase
                      .from("profiles")
                      .select("first_name, last_name, age, avatar_url")
                      .eq("user_id", application.applicant_id)
                      .single(),
                    supabase.rpc("get_worker_completed_task_count", { _user_id: application.applicant_id }),
                  ]);

                  return {
                    id: application.id,
                    taskId: task.id,
                    taskName: task.name,
                    applicantId: application.applicant_id,
                    status: application.status,
                    firstName: profile?.first_name ?? "",
                    lastName: profile?.last_name ?? "",
                    age: profile?.age ?? null,
                    avatarUrl: profile?.avatar_url ?? null,
                    completedTasks: completedTasks ?? 0,
                  } satisfies CandidateApplication;
                }),
              );
            }),
          );

          nextApplications.push(...applicationGroups.flat());
        }
      }

      if (isBee) {
        const { data: ownApplications } = await supabase
          .from("task_applications")
          .select("id, status, task_id")
          .eq("applicant_id", user.id);

        const taskGroups = await Promise.all(
          (ownApplications ?? []).map(async (application) => {
            const { data: task } = await supabase
              .from("tasks")
              .select("id, name, short_desc, status, scheduled_date, scheduled_time, location")
              .eq("id", application.task_id)
              .single();

            if (!task) return null;
            return {
              applicationId: application.id,
              applicationStatus: application.status,
              id: task.id,
              name: task.name,
              shortDesc: task.short_desc,
              status: task.status,
              scheduledDate: task.scheduled_date,
              scheduledTime: task.scheduled_time,
              location: task.location,
            } satisfies PerformingTask;
          }),
        );

        nextPerformingTasks.push(...taskGroups.filter((task): task is PerformingTask => task !== null));
      }

      if (!cancelled) {
        setPublishedTasks(nextPublishedTasks);
        setApplications(nextApplications.sort((a, b) => Number(a.status !== "pending") - Number(b.status !== "pending")));
        setPerformingTasks(nextPerformingTasks);
        setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isBee, isTasker, user]);

  useEffect(() => {
    if (loading) return;
    const applicationId = searchParams.get("application");
    if (!applicationId) return;
    window.requestAnimationFrame(() => {
      document.getElementById(`application-${applicationId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [loading, searchParams]);

  const changeTab = (tab: string) => {
    setSearchParams({ tab });
  };

  const updateApplicationStatus = async (application: CandidateApplication, status: "accepted" | "rejected") => {
    setActionId(application.id);
    const { error } = await supabase
      .from("task_applications")
      .update({ status })
      .eq("id", application.id);

    if (error) {
      toast.error("לא הצלחנו לעדכן את המועמדות");
      setActionId(null);
      return;
    }

    setApplications((current) => current.map((item) => item.id === application.id ? { ...item, status } : item));

    if (status === "rejected") {
      toast.success("המועמדות נדחתה");
      setActionId(null);
      return;
    }

    try {
      const conversationId = await ensureAcceptedTaskConversation(application.taskId, application.applicantId);
      toast.success("המועמדות אושרה והשיחה נפתחה");
      navigate(`/chat?conversation=${conversationId}`);
    } catch {
      toast.error("המועמדות אושרה, אך פתיחת הצ׳אט נכשלה. אפשר לנסות שוב מכפתור הצ׳אט");
      setActionId(null);
    }
  };

  const openAcceptedConversation = async (application: CandidateApplication) => {
    setActionId(application.id);
    try {
      const conversationId = await ensureAcceptedTaskConversation(application.taskId, application.applicantId);
      navigate(`/chat?conversation=${conversationId}`);
    } catch {
      toast.error("לא הצלחנו לפתוח את השיחה");
      setActionId(null);
    }
  };

  const deleteTask = async (task: PublishedTask) => {
    await supabase.from("task_applications").delete().eq("task_id", task.id);
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) {
      toast.error("לא הצלחנו למחוק את המטלה");
      return;
    }
    setPublishedTasks((current) => current.filter((item) => item.id !== task.id));
    setApplications((current) => current.filter((item) => item.taskId !== task.id));
    toast.success("המטלה נמחקה");
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-muted relative" dir="rtl">
      <div className="absolute top-40 right-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
      <PageHeader
        title="המטלות שלי"
        action={isTasker ? (
          <Link to="/create-task">
            <Button size="sm" className="rounded-full bg-white text-slate-950 hover:bg-white/90 font-black shadow-md gap-1.5">
              <Plus size={16} aria-hidden="true" />
              פרסום מטלה
            </Button>
          </Link>
        ) : undefined}
      />

      <main className="max-w-3xl mx-auto py-5 px-4 relative z-10">
        <Tabs value={activeTab} onValueChange={changeTab} dir="rtl">
          <TabsList className={`grid w-full h-auto rounded-2xl bg-card border border-border p-1 ${isTasker && isBee ? "grid-cols-3" : isTasker ? "grid-cols-2" : "grid-cols-1"}`}>
            {isTasker && (
              <TabsTrigger value="applications" className="relative min-h-11 rounded-xl font-bold gap-1.5">
                מועמדויות
                {pendingCount > 0 && (
                  <Badge className="h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground border-0">
                    {pendingCount}
                  </Badge>
                )}
              </TabsTrigger>
            )}
            {isTasker && <TabsTrigger value="published" className="min-h-11 rounded-xl font-bold">מטלות שפרסמתי</TabsTrigger>}
            {isBee && <TabsTrigger value="performing" className="min-h-11 rounded-xl font-bold">מטלות שאני מבצע</TabsTrigger>}
          </TabsList>

          {isTasker && (
            <TabsContent value="applications" className="mt-4 space-y-3">
              {loading ? (
                <p className="py-12 text-center text-muted-foreground">טוען מועמדויות…</p>
              ) : applications.length === 0 ? (
                <div className="rounded-3xl border border-border bg-card p-8 text-center">
                  <UserRound className="mx-auto mb-3 text-muted-foreground" aria-hidden="true" />
                  <p className="font-bold">אין מועמדויות עדיין</p>
                  <p className="text-sm text-muted-foreground mt-1">מועמדויות חדשות יופיעו כאן.</p>
                </div>
              ) : applications.map((application) => {
                const fullName = `${application.firstName} ${application.lastName}`.trim() || "משתמש";
                const highlighted = searchParams.get("application") === application.id;
                return (
                  <article
                    id={`application-${application.id}`}
                    key={application.id}
                    className={`rounded-3xl border bg-card p-4 shadow-sm transition-shadow ${highlighted ? "border-primary ring-2 ring-primary/20" : "border-border"}`}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="h-14 w-14 border border-border shrink-0">
                        <AvatarImage src={application.avatarUrl ?? undefined} alt={fullName} />
                        <AvatarFallback>{application.firstName.slice(0, 1) || "🐝"}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-extrabold text-foreground">{fullName}</h2>
                          {application.age && <span className="text-sm text-muted-foreground">גיל {application.age}</span>}
                          <Badge variant={application.status === "accepted" ? "default" : "secondary"} className="rounded-full">
                            {applicationStatusLabel[application.status]}
                          </Badge>
                        </div>
                        <Link to={`/task/${application.taskId}`} className="text-sm text-primary-ink font-semibold hover:underline">
                          {application.taskName}
                        </Link>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><Check size={13} /> {application.completedTasks} מטלות שהושלמו</span>
                          <span className="inline-flex items-center gap-1"><Star size={13} /> אין דירוגים עדיין</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                      <Button asChild variant="outline" className="rounded-full font-bold">
                        <Link to={`/profile/${application.applicantId}`}>צפייה בפרופיל</Link>
                      </Button>
                      {application.status === "pending" && (
                        <>
                          <Button
                            onClick={() => updateApplicationStatus(application, "accepted")}
                            disabled={actionId === application.id}
                            className="rounded-full gradient-honey text-primary-foreground font-bold gap-1"
                          >
                            <Check size={16} /> אישור וקבלה
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => updateApplicationStatus(application, "rejected")}
                            disabled={actionId === application.id}
                            className="rounded-full font-bold text-destructive hover:text-destructive gap-1 col-span-2 sm:col-auto"
                          >
                            <X size={16} /> דחייה
                          </Button>
                        </>
                      )}
                      {application.status === "accepted" && (
                        <Button
                          onClick={() => openAcceptedConversation(application)}
                          disabled={actionId === application.id}
                          className="rounded-full gradient-honey text-primary-foreground font-bold gap-1"
                        >
                          <MessageCircle size={16} /> מעבר לצ׳אט
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </TabsContent>
          )}

          {isTasker && (
            <TabsContent value="published" className="mt-4 space-y-3">
              {loading ? (
                <p className="py-12 text-center text-muted-foreground">טוען מטלות…</p>
              ) : publishedTasks.length === 0 ? (
                <div className="rounded-3xl border border-border bg-card p-8 text-center">
                  <p className="font-bold">עדיין לא פרסמתם מטלות</p>
                  <Link to="/create-task"><Button className="mt-4 rounded-full gradient-honey text-primary-foreground">פרסום מטלה</Button></Link>
                </div>
              ) : publishedTasks.map((task) => (
                <article key={task.id} className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <Link to={`/task/${task.id}`} className="min-w-0 flex-1">
                      <h2 className="font-extrabold text-lg truncate">{task.name}</h2>
                      <p className="text-sm text-muted-foreground line-clamp-2">{task.short_desc}</p>
                    </Link>
                    <Badge className="rounded-full gradient-honey text-primary-foreground border-0">{taskStatusLabel(task.status)}</Badge>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                    <span className="text-sm text-muted-foreground inline-flex items-center gap-1"><Eye size={15} /> {task.views_count} צפיות</span>
                    <div className="flex items-center gap-2">
                      <Link to={`/task/${task.id}`}><Button variant="outline" size="sm" className="rounded-full font-bold">לפרטי המטלה</Button></Link>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="rounded-full text-destructive" aria-label={`מחיקת ${task.name}`}><Trash2 size={16} /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent dir="rtl">
                          <AlertDialogHeader>
                            <AlertDialogTitle>למחוק את המטלה?</AlertDialogTitle>
                            <AlertDialogDescription>המטלה וכל המועמדויות שלה יימחקו לצמיתות.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-full">ביטול</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteTask(task)} className="rounded-full bg-destructive text-destructive-foreground">מחיקה</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </article>
              ))}
            </TabsContent>
          )}

          {isBee && (
            <TabsContent value="performing" className="mt-4 space-y-3">
              {loading ? (
                <p className="py-12 text-center text-muted-foreground">טוען מטלות…</p>
              ) : performingTasks.length === 0 ? (
                <div className="rounded-3xl border border-border bg-card p-8 text-center">
                  <p className="font-bold">עדיין לא הגשתם מועמדות</p>
                  <Link to="/tasks"><Button className="mt-4 rounded-full gradient-honey text-primary-foreground">למטלות הזמינות</Button></Link>
                </div>
              ) : performingTasks.map((task) => (
                <article key={task.applicationId} className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <Link to={`/task/${task.id}`} className="min-w-0 flex-1">
                      <h2 className="font-extrabold text-lg truncate">{task.name}</h2>
                      <p className="text-sm text-muted-foreground line-clamp-2">{task.shortDesc}</p>
                    </Link>
                    <Badge variant="secondary" className="rounded-full">{applicationStatusLabel[task.applicationStatus]}</Badge>
                  </div>
                  <div className="mt-3 text-sm text-muted-foreground space-y-1">
                    <p>{task.location}</p>
                    {(task.scheduledDate || task.scheduledTime) && <p>{task.scheduledDate} {task.scheduledTime}</p>}
                  </div>
                  {task.applicationStatus === "accepted" && (
                    <Button
                      onClick={async () => {
                        try {
                          const conversationId = await ensureAcceptedTaskConversation(task.id, user.id);
                          navigate(`/chat?conversation=${conversationId}`);
                        } catch {
                          toast.error("לא הצלחנו לפתוח את השיחה");
                        }
                      }}
                      className="mt-4 rounded-full gradient-honey text-primary-foreground font-bold gap-1"
                    >
                      <MessageCircle size={16} /> מעבר לצ׳אט
                    </Button>
                  )}
                </article>
              ))}
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
};

export default MyTasks;
