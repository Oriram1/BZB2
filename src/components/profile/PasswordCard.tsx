import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { PasswordStrength } from "@/components/PasswordStrength";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isStrongPassword, passwordRequirementsMessage } from "@/lib/password";

/**
 * Optional password. Someone who signed up with Google can add one here to
 * also sign in with email and password; until then Google is the only way in.
 */
export function PasswordCard() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const googleOnly = (user?.app_metadata?.providers as string[] | undefined)?.every((p) => p !== "email") ?? false;

  const close = () => { setOpen(false); setPassword(""); setConfirm(""); setError(""); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isStrongPassword(password)) return setError(passwordRequirementsMessage);
    if (password !== confirm) return setError("שתי הסיסמאות לא תואמות");
    setSaving(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (err) return setError(err.message);
    toast.success(googleOnly ? "הסיסמה נוספה. אפשר להתחבר גם עם מייל וסיסמה" : "הסיסמה עודכנה");
    close();
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <KeyRound size={18} className="text-primary-ink" aria-hidden="true" />
          {googleOnly ? "סיסמה (לא חובה)" : "שינוי סיסמה"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!open ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {googleOnly
                ? "כרגע נכנסים רק עם גוגל. אפשר להוסיף סיסמה כדי להתחבר גם עם מייל."
                : "אפשר לעדכן את הסיסמה לכניסה עם מייל."}
            </p>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              {googleOnly ? "הוספת סיסמה" : "שינוי"}
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label htmlFor="new-password">סיסמה חדשה</Label>
              <PasswordInput id="new-password" value={password} autoComplete="new-password"
                onChange={(e) => { setPassword(e.target.value); setError(""); }} className="mt-1" />
              <PasswordStrength password={password} />
            </div>
            <div>
              <Label htmlFor="confirm-password">אימות סיסמה</Label>
              <PasswordInput id="confirm-password" value={confirm} autoComplete="new-password"
                onChange={(e) => { setConfirm(e.target.value); setError(""); }} className="mt-1" />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={saving}>{saving ? "שומר..." : "שמירה"}</Button>
              <Button type="button" variant="ghost" size="sm" onClick={close}>ביטול</Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
