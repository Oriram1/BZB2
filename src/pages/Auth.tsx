import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import bzbLogo from "@/assets/bzb-logo.png";

const Auth = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted honeycomb-pattern px-4" dir="rtl">
      <div className="w-full max-w-md bg-card rounded-3xl shadow-honey p-8 border border-border">
        <div className="flex flex-col items-center mb-8">
          <img src={bzbLogo} alt="BZB" className="w-20 h-20 mb-4" />
          <h1 className="text-3xl font-bold text-foreground">ברוכים הבאים</h1>
          <p className="text-muted-foreground mt-1">Busy Bee 🐝</p>
        </div>

        <div className="flex flex-col gap-3">
          <Link to="/login">
            <Button className="w-full py-6 text-lg font-bold gradient-honey text-primary-foreground rounded-xl border-none hover:opacity-90 transition-opacity">
              כניסה
            </Button>
          </Link>
          <Link to="/register/proposer">
            <Button variant="outline" className="w-full py-6 text-lg font-semibold rounded-xl border-2 border-primary text-primary hover:bg-primary/5">
              הרשם כמציע מטלות
            </Button>
          </Link>
          <Link to="/register/worker">
            <Button variant="outline" className="w-full py-6 text-lg font-semibold rounded-xl border-2 border-secondary text-secondary-foreground hover:bg-secondary/10">
              הרשם לקבלת מטלות
            </Button>
          </Link>
          <Link to="/tasks">
            <Button variant="ghost" className="w-full py-6 text-lg text-muted-foreground hover:text-foreground">
              סיור כאורח 👀
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Auth;
