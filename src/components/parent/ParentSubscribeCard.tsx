import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, MailPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formFor, say, SUBJECT, type Gender } from "@/lib/gender";

interface Props {
  token: string;
  childGender: Gender | null;
  childName: string;
}

/**
 * A second parent asks to be added to the child's contact list.
 *
 * Submitting does NOT subscribe anyone. It queues a request that the child
 * approves or rejects from their profile — holding the share link proves you
 * were given it, not that the child wants you watching. The copy says so
 * plainly, because a form that looks like a subscribe button but behaves like a
 * request is a form people will fill in twice.
 */
export function ParentSubscribeCard({ token, childGender, childName }: Props) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<"pending" | "already" | null>(null);

  const kid = formFor(childGender);
  const child = childName || say(kid, SUBJECT.child);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      toast.error("כתובת המייל לא נראית תקינה");
      return;
    }

    setSending(true);
    const { data, error } = await supabase.functions.invoke("request-parent-contact", {
      body: { token, email: address },
    });
    setSending(false);

    if (error || data?.error) {
      const code = data?.error;
      toast.error(
        code === "too_soon"
          ? "נשלחה בקשה ממש עכשיו. אפשר לנסות שוב בעוד כמה דקות."
          : code === "limit_reached"
            ? "יש כבר שלוש בקשות ממתינות. צריך שיאשרו או ידחו אותן קודם."
            : "לא הצלחנו לשלוח את הבקשה",
      );
      return;
    }

    setDone(data?.status === "already_added" ? "already" : "pending");
    setEmail("");
  };

  if (done) {
    return (
      <Card className="border-border">
        <CardContent className="py-6 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-600" />
          <p className="font-bold text-sm text-foreground">
            {done === "already" ? "הכתובת כבר רשומה" : "הבקשה נשלחה"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {done === "already"
              ? "העדכונים כבר נשלחים לכתובת הזאת."
              : `שלחנו ל${child} בקשה לאישור. העדכונים יתחילו רק אחרי שהיא תאושר.`}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border">
      <CardContent className="py-5">
        <form onSubmit={submit} className="space-y-3">
          <div className="flex items-center gap-2">
            <MailPlus className="h-5 w-5 text-primary-ink shrink-0" />
            <p className="font-bold text-sm text-foreground">גם אני רוצה לקבל עדכונים</p>
          </div>
          <p className="text-xs text-muted-foreground">
            הבקשה נשלחת ל{child} לאישור. עד שהיא תאושר לא יישלח שום מייל — ואין צורך להירשם.
          </p>
          <div>
            <Label htmlFor="parent-email" className="sr-only">
              כתובת מייל
            </Label>
            <Input
              id="parent-email"
              type="email"
              inputMode="email"
              dir="ltr"
              placeholder="name@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-xl"
            />
          </div>
          <Button
            type="submit"
            disabled={sending}
            className="w-full rounded-full gradient-honey text-primary-foreground border-none font-bold"
          >
            {sending ? "שולח…" : "שליחת בקשה"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
