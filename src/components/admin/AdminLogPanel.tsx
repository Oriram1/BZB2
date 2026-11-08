import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { actionLabel, type AuditRow } from "@/lib/adminData";
import { Timestamp } from "@/components/admin/shared";

interface AdminLogPanelProps {
  audit: AuditRow[];
  onRefresh: () => void;
}

export function AdminLogPanel({ audit, onRefresh }: AdminLogPanelProps) {
  return (
    <Card className="p-5 border-border/80 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-extrabold text-lg">פעולות מנהלים</h2>
          <p className="text-sm text-muted-foreground">פעולות שבוצעו על ידי מנהלי המערכת</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={() => onRefresh()}
        >
          <RefreshCw className="h-4 w-4" />
          רענון
        </Button>
      </div>
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
                <span className="font-bold">{actionLabel[row.action] ?? row.action}</span>
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
                יעד:{" "}
                {row.target_identifier ? (
                  <bdi dir="auto">{row.target_identifier}</bdi>
                ) : row.target_user_id ? (
                  <bdi dir="ltr" className="font-mono text-xs">{row.target_user_id}</bdi>
                ) : (
                  "—"
                )}
              </div>
              <Timestamp value={row.created_at} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
