import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import BzbLogo from "@/components/BzbLogo";

const Auth = () => {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden" dir="rtl">
      {/* Animated background */}
      <div className="absolute inset-0 gradient-hero opacity-90" />
      <div className="absolute top-10 right-10 w-72 h-72 bg-accent/20 rounded-full blur-3xl animate-blob" />
      <div className="absolute bottom-10 left-10 w-96 h-96 bg-primary/15 rounded-full blur-3xl animate-blob animation-delay-2000" />

      <div className="relative z-10 w-full max-w-md glass rounded-3xl shadow-glow p-8 border border-primary-foreground/10 animate-pop-in">
        <div className="flex flex-col items-center mb-8">
          <img src={bzbLogo} alt="BZB" className="w-24 h-24 mb-4 animate-float" />
          <h1 className="text-3xl font-extrabold text-foreground">ברוכים הבאים</h1>
          <p className="text-muted-foreground mt-1 font-medium">Busy Bee 🐝</p>
        </div>

        <div className="flex flex-col gap-3">
          <Link to="/login">
            <Button className="w-full py-6 text-lg font-extrabold gradient-honey text-primary-foreground rounded-2xl border-none hover:scale-[1.02] transition-transform duration-300">
              כניסה 🔑
            </Button>
          </Link>
          <Link to="/pricing">
            <Button variant="outline" className="w-full py-6 text-lg font-bold rounded-2xl border-2 border-primary/40 text-foreground hover:bg-primary/5 hover:scale-[1.02] transition-transform duration-300">
              הרשם כמציע מטלות 📋
            </Button>
          </Link>
          <Link to="/register/worker">
            <Button variant="outline" className="w-full py-6 text-lg font-bold rounded-2xl border-2 border-secondary/40 text-foreground hover:bg-secondary/10 hover:scale-[1.02] transition-transform duration-300">
              הרשם לקבלת מטלות 💪
            </Button>
          </Link>
          <Link to="/tasks">
            <Button variant="ghost" className="w-full py-6 text-lg text-muted-foreground hover:text-foreground rounded-2xl">
              סיור כאורח 👀
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Auth;
