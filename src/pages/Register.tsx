import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import bzbLogo from "@/assets/bzb-logo.png";
import { toast } from "sonner";

const Register = () => {
  const { role } = useParams<{ role: string }>();
  const isWorker = role === "worker";
  const title = isWorker ? "הרשמה למבצעי מטלות 💪" : "הרשמה למציעי מטלות 📋";
  const [agreed, setAgreed] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      toast.error("יש לאשר את תנאי השימוש");
      return;
    }
    toast.success("ההרשמה בוצעה בהצלחה! 🎉");
  };

  return (
    <div className="min-h-screen bg-muted honeycomb-pattern py-8 px-4" dir="rtl">
      <div className="w-full max-w-lg mx-auto bg-card rounded-3xl shadow-honey p-8 border border-border">
        <div className="flex flex-col items-center mb-6">
          <Link to="/">
            <img src={bzbLogo} alt="BZB" className="w-16 h-16 mb-3" />
          </Link>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        </div>

        {/* Social Login */}
        <div className="flex flex-col gap-2 mb-6">
          <Button variant="outline" className="w-full py-5 rounded-xl border-border text-foreground font-medium">
            הרשם עם Google
          </Button>
          <Button variant="outline" className="w-full py-5 rounded-xl border-border text-foreground font-medium">
            הרשם עם Facebook
          </Button>
          <Button variant="outline" className="w-full py-5 rounded-xl border-border text-foreground font-medium">
            הרשם עם Instagram
          </Button>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-muted-foreground text-sm">או</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="firstName">שם פרטי</Label>
              <Input id="firstName" placeholder="שם פרטי" className="mt-1 rounded-xl" required />
            </div>
            <div>
              <Label htmlFor="lastName">שם משפחה</Label>
              <Input id="lastName" placeholder="שם משפחה" className="mt-1 rounded-xl" required />
            </div>
          </div>
          <div>
            <Label htmlFor="age">גיל</Label>
            <Input id="age" type="number" placeholder="גיל" className="mt-1 rounded-xl" required min={isWorker ? 13 : 18} />
          </div>
          <div>
            <Label htmlFor="address">כתובת</Label>
            <Input id="address" placeholder="כתובת מלאה" className="mt-1 rounded-xl" required />
          </div>
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" placeholder="email@example.com" className="mt-1 rounded-xl" dir="ltr" required />
          </div>
          <div>
            <Label htmlFor="phone">טלפון</Label>
            <Input id="phone" type="tel" placeholder="050-0000000" className="mt-1 rounded-xl" dir="ltr" required />
          </div>
          <div>
            <Label htmlFor="username">שם משתמש</Label>
            <Input id="username" placeholder="שם משתמש" className="mt-1 rounded-xl" required />
          </div>
          <div>
            <Label htmlFor="password">סיסמה</Label>
            <Input id="password" type="password" placeholder="סיסמה" className="mt-1 rounded-xl" required />
          </div>

          <div className="flex items-center gap-2 mt-2">
            <Checkbox
              id="terms"
              checked={agreed}
              onCheckedChange={(v) => setAgreed(v === true)}
            />
            <Label htmlFor="terms" className="text-sm text-muted-foreground cursor-pointer">
              אני מאשר/ת את{" "}
              <span className="text-primary underline">תנאי השימוש</span>
            </Label>
          </div>

          <Button type="submit" className="w-full py-6 text-lg font-bold gradient-honey text-primary-foreground rounded-xl border-none hover:opacity-90 transition-opacity mt-2">
            הרשם 🐝
          </Button>

          <p className="text-center text-sm text-muted-foreground mt-2">
            כבר רשום?{" "}
            <Link to="/login" className="text-primary font-medium underline">
              התחבר
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Register;
