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
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden" dir="rtl">
      <div className="absolute inset-0 bg-muted" />
      <div className="absolute top-20 left-20 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-blob" />
      <div className="absolute bottom-20 right-20 w-80 h-80 bg-accent/10 rounded-full blur-3xl animate-blob animation-delay-2000" />

      <div className="relative z-10 w-full max-w-md glass rounded-3xl shadow-glow p-8 border border-border animate-pop-in">
        <div className="flex flex-col items-center mb-8">
          <Link to="/">
            <img src={bzbLogo} alt="BZB" className="w-20 h-20 mb-4 hover:animate-buzz transition-transform" />
          </Link>
          <h1 className="text-2xl font-extrabold text-foreground">כניסה</h1>
        </div>

        {/* Social Login */}
        <div className="flex flex-col gap-2 mb-6">
          {["Google", "Facebook", "Instagram"].map((provider) => (
            <Button key={provider} variant="outline" className="w-full py-5 rounded-2xl border-border text-foreground font-semibold hover:scale-[1.02] transition-transform duration-300">
              הכנס עם {provider}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-muted-foreground text-sm font-medium">או</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="username">שם משתמש</Label>
            <Input id="username" placeholder="שם משתמש" className="mt-1 rounded-2xl h-12" required />
          </div>
          <div>
            <Label htmlFor="password">סיסמה</Label>
            <Input id="password" type="password" placeholder="סיסמה" className="mt-1 rounded-2xl h-12" required />
          </div>

          <Button type="submit" className="w-full py-6 text-lg font-extrabold gradient-honey text-primary-foreground rounded-2xl border-none hover:scale-[1.02] transition-transform duration-300 mt-2">
            כניסה 🐝
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
