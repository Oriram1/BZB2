import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

type Kind = "card" | "email" | "phone";
interface DailyRow { day: string; blocked: number; by_card: number; by_email: number; by_phone: number; distinct_users: number }
interface RecentRow {
  id: number;
  created_at: string;
  stage: "precheck" | "card_saved";
  matched_kinds: Kind[];
  user_id: string | null;
  user_name: string | null;
  matched_user_ids: string[];
}

const KIND_LABEL: Record<Kind, string> = { card: "כרטיס", email: "מייל", phone: "טלפון" };

/**
 * Who was refused the free month and why. Hashes never reach this screen: it
 * shows only which kind of detail matched and which earlier account held it.
 */
export default function TrialBlocksPanel() {
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [recent, setRecent] = useState<RecentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_trial_blocks" as never, { _limit: 50 } as never);
    setLoading(false);
    if (error) {
      toast.error("טעינת חסימות החודש החינם נכשלה");
      return;
    }
    const result = data as unknown as { daily: DailyRow[]; recent: RecentRow[] } | null;
    setDaily(result?.daily ?? []);
    setRecent(result?.recent ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const total = daily.reduce((sum, row) => sum + row.blocked, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">חסימות החודש החינם</h2>
          <p className="text-sm text-muted-foreground">
            ניסיונות לקבל חודש חינם פעם שנייה. {total} ב-30 הימים האחרונים. כמות חריגה ביום אחד מעידה על ניצול.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="rounded-full font-bold">
          רענון
        </Button>
      </div>

      <Card className="overflow-x-auto p-4">
        <h3 className="mb-2 font-bold">לפי יום</h3>
        {daily.length === 0 ? (
          <p className="text-sm text-muted-foreground">{loading ? "טוען…" : "אין חסימות."}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-muted-foreground">
                <th className="py-1">יום</th><th>חסימות</th><th>כרטיס</th><th>מייל</th><th>טלפון</th><th>משתמשים</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((row) => (
                <tr key={row.day} className="border-t">
                  <td className="py-1">{new Date(row.day).toLocaleDateString("he-IL")}</td>
                  <td className="font-bold">{row.blocked}</td>
                  <td>{row.by_card}</td><td>{row.by_email}</td><td>{row.by_phone}</td><td>{row.distinct_users}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="mb-2 font-bold">חסימות אחרונות</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">{loading ? "טוען…" : "אין חסימות."}</p>
        ) : (
          <ul className="divide-y">
            {recent.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="font-bold">{row.user_name ?? "משתמש ללא שם"}</span>
                <span className="text-xs text-muted-foreground" dir="ltr">{row.user_id?.slice(0, 8)}</span>
                {row.matched_kinds.map((kind) => (
                  <Badge key={kind} variant="secondary">{KIND_LABEL[kind]}</Badge>
                ))}
                <span className="text-muted-foreground">
                  {row.stage === "precheck" ? "לפני שמירת כרטיס" : "אחרי שמירת כרטיס"}
                </span>
                {row.matched_user_ids.length > 0 && (
                  <span className="text-xs text-muted-foreground" dir="ltr">
                    קודם: {row.matched_user_ids.map((id) => id.slice(0, 8)).join(", ")}
                  </span>
                )}
                <span className="ms-auto text-xs text-muted-foreground">
                  {new Date(row.created_at).toLocaleString("he-IL")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
