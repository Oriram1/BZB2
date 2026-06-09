import { useState } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import BzbLogo from "@/components/BzbLogo";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck } from "lucide-react";

const planLabels: Record<string, string> = {
  quarterly: "רבעוני (30 ₪ ל-3 חודשים)",
  annual: "שנתי (100 ₪ לשנה)",
};

const Register = () => {
  const { role } = useParams<{ role: string }>();
  const [searchParams] = useSearchParams();
  const planId = searchParams.get("plan") || "";
  const isPaidPlan = planId === "quarterly" || planId === "annual";
  const navigate = useNavigate();
  const isWorker = role === "worker";
  const title = isWorker
    ? "הרשמה למבצעי מטלות 💪"
    : isPaidPlan
    ? `הרשמה למנוי ${planLabels[planId]}`
    : "הרשמה למציעי מטלות 📋";
  const [agreed, setAgreed] = useState(false);
  const [insurance, setInsurance] = useState(false);
  const [showInsurancePopup, setShowInsurancePopup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    firstName: "", lastName: "", age: "", address: "",
    email: "", phone: "", password: "",
  });

  const updateField = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const finishRegistration = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { first_name: form.firstName, last_name: form.lastName },
      },
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      await supabase.from("profiles").update({
        age: parseInt(form.age) || null,
        address: form.address,
        phone: form.phone,
      }).eq("user_id", data.user.id);

      const appRole = isWorker ? "bee" : "tasker";
      await supabase.from("user_roles").insert({
        user_id: data.user.id,
        role: appRole as "bee" | "tasker" | "parent",
      });
    }

    setLoading(false);
    toast.success(
      insurance
        ? "ההרשמה בוצעה בהצלחה כולל ביטוח מטלות! 🛡️🎉"
        : "ההרשמה בוצעה בהצלחה! 🎉"
    );
    navigate("/tasks");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      toast.error("יש לאשר את תנאי השימוש");
      return;
    }
    // For paid plans, if insurance not yet selected, show popup offer first
    if (isPaidPlan && !insurance) {
      setShowInsurancePopup(true);
      return;
    }
    await finishRegistration();
  };

  return (
    <div className="min-h-screen py-8 px-4 relative overflow-hidden" dir="rtl">
      <div className="absolute inset-0 bg-muted" />
      <div className="absolute top-10 right-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-blob" />
      <div className="absolute bottom-10 left-10 w-80 h-80 bg-accent/10 rounded-full blur-3xl animate-blob animation-delay-2000" />

      <div className="relative z-10 w-full max-w-lg mx-auto glass rounded-3xl shadow-glow p-8 border border-border animate-pop-in">
        <div className="flex flex-col items-center mb-6">
          <Link to="/">
            <BzbLogo className="w-16 h-16 mb-3" animate />
          </Link>
          <h1 className="text-2xl font-extrabold text-foreground text-center">{title}</h1>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-muted-foreground text-sm font-medium">הרשמה עם אימייל</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="firstName">שם פרטי</Label>
              <Input id="firstName" value={form.firstName} onChange={(e) => updateField("firstName", e.target.value)} placeholder="שם פרטי" className="mt-1 rounded-2xl h-12" required />
            </div>
            <div>
              <Label htmlFor="lastName">שם משפחה</Label>
              <Input id="lastName" value={form.lastName} onChange={(e) => updateField("lastName", e.target.value)} placeholder="שם משפחה" className="mt-1 rounded-2xl h-12" required />
            </div>
          </div>
          <div>
            <Label htmlFor="age">גיל</Label>
            <Input id="age" type="number" value={form.age} onChange={(e) => updateField("age", e.target.value)} placeholder="גיל" className="mt-1 rounded-2xl h-12" required min={isWorker ? 13 : 18} />
          </div>
          <div>
            <Label htmlFor="address">כתובת</Label>
            <Input id="address" value={form.address} onChange={(e) => updateField("address", e.target.value)} placeholder="כתובת מלאה" className="mt-1 rounded-2xl h-12" required />
          </div>
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} placeholder="email@example.com" className="mt-1 rounded-2xl h-12" dir="ltr" required />
          </div>
          <div>
            <Label htmlFor="phone">טלפון</Label>
            <Input id="phone" type="tel" value={form.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="050-0000000" className="mt-1 rounded-2xl h-12" dir="ltr" required />
          </div>
          <div>
            <Label htmlFor="password">סיסמה</Label>
            <Input id="password" type="password" value={form.password} onChange={(e) => updateField("password", e.target.value)} placeholder="סיסמה (מינימום 6 תווים)" className="mt-1 rounded-2xl h-12" required minLength={6} />
          </div>

          <div className="flex items-center gap-2 mt-2">
            <Checkbox id="terms" checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} />
            <Label htmlFor="terms" className="text-sm text-muted-foreground cursor-pointer">
              אני מאשר/ת את{" "}
              <Link to="/terms" className="text-primary font-bold underline" target="_blank">תנאי השימוש</Link>
              {" "}ואת{" "}
              <Link to="/privacy" className="text-primary font-bold underline" target="_blank">מדיניות הפרטיות</Link>
            </Label>
          </div>

          {isPaidPlan && (
            <div className="bg-primary/5 border-2 border-primary/30 rounded-2xl p-4 mt-2">
              <div className="flex items-start gap-3">
                <Checkbox id="insurance" checked={insurance} onCheckedChange={(v) => setInsurance(v === true)} className="mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <ShieldCheck size={18} className="text-primary" />
                    <Label htmlFor="insurance" className="text-base font-extrabold text-foreground cursor-pointer">
                      ביטוח מטלות
                    </Label>
                    <Badge className="bg-primary/10 text-primary border-none rounded-full text-xs font-bold">
                      5 ₪/חודש
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 font-medium">
                    כיסוי נזקים שעלולים להתרחש במהלך ביצוע המטלה. מומלץ במיוחד למנויים בתשלום.
                  </p>
                </div>
              </div>
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full py-6 text-lg font-extrabold gradient-honey text-primary-foreground rounded-2xl border-none hover:scale-[1.02] transition-transform duration-300 mt-2">
            {loading ? "נרשם..." : isPaidPlan ? "אישור והמשך לתשלום 🐝" : "הרשם 🐝"}
          </Button>

          <p className="text-center text-sm text-muted-foreground mt-2">
            כבר רשום?{" "}
            <Link to="/login" className="text-primary font-bold underline">
              התחבר
            </Link>
          </p>
        </form>
      </div>

      {/* Insurance popup banner after confirm */}
      <Dialog open={showInsurancePopup} onOpenChange={setShowInsurancePopup}>
        <DialogContent className="max-w-md rounded-3xl border-2 border-primary/40 shadow-glow" dir="rtl">
          <DialogHeader>
            <div className="mx-auto mb-2 w-16 h-16 rounded-full gradient-honey flex items-center justify-center animate-pop-in">
              <ShieldCheck size={32} className="text-primary-foreground" />
            </div>
            <DialogTitle className="text-center text-2xl font-extrabold">
              להוסיף ביטוח מטלות? 🛡️
            </DialogTitle>
            <DialogDescription className="text-center text-base font-medium text-muted-foreground pt-2">
              לפני סיום, מומלץ להוסיף ביטוח מטלות בעלות של <span className="font-extrabold text-primary">5 ₪ בלבד לחודש</span> —
              כיסוי לנזקים שעלולים להתרחש במהלך ביצוע המטלות.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-col gap-2 mt-4">
            <Button
              onClick={async () => {
                setInsurance(true);
                setShowInsurancePopup(false);
                await finishRegistration();
              }}
              className="w-full py-6 text-base font-extrabold gradient-honey text-primary-foreground rounded-2xl border-none hover:scale-[1.02] transition-transform"
            >
              כן, הוסף ביטוח (5 ₪/חודש) 🛡️
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                setShowInsurancePopup(false);
                await finishRegistration();
              }}
              className="w-full py-5 text-sm font-bold text-muted-foreground rounded-2xl"
            >
              לא תודה, המשך ללא ביטוח
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Register;
