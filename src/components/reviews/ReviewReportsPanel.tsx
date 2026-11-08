import { formatDate } from "@/lib/format";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { REPORT_REASONS } from "./ReportReviewDialog";
import { toast } from "sonner";

type Report = { id: string; reason: string; status: string; decision: string | null; decision_note: string | null; appealed_at: string | null; created_at: string };
export default function ReviewReportsPanel() {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!user) return;
    const result = await supabase.from("review_reports").select("id, reason, status, decision, decision_note, appealed_at, created_at").eq("reporter_id", user.id).order("created_at", { ascending: false });
    setError(Boolean(result.error));
    if (!result.error) setReports(result.data ?? []);
  }, [user]);
  useEffect(() => { void load(); }, [load]);
  const appeal = async (id: string) => {
    setBusy(id);
    try {
      const { error: appealError } = await supabase.rpc("appeal_review_report", { _report_id: id });
      if (appealError) throw appealError;
      toast.success("הערעור נשלח לבדיקה"); await load();
    } catch { toast.error("לא הצלחנו לשלוח את הערעור"); }
    finally { setBusy(null); }
  };
  if (!reports.length && !error) return null;
  return <Card><CardHeader className="pb-3"><CardTitle className="text-lg">הדיווחים שלי על ביקורות</CardTitle></CardHeader><CardContent>{error ? <p role="alert" className="text-sm text-destructive">לא הצלחנו לטעון את הדיווחים.</p> : <ul className="space-y-3">{reports.map((report) => <li key={report.id} className="rounded-xl border border-border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{REPORT_REASONS[report.reason] ?? "דיווח"}</span><time className="text-xs text-muted-foreground" dateTime={report.created_at}>{formatDate(report.created_at)}</time></div><p className="mt-1 text-muted-foreground">{report.status === "pending" ? "ממתין לבדיקה" : report.status === "appealed" ? "הערעור בבדיקה" : report.decision === "remove" ? "הביקורת הוסרה" : "הבדיקה הסתיימה - הביקורת נשארת"}</p>{report.status === "resolved" && report.decision_note && <p className="mt-1">{report.decision_note}</p>}{report.status === "resolved" && report.decision === "keep" && !report.appealed_at && <Button size="sm" variant="outline" className="mt-2 rounded-full" disabled={Boolean(busy)} onClick={() => void appeal(report.id)}>ערעור על ההחלטה</Button>}</li>)}</ul>}</CardContent></Card>;
}
