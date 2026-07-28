import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import BzbLogo from "@/components/BzbLogo";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSessionReady(Boolean(data.session));
    };

    void checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setSessionReady(Boolean(session));
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast.error("הסיסמה החדשה צריכה לכלול לפחות 6 תווים");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("שתי הסיסמאות לא תואמות");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("הסיסמה עודכנה בהצלחה");
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden" dir="rtl">
      <div className="absolute inset-0 bg-muted" />
      <div className="absolute top-20 left-20 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-blob" />
      <div className="absolute bottom-20 right-20 w-80 h-80 bg-accent/10 rounded-full blur-3xl animate-blob animation-delay-2000" />

      <div className="relative z-10 w-full max-w-md glass rounded-3xl shadow-glow p-8 border border-border animate-pop-in">
        <div className="flex flex-col items-center mb-8">
          <Link to="/">
            <BzbLogo className="w-20 h-20 mb-4" animate />
          </Link>
          <h1 className="text-2xl font-extrabold text-foreground">איפוס סיסמה</h1>
        </div>

        {!sessionReady ? (
          <div className="space-y-4 text-center">
            <p className="text-muted-foreground">
              כדי לאפס סיסמה צריך לפתוח את הקישור שנשלח לאימייל.
            </p>
            <Link to="/login">
              <Button variant="outline" className="w-full rounded-2xl h-12 font-bold">
                חזרה למסך הכניסה
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="password">סיסמה חדשה</Label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="mt-1 rounded-2xl h-12"
              />
            </div>

            <div>
              <Label htmlFor="confirmPassword">אימות סיסמה</Label>
              <PasswordInput
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="mt-1 rounded-2xl h-12"
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full py-6 text-lg font-extrabold gradient-honey text-primary-foreground rounded-2xl border-none">
              {loading ? "שומר..." : "שמירת סיסמה חדשה"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
