import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import { CheckCircle, Clock, ClipboardList, Coins, AlertTriangle } from "lucide-react";

interface ChildData {
  child: { first_name: string; last_name: string; avatar_url: string | null; age: number | null };
  stats: { total_tasks: number; completed: number; total_earned: number };
  tasks: {
    name: string;
    short_desc: string;
    status: string;
    task_status: string;
    payment: number;
    payment_type: string;
    category: string;
    applied_at: string;
  }[];
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "ממתין", color: "bg-amber-100 text-amber-800" },
  accepted: { label: "התקבל", color: "bg-blue-100 text-blue-800" },
  completed: { label: "הושלם", color: "bg-green-100 text-green-800" },
  rejected: { label: "נדחה", color: "bg-red-100 text-red-800" },
  cancelled: { label: "בוטל", color: "bg-gray-100 text-gray-700" },
};

const ParentView = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ChildData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data: result, error: err } = await supabase.functions.invoke("parent-view", {
        body: { token },
      });
      if (err || result?.error) {
        setError(true);
      } else {
        setData(result as ChildData);
      }
      setLoading(false);
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-muted p-4" dir="rtl">
        <div className="max-w-lg mx-auto space-y-4 pt-8">
          <Skeleton className="h-32 w-full rounded-3xl" />
          <Skeleton className="h-24 w-full rounded-3xl" />
          <Skeleton className="h-48 w-full rounded-3xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center p-4" dir="rtl">
        <Card className="max-w-sm w-full border-border">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-destructive" />
            <p className="font-bold text-foreground mb-1">הקישור לא תקין</p>
            <p className="text-sm text-muted-foreground">
              יכול להיות שהקישור פג תוקף או שהוא לא נכון. אפשר לבקש קישור חדש מהילד/ה.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { child, stats, tasks } = data;
  const initials = `${child.first_name?.[0] ?? ""}${child.last_name?.[0] ?? ""}`;

  return (
    <div className="min-h-screen bg-muted" dir="rtl">
      {/* Header */}
      <div className="gradient-honey px-4 pb-6 pt-8 text-center">
        <Avatar className="mx-auto h-20 w-20 border-4 border-white shadow-md">
          {child.avatar_url && <AvatarImage src={child.avatar_url} />}
          <AvatarFallback className="text-2xl font-bold bg-white text-primary-ink">
            {initials}
          </AvatarFallback>
        </Avatar>
        <h1 className="mt-3 text-xl font-extrabold text-white">
          {child.first_name} {child.last_name}
        </h1>
        {child.age && (
          <p className="text-sm text-white/80">גיל {child.age}</p>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-border text-center">
            <CardContent className="py-4">
              <ClipboardList className="mx-auto mb-1 h-5 w-5 text-primary-ink" />
              <p className="text-2xl font-extrabold">{stats.total_tasks}</p>
              <p className="text-xs text-muted-foreground">מטלות</p>
            </CardContent>
          </Card>
          <Card className="border-border text-center">
            <CardContent className="py-4">
              <CheckCircle className="mx-auto mb-1 h-5 w-5 text-green-600" />
              <p className="text-2xl font-extrabold">{stats.completed}</p>
              <p className="text-xs text-muted-foreground">הושלמו</p>
            </CardContent>
          </Card>
          <Card className="border-border text-center">
            <CardContent className="py-4">
              <Coins className="mx-auto mb-1 h-5 w-5 text-amber-500" />
              <p className="text-2xl font-extrabold">{formatCurrency(stats.total_earned)}</p>
              <p className="text-xs text-muted-foreground">הרוויח/ה</p>
            </CardContent>
          </Card>
        </div>

        {/* Tasks */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary-ink" />
              מטלות אחרונות
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">
                🐝 אין מטלות עדיין
              </p>
            ) : (
              <ul className="space-y-3">
                {tasks.map((task, i) => {
                  const statusInfo = STATUS_LABELS[task.status] ?? STATUS_LABELS.pending;
                  return (
                    <li key={i} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/50 p-3">
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{task.name}</p>
                        {task.short_desc && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{task.short_desc}</p>
                        )}
                        {task.payment > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatCurrency(task.payment)}
                          </p>
                        )}
                      </div>
                      <Badge className={`shrink-0 ${statusInfo.color}`}>
                        {statusInfo.label}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground pb-4">
          🐝 BusyBee — מטלות לנוער
        </p>
      </div>
    </div>
  );
};

export default ParentView;
