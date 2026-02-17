import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import bzbLogo from "@/assets/bzb-logo.png";
import { toast } from "sonner";

const Login = () => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("התחברת בהצלחה! 🎉");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted honeycomb-pattern px-4" dir="rtl">
      <div className="w-full max-w-md bg-card rounded-3xl shadow-honey p-8 border border-border">
        <div className="flex flex-col items-center mb-8">
          <Link to="/">
            <img src={bzbLogo} alt="BZB" className="w-20 h-20 mb-4" />
          </Link>
          <h1 className="text-2xl font-bold text-foreground">כניסה</h1>
        </div>

        {/* Social Login */}
        <div className="flex flex-col gap-2 mb-6">
          <Button variant="outline" className="w-full py-5 rounded-xl border-border text-foreground font-medium">
            הכנס עם Google
          </Button>
          <Button variant="outline" className="w-full py-5 rounded-xl border-border text-foreground font-medium">
            הכנס עם Facebook
          </Button>
          <Button variant="outline" className="w-full py-5 rounded-xl border-border text-foreground font-medium">
            הכנס עם Instagram
          </Button>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-muted-foreground text-sm">או</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="username">שם משתמש</Label>
            <Input id="username" placeholder="שם משתמש" className="mt-1 rounded-xl" required />
          </div>
          <div>
            <Label htmlFor="password">סיסמה</Label>
            <Input id="password" type="password" placeholder="סיסמה" className="mt-1 rounded-xl" required />
          </div>

          <Button type="submit" className="w-full py-6 text-lg font-bold gradient-honey text-primary-foreground rounded-xl border-none hover:opacity-90 transition-opacity mt-2">
            כניסה 🐝
          </Button>

          <p className="text-center text-sm text-muted-foreground mt-2">
            עדיין לא רשום?{" "}
            <Link to="/auth" className="text-primary font-medium underline">
              הירשם עכשיו
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Login;
