import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import BzbLogo from "@/components/BzbLogo";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff } from "lucide-react";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("התחברת בהצלחה! 🎉");
      navigate("/tasks");
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error("אנא הזן את כתובת האימייל שלך");
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
      toast.success("קישור לאיפוס סיסמה נשלח לאימייל שלך 📧");
    }
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
          <h1 className="text-2xl font-extrabold text-foreground">כניסה</h1>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-muted-foreground text-sm font-medium">כניסה עם אימייל</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="email">אימייל</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className="mt-1 rounded-2xl h-12" dir="ltr" required />
          </div>
          <div>
            <Label htmlFor="password">סיסמה</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="סיסמה" className="mt-1 rounded-2xl h-12" required />
          </div>

          <Button type="submit" disabled={loading} className="w-full py-6 text-lg font-extrabold gradient-honey text-primary-foreground rounded-2xl border-none hover:scale-[1.02] transition-transform duration-300 mt-2">
            {loading ? "מתחבר..." : "כניסה 🐝"}
          </Button>

          <p className="text-center text-sm text-muted-foreground mt-2">
            עדיין לא רשום?{" "}
            <Link to="/auth" className="text-primary font-bold underline">
              הירשם עכשיו
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Login;
