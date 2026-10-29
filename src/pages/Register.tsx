import { useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import BzbLogo from "@/components/BzbLogo";
import { toast } from "sonner";
import { PasswordInput } from "@/components/ui/password-input";
import { normalizePhone, isValidPhone, phoneIssue, ageIssue, MAX_AGE } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle } from "lucide-react";
import { isStrongPassword, passwordRequirementsMessage } from "@/lib/password";
import { PasswordStrength } from "@/components/PasswordStrength";
import { geocodeAddress } from "@/lib/geocodeAddress";
import GoogleMapPicker from "@/components/tasks/GoogleMapPicker";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import { useAuth } from "@/contexts/AuthContext";
import { getRoleHomePath } from "@/lib/roleNavigation";
import { logUserActivity } from "@/lib/activityLog";
import { formatPrice, periodShort, usePlans } from "@/lib/billing";
import { formFor, GENDER_LABEL, GENDER_OPTIONS, RECIPIENT, say, type Gender } from "@/lib/gender";


/** Supabase returns English auth errors; show the common ones in Hebrew. */
const hebrewAuthError = (message: string): string => {
  const m = message.toLowerCase();
  if (m.includes("already registered") || m.includes("already been registered"))
    return "לא ניתן להשלים הרשמה עם הפרטים האלה. אם כבר נרשמת, אפשר להתחבר או לאפס סיסמה";
  if (m.includes("database error saving new user"))
    return "לא ניתן להשלים הרשמה עם הפרטים האלה. אם כבר נרשמת, אפשר להתחבר או לאפס סיסמה";
  if (m.includes("weak_password") || m.includes("compromised") || m.includes("pwned"))
    return "הסיסמה הזו אינה בטוחה לשימוש. כדאי לבחור סיסמה אחרת וייחודית";
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

/** A numbered group of fields, so the long form reads as three short steps. */
const FormSection = ({ step, title, emoji, tone, children }: {
  step: number; title: string; emoji: string; tone: string; children: React.ReactNode;
}) => (
  <section className={`rounded-3xl p-4 ${tone}`} aria-labelledby={`section-${step}`}>
    <h2 id={`section-${step}`} className="mb-3 flex items-center gap-2 text-lg font-black text-foreground">
      <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full bg-foreground text-sm text-background">{step}</span>
      {title} <span aria-hidden="true">{emoji}</span>
    </h2>
    <div className="flex flex-col gap-4">{children}</div>
  </section>
);

const Register = () => {
  const { role } = useParams<{ role: string }>();
  const [searchParams] = useSearchParams();
  const planId = searchParams.get("plan") || "";
  const isPaidPlan = planId === "quarterly" || planId === "annual";
  const { plans: livePlans } = usePlans();
  const selectedPlan = isPaidPlan ? livePlans[planId] : undefined;
  // The price comes from the plans table; until it loads the plan is named without one.
  const planLabel = selectedPlan
    ? `${selectedPlan.name} (${formatPrice(selectedPlan.price)} ₪ ${periodShort(selectedPlan.periodMonths)})`
    : planId === "annual" ? "שנתי" : "רבעוני";
  const navigate = useNavigate();
  const { user, roles, refreshUserState } = useAuth();
  const isGoogleSignup =
    user?.app_metadata.provider === "google" ||
    user?.identities?.some((identity) => identity.provider === "google") === true;
  const isWorker = role === "worker" || role === "bee";
  const isParent = role === "parent";
  const requestedRole = isWorker ? "bee" : isParent ? "parent" : "tasker";
  const existingRole = roles[0];
  const title = isWorker
    ? "הרשמה למבצעי מטלות 💪"
    : isParent
    ? "הרשמה להורים 🛡️"
    : isPaidPlan
    ? `הרשמה למנוי ${planLabel}`
    : "הרשמה למציעי מטלות 📋";
  const [agreed, setAgreed] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ageTouched, setAgeTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [form, setForm] = useState({
    firstName: "", lastName: "", age: "", address: "", gender: "" as Gender | "",
    email: "", phone: "", password: "",
  });
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressPosition, setAddressPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [phoneTaken, setPhoneTaken] = useState(false);
  const [switchingRole, setSwitchingRole] = useState(false);

  const roleLabel = (value: string) => ({ tasker: "מציע מטלות", bee: "מבצע מטלות", parent: "הורה" }[value] || value);

  useEffect(() => {
    if (!isGoogleSignup || !user) return;
    const metadata = user.user_metadata;
    setForm((current) => ({
      ...current,
      email: current.email || user.email || "",
      firstName: current.firstName || metadata.full_name?.split(" ")[0] || metadata.name?.split(" ")[0] || "",
      lastName: current.lastName || metadata.full_name?.split(" ").slice(1).join(" ") || "",
    }));
  }, [isGoogleSignup, user]);

  /**
   * A shared number is legitimate here — a parent and child, or two siblings
   * using one phone — so this warns and lets the user through rather than
   * blocking. Admins get a screen listing the shared numbers to spot abuse.
   */
  useEffect(() => {
    const phone = normalizePhone(form.phone);
    if (!isValidPhone(phone)) {
      setPhoneTaken(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("phone", phone);
      if (!cancelled) setPhoneTaken((count ?? 0) > 0);
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.phone]);

  if (user && existingRole && existingRole !== requestedRole) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" dir="rtl">
        <section className="w-full max-w-md rounded-3xl border border-border bg-background p-8 text-center shadow-xl">
          <BzbLogo className="mx-auto mb-5 h-20 w-20" />
          <h1 className="text-2xl font-extrabold text-foreground">החשבון כבר רשום</h1>
          <p className="mt-4 text-muted-foreground">
            החשבון הזה רשום כ־{roleLabel(existingRole)}. האם לעבור ל־{roleLabel(requestedRole)}?
          </p>
          <div className="mt-7 flex gap-3">
            <Button variant="outline" className="flex-1 rounded-2xl" onClick={() => navigate(getRoleHomePath(existingRole), { replace: true })}>
              להישאר
            </Button>
            <Button
              className="flex-1 rounded-2xl gradient-honey text-primary-foreground"
              disabled={switchingRole}
              onClick={async () => {
                setSwitchingRole(true);
                const { error } = await supabase.rpc("switch_my_role", { target_role: requestedRole });
                setSwitchingRole(false);
                if (error) {
                  toast.error("לא ניתן להחליף תפקיד כרגע");
                  return;
                }
                logUserActivity(user?.id, "role_switched", { details: { role: requestedRole } });
                await refreshUserState();
                toast.success(`עברתם לתפקיד ${roleLabel(requestedRole)}`);
                navigate(getRoleHomePath(requestedRole), { replace: true });
              }}
            >
              {switchingRole ? "מחליפים..." : "כן, לעבור"}
            </Button>
          </div>
        </section>
      </div>
    );
  }

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

  const resolveAddressBeforeSubmit = async () => {
    if (!form.address.trim() || addressPosition) return addressPosition;
    setAddressLoading(true);
    const result = await geocodeAddress(form.address);
    setAddressLoading(false);
    if (!result) return null;
    updateField("address", result.formattedAddress);
    setAddressPosition({ lat: result.lat, lng: result.lng });
    return { lat: result.lat, lng: result.lng };
  };

  const minAge = isWorker ? 13 : 18;

  // Below the minimum age the form cannot be submitted at all. The message
  // waits until a second digit or until the field loses focus, so typing "18"
  // does not flash a warning at "1".
  // A phone number that can no longer become valid is flagged as it is typed;
  // one that is merely short waits until the field loses focus.
  const phoneProblem = phoneIssue(form.phone);
  const phoneLiveError =
    phoneProblem === "invalid" || (phoneProblem === "incomplete" && phoneTouched)
      ? "מספר הטלפון לא תקין. לדוגמה: 050-000-0000"
      : undefined;
  const ageProblem = ageIssue(form.age, minAge);
  const ageBelowMinimum = ageProblem === "below";
  const ageAboveMaximum = ageProblem === "above";
  const ageBlockMessage = ageAboveMaximum
    ? `אפשר להזין גיל עד ${MAX_AGE}`
    : ageBelowMinimum && (ageTouched || form.age.length >= 2)
      ? `הגיל המינימלי להרשמה הוא ${minAge}`
      : undefined;

  /** Every rule in one place. Returns a message per invalid field. */
  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.firstName.trim()) next.firstName = "חסר שם פרטי";
    if (!form.lastName.trim()) next.lastName = "חסר שם משפחה";

    const age = parseInt(form.age, 10);
    if (!form.age.trim()) next.age = "חסר גיל";
    else if (Number.isNaN(age) || age < minAge) next.age = `הגיל המינימלי להרשמה הוא ${minAge}`;
    else if (age > MAX_AGE) next.age = `אפשר להזין גיל עד ${MAX_AGE}`;

    if (!form.gender) next.gender = "צריך לבחור אחת מהאפשרויות";

    if (!form.address.trim() && !addressPosition) next.address = "בחרו מיקום במפה או הזינו כתובת";

    if (!form.email.trim()) next.email = "חסרה כתובת אימייל";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim()))
      next.email = "כתובת האימייל לא נראית תקינה";

    if (!form.phone.trim()) next.phone = "חסר מספר טלפון";
    else if (!isValidPhone(form.phone)) next.phone = "מספר הטלפון לא תקין. לדוגמה: 050-000-0000";

    if (!isGoogleSignup) {
      if (!form.password) next.password = "חסרה סיסמה";
      else if (!isStrongPassword(form.password)) next.password = passwordRequirementsMessage;
    }

    if (!agreed) next.terms = "כדי להמשיך צריך לאשר את תנאי השימוש";

    return next;
  };

  const finishRegistration = async (resolvedPosition = addressPosition) => {
    setLoading(true);
    const appRole = isWorker ? "bee" : isParent ? "parent" : "tasker";
    let data: { user: typeof user; session: unknown };
    let error: { message: string } | null = null;
    if (isGoogleSignup && user) {
      data = { user, session: null };
    } else {
      const signup = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { first_name: form.firstName, last_name: form.lastName, app_role: appRole },
        },
      });
      data = signup.data;
      error = signup.error;
    }

    if (error) {
      // Do not query account existence after an auth failure.
      toast.error(hebrewAuthError(error.message));
      setLoading(false);
      return;
    }

    if (data.user) {
      if (isGoogleSignup) {
        await supabase.auth.updateUser({
          data: { first_name: form.firstName, last_name: form.lastName, app_role: appRole },
        });
      }
      const { error: profileError } = await supabase.from("profiles").update({
        age: parseInt(form.age) || null,
        address: form.address || null,
        latitude: resolvedPosition?.lat ?? null,
        longitude: resolvedPosition?.lng ?? null,
        gender: (form.gender || "unspecified") as Gender,
        phone: normalizePhone(form.phone),
        marketing_consent: marketingConsent,
      }).eq("user_id", data.user.id);

      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: data.user.id,
        role: appRole as "bee" | "tasker" | "parent",
      });

      if (profileError) {
        toast.error("החשבון נוצר, אבל פרטי הפרופיל לא נשמרו במלואם");
      }

      logUserActivity(data.user.id, "signup", {
        details: { role: appRole, method: isGoogleSignup ? "google" : "password" },
      });

      if (roleError && roleError.code !== "23505") {
        toast.error("החשבון נוצר, אבל סוג המשתמש לא נשמר. כדאי לנסות להתחבר שוב.");
        setLoading(false);
        return;
      }
    }

    // The auth listener may have read roles before the insert above landed.
    if (data.session || isGoogleSignup) await refreshUserState();

    setLoading(false);

    // Email confirmation is currently off, so signUp returns a live session and
    // the user is already signed in. Branch on the session rather than assuming:
    // when confirmation is turned back on, this same code sends them to log in.
    // A paid plan picked before registering continues to the consent step and
    // the card page rather than dropping the customer on their home screen.
    const afterSignup = isPaidPlan && appRole === "tasker"
      ? `/pricing?plan=${planId}&checkout=1`
      : getRoleHomePath(appRole);

    if (isGoogleSignup) {
      toast.success("ברוכים הבאים ל־BZB! 🐝");
      navigate(afterSignup, { replace: true });
      return;
    }

    if (data.session) {
      toast.success("ברוכים הבאים ל־BZB! 🐝");
      navigate(afterSignup, { replace: true });
      return;
    }

    toast.success("ההרשמה נוצרה! בדקו את האימייל ואשרו את החשבון כדי להתחבר 📧");
    navigate("/login");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const found = validate();
    setErrors(found);

    const firstInvalid = Object.keys(found).find((key) => found[key]);
    if (firstInvalid) {
      window.requestAnimationFrame(() => errorSummaryRef.current?.focus());
      return;
    }

    const resolvedPosition = await resolveAddressBeforeSubmit();
    await finishRegistration(resolvedPosition);
  };

  const fieldClass = "mt-1 h-12 rounded-2xl border-2 bg-background text-base focus-visible:border-primary focus-visible:ring-primary";

  return (
    <div className="min-h-screen py-8 px-4 pb-[calc(9rem+env(safe-area-inset-bottom))] md:pb-8 relative overflow-hidden" dir="rtl">
      <div className="absolute inset-0 bg-muted" />
      <div className="absolute top-10 right-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-blob" />
      <div className="absolute bottom-10 left-10 w-80 h-80 bg-accent/10 rounded-full blur-3xl animate-blob animation-delay-2000" />

      <div className="relative z-10 w-full max-w-lg mx-auto rounded-[2rem] border-2 border-foreground/10 bg-background p-6 sm:p-8 shadow-[0_6px_0_0_hsl(var(--honey-dark)/0.35)] animate-pop-in">
        <div className="flex flex-col items-center mb-6 text-center">
          <Link to="/" className="mb-3 -rotate-6 rounded-3xl bg-secondary/40 p-2 transition-transform hover:rotate-0">
            <BzbLogo className="w-16 h-16" animate />
          </Link>
          <h1 className="text-3xl font-black text-foreground leading-tight">{title}</h1>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary-ink">
            ⏱️ לוקח בערך דקה
          </p>
        </div>

        {!isGoogleSignup && <div className="mb-5"><GoogleAuthButton role={isWorker ? "bee" : isParent ? "parent" : "tasker"} /></div>}

        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-0.5 rounded-full bg-border" />
          <span className="text-muted-foreground text-sm font-bold">או עם אימייל</span>
          <div className="flex-1 h-0.5 rounded-full bg-border" />
        </div>

        {/* noValidate: the browser's own check blocks submit and shows an English
            tooltip, which meant our Hebrew messages never ran. Validation is ours. */}
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground text-center">כל השדות חובה, למעט אישור קבלת עדכונים.</p>
          {Object.values(errors).some(Boolean) && (
            <div ref={errorSummaryRef} tabIndex={-1} role="alert" className="rounded-3xl border-2 border-destructive bg-destructive/5 p-4 text-sm text-foreground focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-destructive">
              <p className="font-black text-base">אופס, חסרים עוד כמה דברים 🙈</p>
              <ul className="mt-2 space-y-1.5">
                {Object.entries(errors).filter(([, message]) => message).map(([key, message]) => (
                  <li key={key} className="flex items-start gap-2">
                    <span aria-hidden="true" className="mt-0.5 text-destructive">●</span>
                    <a className="font-medium underline underline-offset-2" href={`#${key}`} onClick={(event) => { event.preventDefault(); document.getElementById(key)?.focus(); document.getElementById(key)?.scrollIntoView({ block: "center" }); }}>{message}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <FormSection step={1} title="קצת עליך" emoji="👋" tone="bg-secondary/20">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="firstName" className="font-bold">שם פרטי</Label>
                <Input id="firstName" value={form.firstName} onChange={(e) => updateField("firstName", e.target.value)} autoComplete="given-name" className={fieldClass} aria-invalid={!!errors.firstName} aria-describedby={errors.firstName ? "firstName-error" : undefined} />
                <FieldError id="firstName" message={errors.firstName} />
              </div>
              <div>
                <Label htmlFor="lastName" className="font-bold">שם משפחה</Label>
                <Input id="lastName" value={form.lastName} onChange={(e) => updateField("lastName", e.target.value)} autoComplete="family-name" className={fieldClass} aria-invalid={!!errors.lastName} aria-describedby={errors.lastName ? "lastName-error" : undefined} />
                <FieldError id="lastName" message={errors.lastName} />
              </div>
            </div>
            <div>
              <Label htmlFor="age" className="font-bold">גיל</Label>
              <Input id="age" type="text" inputMode="numeric" maxLength={3} dir="ltr" value={form.age} onBlur={() => setAgeTouched(true)} onChange={(e) => updateField("age", e.target.value.replace(/\D/g, ""))} className={`${fieldClass} max-w-[8rem]`} aria-invalid={!!(errors.age || ageBlockMessage)} aria-describedby={errors.age || ageBlockMessage ? "age-error" : "age-hint"} />
              {errors.age || ageBlockMessage
                ? <FieldError id="age" message={errors.age || ageBlockMessage} />
                : <p id="age-hint" className="text-xs text-muted-foreground mt-1">הגיל המינימלי להרשמה: {minAge}</p>}
            </div>
            <div>
              <Label htmlFor="gender" className="font-bold">מין</Label>
              {/* Asked at signup because Hebrew inflects every message the app
                  later sends. "מעדיפ/ה לא לציין" is a real answer — it reads in
                  the plural, the same as anyone we cannot identify. */}
              <div id="gender" role="radiogroup" aria-label="מין" className="mt-1 grid grid-cols-3 gap-2">
                {GENDER_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={form.gender === option}
                    onClick={() => updateField("gender", option)}
                    className={`h-12 rounded-2xl border-2 px-2 text-sm font-bold transition-all active:scale-95 ${
                      form.gender === option
                        ? "border-primary bg-primary text-primary-foreground shadow-[0_3px_0_0_hsl(var(--honey-dark))]"
                        : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:-translate-y-0.5"
                    }`}
                  >
                    {GENDER_LABEL[option]}
                  </button>
                ))}
              </div>
              {errors.gender && <FieldError id="gender" message={errors.gender} />}
            </div>
          </FormSection>

          <FormSection step={2} title="איפה גרים?" emoji="📍" tone="bg-primary/10">
            <div>
              <Label htmlFor="address" className="font-bold">כתובת</Label>
              <p className="text-xs text-muted-foreground mt-1">הכתובת משמשת להצגת מטלות באזור שלך.</p>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => updateField("address", e.target.value)}
                onBlur={handleAddressBlur}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddressBlur(); } }}
                placeholder="אפשר להזין כתובת או לבחור נקודה במפה"
                autoComplete="street-address"
                className={fieldClass}
                aria-invalid={!!errors.address}
                aria-describedby={errors.address ? "address-error" : undefined}
              />
              {addressLoading && <p className="text-xs text-muted-foreground mt-1">מאתר את הכתובת...</p>}
              <div className="mt-3">
                <GoogleMapPicker
                  lat={addressPosition?.lat ?? null}
                  lng={addressPosition?.lng ?? null}
                  onLocationSelect={(lat, lng) => setAddressPosition({ lat, lng })}
                  onAddressFound={(address) => updateField("address", address)}
                />
              </div>
              <FieldError id="address" message={errors.address} />
            </div>
          </FormSection>

          <FormSection step={3} title="איך נשארים בקשר?" emoji="💬" tone="bg-accent/25">
            <div>
              <Label htmlFor="email" className="font-bold">אימייל</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} placeholder="email@example.com" autoComplete="email" className={fieldClass} dir="ltr" aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} />
              <FieldError id="email" message={errors.email} />
            </div>
            <div>
              <Label htmlFor="phone" className="font-bold">טלפון</Label>
              <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onBlur={() => setPhoneTouched(true)} onChange={(e) => updateField("phone", e.target.value)} placeholder="050-000-0000" className={fieldClass} dir="ltr" aria-invalid={!!(errors.phone || phoneLiveError)} aria-describedby={errors.phone || phoneLiveError ? "phone-error" : undefined} />
              <FieldError id="phone" message={errors.phone || phoneLiveError} />
              {phoneTaken && !errors.phone && !phoneLiveError && (
                <p className="mt-1.5 flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-500">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>המספר הזה כבר רשום במערכת. אפשר להמשיך — אבל אם זו טעות, כדאי לתקן עכשיו.</span>
                </p>
              )}
            </div>
            {!isGoogleSignup && <div>
              <Label htmlFor="password" className="font-bold">סיסמה</Label>
              <PasswordInput
                id="password"
                value={form.password}
                onChange={(e) => updateField("password", e.target.value)}
                autoComplete="new-password"
                className={fieldClass}
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? "password-error" : "password-hint"}
              />
              <PasswordStrength password={form.password} />
              {errors.password
                ? <FieldError id="password" message={errors.password} />
                : <p id="password-hint" className="text-xs text-muted-foreground mt-1">{passwordRequirementsMessage}</p>}
            </div>}
          </FormSection>

          <div className="flex flex-col gap-3 rounded-3xl bg-muted/60 p-4">
            <div>
              <div className="flex items-center gap-2">
                <Checkbox id="terms" checked={agreed} onCheckedChange={(v) => { setAgreed(v === true); setErrors((e) => ({ ...e, terms: "" })); }} className="h-5 w-5 rounded-md" aria-invalid={!!errors.terms} aria-describedby={errors.terms ? "terms-error" : undefined} />
                <Label htmlFor="terms" className="text-sm text-muted-foreground cursor-pointer">
                  אנו מאשרים את{" "}
                  <Link to="/terms" className="text-primary-ink font-bold underline" target="_blank">תנאי השימוש</Link>
                  {" "}ואת{" "}
                  <Link to="/privacy" className="text-primary-ink font-bold underline" target="_blank">מדיניות הפרטיות</Link>
                </Label>
              </div>
              <FieldError id="terms" message={errors.terms} />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox id="marketing" checked={marketingConsent} onCheckedChange={(v) => setMarketingConsent(v === true)} className="h-5 w-5 rounded-md" />
              <Label htmlFor="marketing" className="text-sm text-muted-foreground cursor-pointer">
                אני {say(formFor(form.gender), RECIPIENT.agree)} לקבל עדכונים, הצעות ודברי פרסומת מ-BZB בדוא"ל, SMS והודעות פוש (רשות)
              </Label>
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full h-14 text-xl font-black gradient-honey text-primary-foreground rounded-2xl border-none shadow-[0_5px_0_0_hsl(var(--honey-dark))] transition-all duration-150 hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_1px_0_0_hsl(var(--honey-dark))]">
            {loading ? "נרשמים..." : isPaidPlan ? "אישור והמשך לתשלום 🐝" : "יאללה, נרשמים! 🐝"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            כבר רשומים?{" "}
            <Link to="/login" className="text-primary-ink font-bold underline">
              התחברו
            </Link>
          </p>
        </form>
      </div>

    </div>
  );
};

export default Register;

