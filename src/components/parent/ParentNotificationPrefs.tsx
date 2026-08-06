import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formFor, say, SUBJECT, type Gender } from "@/lib/gender";

export interface ParentPrefs {
  notify_signin: boolean;
  notify_accepted: boolean;
  notify_digest: boolean;
  notify_completed: boolean;
  notify_cancelled: boolean;
}

interface Props {
  token: string;
  email: string;
  prefs: ParentPrefs;
  /** The child these updates are about — the copy inflects on their gender. */
  childGender: Gender | null;
  childName: string;
}

/**
 * The switches a parent without an account uses to choose their own email.
 *
 * Writes go through the parent-prefs function rather than PostgREST:
 * parent_contacts grants nothing to anon and has no UPDATE policy, and that is
 * deliberate — see 20260803160000_parent_contacts_without_accounts.sql.
 */
export function ParentNotificationPrefs({ token, email, prefs, childGender, childName }: Props) {
  const [current, setCurrent] = useState(prefs);
  const [saving, setSaving] = useState<keyof ParentPrefs | null>(null);

  const kid = formFor(childGender);
  const child = childName || say(kid, SUBJECT.child);

  const rows: { key: keyof ParentPrefs; label: string; description: string }[] = [
    {
      key: "notify_signin",
      label: "התחברות לאפליקציה",
      description: `כש${child} ${say(kid, SUBJECT.signsIn)} — לכל היותר עדכון אחד ביום`,
    },
    {
      key: "notify_accepted",
      label: "התקבלות למטלה",
      description: `כש${child} ${say(kid, SUBJECT.isAccepted)} לביצוע מטלה`,
    },
    {
      key: "notify_digest",
      label: "סיכום יומי",
      description: "מייל אחד בערב עם מה שקרה באותו יום",
    },
    {
      key: "notify_completed",
      label: "מטלה הושלמה",
      description: `כש${child} ${say(kid, SUBJECT.finished)} מטלה`,
    },
    {
      key: "notify_cancelled",
      label: "מטלה בוטלה",
      description: "כשמפרסם המטלה מבטל מטלה שכבר התקבלה",
    },
  ];

  const toggle = async (key: keyof ParentPrefs, value: boolean) => {
    const previous = current;
    // Optimistic: the switch is the whole interaction, and a switch that waits
    // on a round trip before moving feels broken.
    setCurrent({ ...current, [key]: value });
    setSaving(key);

    const { data, error } = await supabase.functions.invoke("parent-prefs", {
      body: { token, prefs: { [key]: value } },
    });

    setSaving(null);
    if (error || data?.error) {
      setCurrent(previous);
      toast.error("לא הצלחנו לשמור את השינוי");
    }
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary-ink" />
          עדכונים במייל
        </CardTitle>
        <p className="text-xs text-muted-foreground">נשלחים אל {email}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((row) => (
          <div key={row.key} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Label htmlFor={row.key} className="font-bold text-sm cursor-pointer">
                {row.label}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">{row.description}</p>
            </div>
            <Switch
              id={row.key}
              checked={current[row.key]}
              disabled={saving === row.key}
              onCheckedChange={(value) => toggle(row.key, value)}
              className="shrink-0 mt-0.5"
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
