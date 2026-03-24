import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import bzbLogo from "@/assets/bzb-logo.png";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const Register = () => {
  const { role } = useParams<{ role: string }>();
  const navigate = useNavigate();
  const isWorker = role === "worker";
  const title = isWorker ? "הרשמה למבצעי מטלות 💪" : "הרשמה למציעי מטלות 📋";
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    firstName: "", lastName: "", age: "", address: "",
    email: "", phone: "", password: "",
  });

  const updateField = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      toast.error("יש לאשר את תנאי השימוש");
      return;
    }
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          first_name: form.firstName,
          last_name: form.lastName,
        },
      },
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      // Update profile with additional fields
      await supabase.from("profiles").update({
        age: parseInt(form.age) || null,
        address: form.address,
        phone: form.phone,
      }).eq("user_id", data.user.id);

      // Assign role
      const appRole = isWorker ? "bee" : "tasker";
      await supabase.from("user_roles").insert({
        user_id: data.user.id,
        role: appRole as "bee" | "tasker" | "parent",
      });
    }

    setLoading(false);
    toast.success("ההרשמה בוצעה בהצלחה! 🎉");
    navigate("/tasks");
  };

  return (
    <div className="min-h-screen py-8 px-4 relative overflow-hidden" dir="rtl">
      <div className="absolute inset-0 bg-muted" />
      <div className="absolute top-10 right-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-blob" />
      <div className="absolute bottom-10 left-10 w-80 h-80 bg-accent/10 rounded-full blur-3xl animate-blob animation-delay-2000" />

      <div className="relative z-10 w-full max-w-lg mx-auto glass rounded-3xl shadow-glow p-8 border border-border animate-pop-in">
        <div className="flex flex-col items-center mb-6">
          <Link to="/">
            <img src={bzbLogo} alt="BZB" className="w-16 h-16 mb-3 hover:animate-buzz" />
          </Link>
          <h1 className="text-2xl font-extrabold text-foreground">{title}</h1>
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

          <Button type="submit" disabled={loading} className="w-full py-6 text-lg font-extrabold gradient-honey text-primary-foreground rounded-2xl border-none hover:scale-[1.02] transition-transform duration-300 mt-2">
            {loading ? "נרשם..." : "הרשם 🐝"}
          </Button>

          <p className="text-center text-sm text-muted-foreground mt-2">
            כבר רשום?{" "}
            <Link to="/login" className="text-primary font-bold underline">
              התחבר
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Register;
