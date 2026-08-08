import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellOff, Mail, MoonStar, Share, Smartphone } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  CHANNEL_DEFAULTS,
  rowsForRoles,
  type NotificationEvent,
} from "@/lib/notificationCopy";
import {
  currentSubscription,
  isIos,
  needsInstall,
  pushConfigured,
  pushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push";

type Channels = { email: boolean; push: boolean };

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

const Settings = () => {
  const { user, roles, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState<Record<string, Channels>>({});
  const [digestHour, setDigestHour] = useState(20);
  const [quietEnabled, setQuietEnabled] = useState(true);
  const [quietStart, setQuietStart] = useState(22);
  const [quietEnd, setQuietEnd] = useState(7);
  const [pushActive, setPushActive] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const isParent = roles.includes("parent");
  const rows = useMemo(() => rowsForRoles(roles), [roles]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/login");
      return;
    }

    const load = async () => {
      const [{ data: prefRows }, { data: settingsRow }, subscription] = await Promise.all([
        supabase
          .from("notification_preferences")
          .select("event_type, email_enabled, push_enabled")
          .eq("user_id", user.id),
        supabase
          .from("notification_settings")
          .select("digest_hour, quiet_hours_enabled, quiet_hours_start, quiet_hours_end")
          .eq("user_id", user.id)
          .maybeSingle(),
        currentSubscription(),
      ]);

      // Stored rows are overrides only; anything absent falls back to the
      // shared defaults so a new event type works without a backfill.
      const merged: Record<string, Channels> = {};
      for (const [event, defaults] of Object.entries(CHANNEL_DEFAULTS)) merged[event] = { ...defaults };
      for (const row of prefRows ?? []) {
        merged[row.event_type] = { email: row.email_enabled, push: row.push_enabled };
      }

      setPreferences(merged);
      if (settingsRow) {
        setDigestHour(settingsRow.digest_hour ?? 20);
        setQuietEnabled(settingsRow.quiet_hours_enabled ?? true);
        setQuietStart(settingsRow.quiet_hours_start ?? 22);
        setQuietEnd(settingsRow.quiet_hours_end ?? 7);
      }
      setPushActive(Boolean(subscription));
      setLoading(false);
    };

    load();
  }, [authLoading, user, navigate]);

  const toggleChannel = async (event: NotificationEvent, channel: keyof Channels, value: boolean) => {
    if (!user) return;
    const next = { ...preferences[event], [channel]: value } as Channels;
    setPreferences((prev) => ({ ...prev, [event]: next }));

    const { error } = await supabase.from("notification_preferences").upsert(
      {
        user_id: user.id,
        event_type: event,
        email_enabled: next.email,
        push_enabled: next.push,
      },
      { onConflict: "user_id,event_type" },
    );

    if (error) {
      toast.error("לא הצלחנו לשמור את ההעדפה");
      setPreferences((prev) => ({ ...prev, [event]: { ...next, [channel]: !value } }));
    }
  };

  const saveSettings = async (patch: Record<string, number | boolean>) => {
    if (!user) return;
    const { error } = await supabase.from("notification_settings").upsert(
      {
        user_id: user.id,
        digest_hour: digestHour,
        quiet_hours_enabled: quietEnabled,
        quiet_hours_start: quietStart,
        quiet_hours_end: quietEnd,
        ...patch,
      },
      { onConflict: "user_id" },
    );
    if (error) toast.error("לא הצלחנו לשמור את ההגדרה");
  };

  const handlePushToggle = async () => {
    setPushBusy(true);
    if (pushActive) {
      await unsubscribeFromPush();
      setPushActive(false);
      toast.success("ההתראות במכשיר הזה כובו");
    } else {
      const result = await subscribeToPush();
      if (result.ok) {
        setPushActive(true);
        toast.success("ההתראות הופעלו במכשיר הזה 🔔");
      } else if (result.reason === "denied") {
        toast.error("הדפדפן חסם את ההתראות. אפשר לאשר אותן בהגדרות האתר");
      } else if (result.reason === "install_required") {
        toast.error("צריך קודם להתקין את האפליקציה למסך הבית");
      } else if (result.reason === "not_configured") {
        toast.error("שירות ההתראות עוד לא מוגדר");
      } else {
        toast.error("לא הצלחנו להפעיל התראות במכשיר הזה");
      }
    }
    setPushBusy(false);
  };

  // Push is an installed-app feature. In a browser tab we explain how to
  // install rather than firing a permission prompt that would likely be denied
  // — and a denied prompt is not something the app can ask for a second time.
  const showInstallHint = needsInstall();
  const pushUnavailable = !pushSupported() || !pushConfigured();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-muted" dir="rtl">
        <PageHeader title="הגדרות התראות" titleIsPageHeading icon={<Bell size={18} />} />
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-5" aria-busy="true">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted" dir="rtl">
      <PageHeader title="הגדרות התראות" titleIsPageHeading icon={<Bell size={18} />} />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Push enrolment */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Smartphone size={18} className="text-primary-ink" />
              התראות במכשיר
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {showInstallHint ? (
              <div className="rounded-2xl bg-accent/20 border border-border p-4 text-sm leading-relaxed">
                <p className="font-bold mb-1 flex items-center gap-1.5">
                  <Share size={15} />
                  צריך קודם להתקין את האפליקציה
                </p>
                <p className="text-muted-foreground">
                  {isIos()
                    ? 'כדי לקבל התראות באייפון, מוסיפים את BZB למסך הבית: לוחצים על כפתור השיתוף בספארי, בוחרים "הוספה למסך הבית", ואז פותחים את האפליקציה משם וחוזרים למסך הזה.'
                    : 'התראות זמינות רק כשהאפליקציה מותקנת. מתקינים אותה מסרגל הכתובות של הדפדפן (אייקון ההתקנה) או מתפריט הדפדפן, ואז פותחים את האפליקציה וחוזרים למסך הזה.'}
                </p>
                <p className="text-muted-foreground mt-2">
                  עד אז, ההתראות ימשיכו להגיע במייל ובפעמון שבראש המסך.
                </p>
              </div>
            ) : pushUnavailable ? (
              <p className="text-sm text-muted-foreground">
                הדפדפן הזה לא תומך בהתראות. המיילים ימשיכו להישלח כרגיל.
              </p>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-foreground">
                    {pushActive ? "התראות פעילות במכשיר הזה" : "ההתראות כבויות במכשיר הזה"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    ההגדרה הזו חלה על המכשיר הנוכחי בלבד
                  </p>
                </div>
                <Button
                  onClick={handlePushToggle}
                  disabled={pushBusy}
                  variant={pushActive ? "outline" : "default"}
                  className={pushActive ? "rounded-full font-bold" : "gradient-honey text-primary-foreground rounded-full border-none font-bold"}
                >
                  {pushActive ? <BellOff size={16} /> : <Bell size={16} />}
                  {pushActive ? "כיבוי" : "הפעלה"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Channel matrix */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">מה לשלוח לי</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((index) => <Skeleton key={index} className="h-16 w-full rounded-2xl" />)}
              </div>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין התראות רלוונטיות לחשבון הזה.</p>
            ) : (
              <div className="divide-y divide-border">
                {rows.map(({ event, label, description }) => (
                  <div key={event} className="py-4 first:pt-0 last:pb-0">
                    <p className="font-bold text-foreground">{label}</p>
                    <p className="text-sm text-muted-foreground mb-3">{description}</p>
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`${event}-email`}
                          checked={preferences[event]?.email ?? true}
                          onCheckedChange={(value) => toggleChannel(event, "email", value)}
                        />
                        <Label htmlFor={`${event}-email`} className="flex items-center gap-1.5 cursor-pointer">
                          <Mail size={15} className="text-primary-ink" />
                          מייל
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`${event}-push`}
                          checked={preferences[event]?.push ?? false}
                          onCheckedChange={(value) => toggleChannel(event, "push", value)}
                        />
                        <Label htmlFor={`${event}-push`} className="flex items-center gap-1.5 cursor-pointer">
                          <Bell size={15} className="text-primary-ink" />
                          התראה
                        </Label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Digest hour — parents only */}
        {isParent && (
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">שעת הדוח היומי</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                מתי לשלוח את סיכום הפעילות של הילדים. אם לא הייתה פעילות, לא נשלח דוח.
              </p>
              <Select
                value={String(digestHour)}
                onValueChange={(value) => {
                  const hour = Number(value);
                  setDigestHour(hour);
                  saveSettings({ digest_hour: hour });
                }}
              >
                <SelectTrigger className="w-40 rounded-2xl h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((hour) => (
                    <SelectItem key={hour} value={String(hour)}>{hourLabel(hour)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {/* Quiet hours */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <MoonStar size={18} className="text-primary-ink" />
              שעות שקטות
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-bold text-foreground">להשתיק התראות בלילה</p>
                <p className="text-sm text-muted-foreground">
                  ההתראה עדיין תופיע בפעמון ובמייל — רק הצליל במכשיר נחסם
                </p>
              </div>
              <Switch
                checked={quietEnabled}
                onCheckedChange={(value) => {
                  setQuietEnabled(value);
                  saveSettings({ quiet_hours_enabled: value });
                }}
              />
            </div>

            {quietEnabled && (
              <div className="flex items-center gap-3">
                <div className="space-y-1">
                  <Label id="quiet-start-label" className="text-xs text-muted-foreground">מ־</Label>
                  <Select
                    value={String(quietStart)}
                    onValueChange={(value) => {
                      const hour = Number(value);
                      setQuietStart(hour);
                      saveSettings({ quiet_hours_start: hour });
                    }}
                  >
                    <SelectTrigger aria-labelledby="quiet-start-label" className="w-28 rounded-2xl h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {HOURS.map((hour) => (
                        <SelectItem key={hour} value={String(hour)}>{hourLabel(hour)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label id="quiet-end-label" className="text-xs text-muted-foreground">עד</Label>
                  <Select
                    value={String(quietEnd)}
                    onValueChange={(value) => {
                      const hour = Number(value);
                      setQuietEnd(hour);
                      saveSettings({ quiet_hours_end: hour });
                    }}
                  >
                    <SelectTrigger aria-labelledby="quiet-end-label" className="w-28 rounded-2xl h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {HOURS.map((hour) => (
                        <SelectItem key={hour} value={String(hour)}>{hourLabel(hour)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
