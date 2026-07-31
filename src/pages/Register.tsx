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
import { PasswordInput } from "@/components/ui/password-input";
import { normalizePhone, isValidPhone } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck } from "lucide-react";
import { isStrongPassword, passwordRequirementsMessage } from "@/lib/password";
import { PasswordStrength } from "@/components/PasswordStrength";
import { geocodeAddress } from "@/lib/geocodeAddress";
import AddressMapPreview from "@/components/tasks/AddressMapPreview";

const planLabels: Record<string, string> = {
  quarterly: "רבעוני (30 ₪ ל-3 חודשים)",
  annual: "שנתי (100 ₪ לשנה)",
};

/** Supabase returns English auth errors; show the common ones in Hebrew. */
const hebrewAuthError = (message: string): string => {
  const m = message.toLowerCase();
  if (m.includes("already registered") || m.includes("already been registered"))
    return "כתובת האימייל הזו כבר רשומה. אפשר להתחבר איתה או לבחור כתובת אחרת";
  if (m.includes("invalid format") || m.includes("validate email"))
    return "כתובת האימייל לא נראית תקינה";
  if (m.includes("password") && m.includes("6"))
    return "הסיסמה קצרה מדי. צריך לפחות 6 תווים";
  if (m.includes("rate limit") || m.includes("too many"))
    return "היו יותר מדי ניסיונות. כדאי לנסות שוב בעוד כמה דקות";
  return "ההרשמה לא הושלמה. כדאי לנסות שוב בעוד רגע";
};

/** Inline field error. role="alert" so screen readers announce it on submit. */
const FieldError = ({ id, message }: { id: string; message?: string }) =>
  message ? (
    <p id={`${id}-error`} role="alert" className="text-xs text-destructive font-medium mt-1">
      {message}
    </p>
  ) : null;

const Register = () => {
  const { role } = useParams<{ role: string }>();
  const [searchParams] = useSearchParams();
  const planId = searchParams.get("plan") || "";
  const isPaidPlan = planId === "quarterly" || planId === "annual";
  const navigate = useNavigate();
  const isWorker = role === "worker" || role === "bee";
  const isParent = role === "parent";
  const title = isWorker
    ? "הרשמה למבצעי מטלות 💪"
    : isParent
    ? "הרשמה להורים 🛡️"
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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressPosition, setAddressPosition] = useState<{ lat: number; lng: number } | null>(null);

  const updateField = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    // Clear the field's error as soon as the user starts fixing it.
    setErrors((e) => (e[key] ? { ...e, [key]: "" } : e));
  };

  const handleAddressBlur = async () => {
    if (!form.address.trim()) return;
    setAddressLoading(true);
    const formattedAddress = await geocodeAddress(form.address);
    if (formattedAddress) {
      updateField("address", formattedAddress.formattedAddress);
      setAddressPosition({ lat: formattedAddress.lat, lng: formattedAddress.lng });
    }
    setAddressLoading(false);
  };

  const minAge = isWorker ? 13 : 18;

  /** Every rule in one place. Returns a message per invalid field. */
  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.firstName.trim()) next.firstName = "חסר שם פרטי";
    if (!form.lastName.trim()) next.lastName = "חסר שם משפחה";

    const age = parseInt(form.age, 10);
    if (!form.age.trim()) next.age = "חסר גיל";
    else if (Number.isNaN(age) || age < minAge) next.age = `הגיל המינימלי להרשמה הוא ${minAge}`;
    else if (age > 120) next.age = "הגיל שהוזן לא נראה תקין";

    if (!form.address.trim()) next.address = "חסרה כתובת";

    if (!form.email.trim()) next.email = "חסרה כתובת אימייל";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim()))
      next.email = "כתובת האימייל לא נראית תקינה";

    if (!form.phone.trim()) next.phone = "חסר מספר טלפון";
    else if (!isValidPhone(form.phone)) next.phone = "מספר הטלפון לא תקין. לדוגמה: 050-000-0000";

    if (!form.password) next.password = "חסרה סיסמה";
    else if (!isStrongPassword(form.password)) next.password = passwordRequirementsMessage;

    if (!agreed) next.terms = "כדי להמשיך צריך לאשר את תנאי השימוש";

    return next;
  };

  const finishRegistration = async () => {
    setLoading(true);
    const appRole = isWorker ? "bee" : isParent ? "parent" : "tasker";
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { first_name: form.firstName, last_name: form.lastName, app_role: appRole },
      },
    });

    if (error) {
      toast.error(hebrewAuthError(error.message));
      setLoading(false);
      return;
    }

    if (data.user) {
      const { error: profileError } = await supabase.from("profiles").update({
        age: parseInt(form.age) || null,
        address: form.address,
        // Store a canonical 05XXXXXXXX form regardless of how it was typed.
        phone: normalizePhone(form.phone),
      }).eq("user_id", data.user.id);

      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: data.user.id,
        role: appRole as "bee" | "tasker" | "parent",
      });

      if (profileError) {
        toast.error("החשבון נוצר, אבל פרטי הפרופיל לא נשמרו במלואם");
      }

      if (roleError && roleError.code !== "23505") {
        toast.error("החשבון נוצר, אבל סוג המשתמש לא נשמר. כדאי לנסות להתחבר שוב.");
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    toast.success("ההרשמה נוצרה! בדקו את האימייל ואשרו את החשבון כדי להתחבר 📧");
    navigate("/login");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const found = validate();
    setErrors(found);

    const firstInvalid = Object.keys(found).find((key) => found[key]);
    if (firstInvalid) {
      // Send focus to the first problem so the user lands on it directly,
      // instead of hunting for what went wrong.
      const el = document.getElementById(firstInvalid === "terms" ? "terms" : firstInvalid);
      el?.focus();
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
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
    <div className="min-h-screen py-8 px-4 pb-[calc(9rem+env(safe-area-inset-bottom))] md:pb-8 relative overflow-hidden" dir="rtl">
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

        {/* noValidate: the browser's own check blocks submit and shows an English
            tooltip, which meant our Hebrew messages never ran. Validation is ours. */}
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="firstName">שם פרטי</Label>
              <Input id="firstName" value={form.firstName} onChange={(e) => updateField("firstName", e.target.value)} autoComplete="given-name" dir="auto" className="mt-1 rounded-2xl h-12" aria-invalid={!!errors.firstName} aria-describedby={errors.firstName ? "firstName-error" : undefined} />
              <FieldError id="firstName" message={errors.firstName} />
            </div>
            <div>
              <Label htmlFor="lastName">שם משפחה</Label>
              <Input id="lastName" value={form.lastName} onChange={(e) => updateField("lastName", e.target.value)} autoComplete="family-name" dir="auto" className="mt-1 rounded-2xl h-12" aria-invalid={!!errors.lastName} aria-describedby={errors.lastName ? "lastName-error" : undefined} />
              <FieldError id="lastName" message={errors.lastName} />
            </div>
          </div>
          <div>
            <Label htmlFor="age">גיל</Label>
            <Input id="age" type="text" inputMode="numeric" dir="ltr" value={form.age} onChange={(e) => updateField("age", e.target.value.replace(/\D/g, ""))} className="mt-1 rounded-2xl h-12" aria-invalid={!!errors.age} aria-describedby={errors.age ? "age-error" : "age-hint"} />
            {errors.age
              ? <FieldError id="age" message={errors.age} />
              : <p id="age-hint" className="text-xs text-muted-foreground mt-1">הגיל המינימלי להרשמה: {minAge}</p>}
          </div>
          <div>
            <Label htmlFor="address">כתובת</Label>
            <Input
              id="address"
              value={form.address}
              onChange={(e) => updateField("address", e.target.value)}
              onBlur={handleAddressBlur}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddressBlur(); } }}
              placeholder="רחוב, מספר ועיר"
              autoComplete="street-address"
              dir="auto"
              className="mt-1 rounded-2xl h-12"
              aria-invalid={!!errors.address}
              aria-describedby={errors.address ? "address-error" : undefined}
            />
            {addressLoading && <p className="text-xs text-muted-foreground mt-1">מאתר את הכתובת...</p>}
            {addressPosition && <div className="mt-3"><AddressMapPreview {...addressPosition} label={form.address} /></div>}
            <FieldError id="address" message={errors.address} />
          </div>
          <div>
            <Label htmlFor="email">אימייל</Label>
            <Input id="email" type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} placeholder="email@example.com" autoComplete="email" className="mt-1 rounded-2xl h-12" dir="ltr" aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} />
            <FieldError id="email" message={errors.email} />
          </div>
          <div>
            <Label htmlFor="phone">טלפון</Label>
            <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="050-000-0000" className="mt-1 rounded-2xl h-12" dir="ltr" aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "phone-error" : undefined} />
            <FieldError id="phone" message={errors.phone} />
          </div>
          <div>
            <Label htmlFor="password">סיסמה</Label>
            <PasswordInput
              id="password"
              value={form.password}
              onChange={(e) => updateField("password", e.target.value)}
              autoComplete="new-password"
              className="mt-1 rounded-2xl h-12"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "password-error" : "password-hint"}
            />
            <PasswordStrength password={form.password} />
            {errors.password
              ? <FieldError id="password" message={errors.password} />
              : <p id="password-hint" className="text-xs text-muted-foreground mt-1">{passwordRequirementsMessage}</p>}
          </div>

          <div className="mt-2">
            <div className="flex items-center gap-2">
              <Checkbox id="terms" checked={agreed} onCheckedChange={(v) => { setAgreed(v === true); setErrors((e) => ({ ...e, terms: "" })); }} aria-invalid={!!errors.terms} aria-describedby={errors.terms ? "terms-error" : undefined} />
              <Label htmlFor="terms" className="text-sm text-muted-foreground cursor-pointer">
                אנו מאשרים את{" "}
                <Link to="/terms" className="text-primary-ink font-bold underline" target="_blank">תנאי השימוש</Link>
                {" "}ואת{" "}
                <Link to="/privacy" className="text-primary-ink font-bold underline" target="_blank">מדיניות הפרטיות</Link>
              </Label>
            </div>
            <FieldError id="terms" message={errors.terms} />
          </div>

          {isPaidPlan && (
            <div className="bg-primary/5 border-2 border-primary/30 rounded-2xl p-4 mt-2">
              <div className="flex items-start gap-3">
                <Checkbox id="insurance" checked={insurance} onCheckedChange={(v) => setInsurance(v === true)} className="mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <ShieldCheck size={18} className="text-primary-ink" />
                    <Label htmlFor="insurance" className="text-base font-extrabold text-foreground cursor-pointer">
                      ביטוח מטלות
                    </Label>
                    <Badge className="bg-primary/10 text-primary-ink border-none rounded-full text-xs font-bold">
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
            {loading ? "נרשמים..." : isPaidPlan ? "אישור והמשך לתשלום 🐝" : "הירשמו 🐝"}
          </Button>

          <p className="text-center text-sm text-muted-foreground mt-2">
            כבר רשומים?{" "}
            <Link to="/login" className="text-primary-ink font-bold underline">
              התחברו
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
              לפני סיום, מומלץ להוסיף ביטוח מטלות בעלות של <span className="font-extrabold text-primary-ink">5 ₪ בלבד לחודש</span> —
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
