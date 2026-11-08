import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { activityDetail, userActionLabel, type ActivityRow, type ProfileOption } from "@/lib/adminData";
import { PersonRef, Timestamp } from "@/components/admin/shared";

interface ActivityPanelProps {
  activity: ActivityRow[];
  loading: boolean;
  profilesById: Record<string, ProfileOption>;
  onRefresh: () => void;
}

export function ActivityPanel({ activity, loading, profilesById, onRefresh }: ActivityPanelProps) {
  return (
    <Card className="p-5 border-border/80 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-extrabold text-lg">פעילות משתמשים</h2>
          <p className="text-sm text-muted-foreground">
            פעולות שבוצעו על ידי משתמשי המערכת
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl"
          disabled={loading}
          onClick={() => onRefresh()}
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          רענון
        </Button>
      </div>
      {loading && activity.length === 0 ? (
        <p className="text-sm text-muted-foreground">טוען...</p>
      ) : activity.length === 0 ? (
        <p className="text-sm text-muted-foreground">אין רשומות עדיין</p>
      ) : (
        <ul className="space-y-2">
          {activity.map((row) => {
            const detail = activityDetail(row.details);
            return (
              <li
                key={row.id}
                className="text-sm border rounded-md p-3 flex flex-col gap-1"
              >
                <span className="font-bold">
                  {userActionLabel[row.action] ?? row.action}
                </span>
                <div className="text-muted-foreground">
                  משתמש: <PersonRef profile={profilesById[row.user_id]} userId={row.user_id} />
                </div>
                {detail && <div className="text-muted-foreground">{detail}</div>}
                <Timestamp value={row.created_at} />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
