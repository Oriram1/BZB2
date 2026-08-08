import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import BzbLogo from "@/components/BzbLogo";
import { toast } from "sonner";
import { PasswordInput } from "@/components/ui/password-input";
import { supabase } from "@/integrations/supabase/client";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import { logUserActivity } from "@/lib/activityLog";
import { useAuth } from "@/contexts/AuthContext";

const Login = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  // WCAG 3.3.1: a toast alone leaves the fields looking valid. Keeping the
  // error in state lets the inputs report themselves as invalid and lets the
  // message be tied to them with aria-describedby.
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user) {
      navigate("/tasks", { replace: true });
    }
  }, [authLoading, navigate, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setFormError(error.message);
      toast.error(error.message);
    } else {
      const { data: signedIn } = await supabase.auth.getUser();
      logUserActivity(signedIn.user?.id, "login", { details: { method: "password" } });
      // No success toast: landing on the tasks screen already says it worked,
      // and the toast covered the top of that screen on a phone.
      navigate("/tasks");
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error("אנא הזינו את כתובת האימייל שלכם");
      return;
    }
    setForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setForgotLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("קישור לאיפוס סיסמה נשלח לאימייל שלכם 📧");
    }
  };

  return (
    <div className="min-h-screen px-4 pt-2 md:flex md:items-center md:justify-center md:pt-0 relative overflow-hidden" dir="rtl">
      <div className="absolute inset-0 bg-muted" />
      <div className="absolute top-20 left-20 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-blob" />
      <div className="absolute bottom-20 right-20 w-80 h-80 bg-accent/10 rounded-full blur-3xl animate-blob animation-delay-2000" />

      <div className="relative z-10 mx-auto w-full max-w-md glass rounded-3xl shadow-glow p-8 border border-border animate-pop-in">
        <div className="flex flex-col items-center mb-8">
          <Link to="/">
            <BzbLogo className="w-20 h-20 mb-4" animate />
          </Link>
          <h1 className="text-2xl font-extrabold text-foreground">כניסה</h1>
        </div>

        <GoogleAuthButton />

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-muted-foreground text-sm font-medium">כניסה עם אימייל</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="email">אימייל</Label>
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className="mt-1 rounded-2xl h-12" dir="ltr" required aria-invalid={!!formError} aria-describedby={formError ? "login-error" : undefined} />
          </div>
          <div>
            <Label htmlFor="password">סיסמה</Label>
            <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="mt-1 rounded-2xl h-12" required aria-invalid={!!formError} aria-describedby={formError ? "login-error" : undefined} />
          </div>

          {formError && (
            <p id="login-error" role="alert" className="text-sm font-medium text-destructive">
              {formError}
            </p>
          )}

          <div className="flex justify-start">
            <button type="button" onClick={handleForgotPassword} disabled={forgotLoading} className="inline-flex min-h-11 items-center rounded px-2 text-sm text-primary-ink font-medium hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              {forgotLoading ? "שולחים..." : "שכחתם סיסמה?"}
            </button>
          </div>

          <Button type="submit" disabled={loading} className="w-full py-6 text-lg font-extrabold gradient-honey text-primary-foreground rounded-2xl border-none hover:scale-[1.02] transition-transform duration-300 mt-2">
            {loading ? "מתחבר..." : "כניסה 🐝"}
          </Button>

          <p className="text-center text-sm text-muted-foreground mt-2">
            עדיין לא רשומים?{" "}
            <Link to="/auth" className="text-primary-ink font-bold underline">
              הירשמו עכשיו
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Login;
