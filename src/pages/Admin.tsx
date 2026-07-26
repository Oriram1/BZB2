import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowRight, Shield } from "lucide-react";
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

export default function Admin() {
  const { user, roles, loading } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [audit, setAudit] = useState<AuditRow[]>([]);

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

  useEffect(() => {
    if (isAdmin) loadAudit();
  }, [isAdmin]);

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
