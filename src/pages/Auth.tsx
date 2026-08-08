import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import BzbLogo from "@/components/BzbLogo";

const Auth = () => {
  const [searchParams] = useSearchParams();
  const isGoogleOnboarding = searchParams.get("google") === "1";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden" dir="rtl">
      {/* Animated background */}
      <div className="absolute inset-0 gradient-hero opacity-90" />
      <div className="absolute top-10 right-10 w-72 h-72 bg-accent/20 rounded-full blur-3xl animate-blob" />
      <div className="absolute bottom-10 left-10 w-96 h-96 bg-primary/15 rounded-full blur-3xl animate-blob animation-delay-2000" />

      <div className="relative z-10 w-full max-w-md glass rounded-3xl shadow-glow p-8 border border-primary-foreground/10 animate-pop-in">
        <div className="flex flex-col items-center mb-8">
          <BzbLogo className="w-24 h-24 mb-4 animate-float" />
          <h1 className="text-3xl font-extrabold text-foreground">ברוכים הבאים</h1>
          <p className="text-muted-foreground mt-1 font-medium">Busy Bee 🐝</p>
          {isGoogleOnboarding && <p className="text-primary-ink mt-3 text-sm font-bold">החשבון מוכן. בחרו איך להשתמש ב־BZB:</p>}
        </div>

        <div className="flex flex-col gap-3">
          <Button className="w-full py-6 text-lg font-extrabold gradient-honey text-primary-foreground rounded-2xl border-none hover:scale-[1.02] transition-transform duration-300" asChild>
<Link to="/login">כניסה 🔑</Link>
</Button>
          <Button variant="outline" className="w-full py-6 text-lg font-bold rounded-2xl border-2 border-primary/40 text-foreground hover:bg-primary/5 hover:scale-[1.02] transition-transform duration-300" asChild>
<Link to="/register/tasker">הרשם כמציע מטלות 📋</Link>
</Button>
          <Button variant="outline" className="w-full py-6 text-lg font-bold rounded-2xl border-2 border-secondary/40 text-foreground hover:bg-secondary/10 hover:scale-[1.02] transition-transform duration-300" asChild>
<Link to="/register/worker">הרשם לקבלת מטלות 💪</Link>
</Button>
          <Button variant="ghost" className="w-full py-6 text-lg text-muted-foreground hover:text-foreground rounded-2xl" asChild>
<Link to="/tasks">סיור כאורח 👀</Link>
</Button>
        </div>

        {/* Parents are recipients, not users — there is nothing here for them
            to sign up for. Said plainly so nobody goes looking for the button
            that used to be here. */}
        <p className="mt-6 text-center text-sm text-muted-foreground leading-relaxed">
          🛡️ הורה? אין צורך להירשם.
          <br />
          הילד/ה מוסיף/ה את כתובת המייל שלכם מהפרופיל, ותקבלו עדכון כשהוא/היא מתחבר/ת.
        </p>
      </div>
    </div>
  );
};

export default Auth;
