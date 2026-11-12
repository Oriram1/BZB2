import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { REPORT_REASONS } from "./reportReasons";
import { toast } from "sonner";

type Response = { screening_reason: string | null; id: string; review_id: string; body: string; created_at: string };
type Report = { id: string; review_id: string; reason: string; details: string | null; status: string; created_at: string };
type Appeal = { id: string; review_id: string; reason: string; created_at: string };
type Anomaly = { signal: string; subject_id: string | null; other_id: string | null; detail: string; occurrences: number };
type Review = { id: string; body: string | null; rating: number };

export default function AdminReviewQueues() {
  const [responses, setResponses] = useState<Response[]>([]);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    const [responseResult, reportResult, appealResult] = await Promise.all([
      supabase.from("review_responses").select("id,review_id,body,created_at,screening_reason").eq("status", "pending").order("created_at"),
      supabase.from("review_reports").select("id,review_id,reason,details,status,created_at").in("status", ["pending", "appealed"]).order("created_at"),
      supabase.from("review_appeals").select("id,review_id,reason,created_at").eq("status", "pending").order("created_at"),
    ]);
    if (responseResult.error || reportResult.error || appealResult.error) { setFailed(true); setLoading(false); return; }
    const anomalyResult = await supabase.rpc("admin_review_anomalies");
    setAnomalies(anomalyResult.error ? [] : anomalyResult.data ?? []);
    const reviewIds = [...new Set([...(responseResult.data ?? []), ...(reportResult.data ?? []), ...(appealResult.data ?? [])].map((item) => item.review_id))];
    const reviewResult = reviewIds.length ? await supabase.from("reviews").select("id,body,rating").in("id", reviewIds) : { data: [], error: null };
    if (reviewResult.error) { setFailed(true); setLoading(false); return; }
    setResponses(responseResult.data ?? []); setReports(reportResult.data ?? []); setAppeals(appealResult.data ?? []); setReviews(reviewResult.data ?? []); setFailed(false); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const moderateResponse = async (id: string, status: "approved" | "rejected") => {
    setBusy(id);
    const { error } = await supabase.rpc("admin_moderate_review_response", { _response_id: id, _status: status });
    setBusy(null);
    if (error) { toast.error("לא הצלחנו לעדכן את התגובה"); return; }
    toast.success(status === "approved" ? "התגובה אושרה" : "התגובה נדחתה"); await load();
  };
  const resolveReport = async (id: string, decision: "keep" | "remove") => {
    const note = notes[id]?.trim();
    if (!note) { toast.error("יש לציין נימוק להחלטה"); return; }
    setBusy(id);
    const { error } = await supabase.rpc("admin_resolve_review_report", { _report_id: id, _decision: decision, _note: note });
    setBusy(null);
    if (error) { toast.error("לא הצלחנו לעדכן את הדיווח"); return; }
    toast.success("ההחלטה נשמרה"); await load();
  };
  const resolveAppeal = async (id: string, decision: "restore" | "keep_removed") => {
    const note = notes[id]?.trim();
    if (!note) { toast.error("יש לציין נימוק להחלטה"); return; }
    setBusy(id);
    const { error } = await supabase.rpc("admin_resolve_review_appeal", { _appeal_id: id, _decision: decision, _note: note });
    setBusy(null);
    if (error) { toast.error("לא הצלחנו לעדכן את הערעור"); return; }
    toast.success("ההחלטה נשמרה"); await load();
  };
  const reviewFor = (id: string) => reviews.find((review) => review.id === id);
  return <div className="space-y-4">
    {loading ? <p className="text-sm text-muted-foreground">טוענים תורים...</p> : failed ? <p role="alert" className="text-sm text-destructive">לא הצלחנו לטעון תגובות ודיווחים.</p> : <>
      <Card className="space-y-3 p-5"><h2 className="text-lg font-extrabold">תגובות לביקורות שממתינות לבדיקה</h2>{responses.length === 0 ? <p className="text-sm text-muted-foreground">אין תגובות ממתינות</p> : <ul className="space-y-3">{responses.map((response) => <li key={response.id} className="space-y-2 rounded-xl border p-4 text-sm"><p className="text-muted-foreground">ביקורת ({reviewFor(response.review_id)?.rating ?? "-"} כוכבים): {reviewFor(response.review_id)?.body || "ללא טקסט"}</p><p className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">{response.screening_reason ? `סומן אוטומטית: ${response.screening_reason}` : "בדיקה אוטומטית לא הושלמה"}</p><p className="whitespace-pre-wrap break-words">{response.body}</p><div className="flex gap-2"><Button size="sm" disabled={Boolean(busy)} onClick={() => void moderateResponse(response.id, "approved")}>אישור תגובה</Button><Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void moderateResponse(response.id, "rejected")}>דחייה</Button></div></li>)}</ul>}</Card>
      <Card className="space-y-3 p-5"><h2 className="text-lg font-extrabold">דיווחים וערעורים על ביקורות</h2>{reports.length === 0 ? <p className="text-sm text-muted-foreground">אין דיווחים ממתינים</p> : <ul className="space-y-3">{reports.map((report) => <li key={report.id} className="space-y-2 rounded-xl border p-4 text-sm"><p className="font-semibold">{report.status === "appealed" ? "ערעור - " : ""}{REPORT_REASONS[report.reason] ?? "דיווח"}</p><p className="text-muted-foreground">ביקורת ({reviewFor(report.review_id)?.rating ?? "-"} כוכבים): {reviewFor(report.review_id)?.body || "ללא טקסט"}</p>{report.details && <p className="whitespace-pre-wrap break-words">{report.details}</p>}<Input aria-label="נימוק החלטה לדיווח" value={notes[report.id] ?? ""} maxLength={500} onChange={(event) => setNotes((current) => ({ ...current, [report.id]: event.target.value }))} placeholder="נימוק שיוצג למי שדיווח" /><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!notes[report.id]?.trim() || Boolean(busy)} onClick={() => void resolveReport(report.id, "keep")}>השארת הביקורת</Button><Button size="sm" variant="destructive" disabled={!notes[report.id]?.trim() || Boolean(busy)} onClick={() => void resolveReport(report.id, "remove")}>הסרת הביקורת</Button></div></li>)}</ul>}</Card>
      <Card className="space-y-3 p-5"><h2 className="text-lg font-extrabold">ערעורים של כותבי ביקורות</h2>{appeals.length === 0 ? <p className="text-sm text-muted-foreground">אין ערעורים ממתינים</p> : <ul className="space-y-3">{appeals.map((appeal) => <li key={appeal.id} className="space-y-2 rounded-xl border p-4 text-sm"><p className="text-muted-foreground">ביקורת ({reviewFor(appeal.review_id)?.rating ?? "-"} כוכבים): {reviewFor(appeal.review_id)?.body || "ללא טקסט"}</p><p className="whitespace-pre-wrap break-words">{appeal.reason}</p><Input aria-label="נימוק החלטה לערעור" value={notes[appeal.id] ?? ""} maxLength={500} onChange={(event) => setNotes((current) => ({ ...current, [appeal.id]: event.target.value }))} placeholder="נימוק שיוצג לכותב הביקורת" /><div className="flex flex-wrap gap-2"><Button size="sm" disabled={!notes[appeal.id]?.trim() || Boolean(busy)} onClick={() => void resolveAppeal(appeal.id, "restore")}>אישור הביקורת</Button><Button size="sm" variant="outline" disabled={!notes[appeal.id]?.trim() || Boolean(busy)} onClick={() => void resolveAppeal(appeal.id, "keep_removed")}>השארת ההחלטה</Button></div></li>)}</ul>}</Card>
      <Card className="space-y-3 p-5"><h2 className="text-lg font-extrabold">סימנים לבדיקה ידנית</h2><p className="text-xs text-muted-foreground">אלה רמזים בלבד. אין חסימה או הורדת דירוג אוטומטית.</p>{anomalies.length === 0 ? <p className="text-sm text-muted-foreground">לא זוהו סימנים חריגים</p> : <ul className="space-y-2">{anomalies.map((item, index) => <li key={`${item.signal}-${index}`} className="rounded-xl border p-3 text-sm"><span className="font-semibold">{item.signal === "repeat_pair" ? "ביקורות חוזרות בין אותם שני אנשים" : item.signal === "burst" ? "גל ביקורות מחשבון אחד" : "טקסט זהה שחוזר"}</span> · {item.occurrences} פעמים{item.signal === "duplicate_text" && <p className="mt-1 text-muted-foreground">{item.detail}</p>}</li>)}</ul>}</Card>
    </>}
  </div>;
}
