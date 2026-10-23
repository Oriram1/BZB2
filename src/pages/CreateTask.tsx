import PaymentSummaryDialog from "@/components/billing/PaymentSummaryDialog";
import { openPaymentTab, PAYMENT_POPUP_BLOCKED, PAYMENT_TAB_OPENED, type PaymentTab } from "@/lib/paymentTab";
import { useEffect, useState } from "react";
import { addDays, addMonths, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNavigate, useSearchParams } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Check, Tag, FileText, DollarSign, MapPin, Image, StickyNote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { categories, categoryLabel } from "@/lib/categories";
import { geocodeAddress } from "@/lib/geocodeAddress";
import GoogleMapPicker from "@/components/tasks/GoogleMapPicker";
import { logUserActivity } from "@/lib/activityLog";
import { billingErrorText, payTaskOnce, startTaskCardSetup, TASK_DRAFT_KEY, type PublishQuote } from "@/lib/taskBilling";
import { feeText, useTaskFees } from "@/lib/taskFees";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Kept in step with the tasks_short_desc_length constraint on public.tasks. */
const SHORT_DESC_MAX = 120;

const steps = [
  { id: 1, label: "קטגוריה", icon: Tag },
  { id: 2, label: "פרטים", icon: FileText },
  { id: 3, label: "תשלום", icon: DollarSign },
  { id: 4, label: "תיאום", icon: MapPin },
  { id: 5, label: "תוספות", icon: Image },
  { id: 6, label: "סיכום", icon: Check },
];

/**
 * How a paid task is paid:
 *   saved_card  charged on approval
 *   new_card    a new card is saved on Cardcom now, charged on approval
 *   wallet/bit  paid now on Cardcom's page, refunded if the task is rejected
 */
type TaskPaymentChoice = "saved_card" | "new_card" | "wallet" | "bit";

const CreateTask = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const onSummary = step === 6;
  const [cardSetupOpen, setCardSetupOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    category: "", taskName: "", shortDesc: "", fullDesc: "",
    payment: "", paymentType: "task", workers: "1",
    location: "", date: "", time: "", duration: "", durationUnit: "days", expiry: "3",
    notes: "",
  });
  const [selectedLat, setSelectedLat] = useState<number | null>(null);
  const [selectedLng, setSelectedLng] = useState<number | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [insurance, setInsurance] = useState(false);
  const [quote, setQuote] = useState<PublishQuote | null>(null);
  const fees = useTaskFees();
  const [paymentMode, setPaymentMode] = useState<TaskPaymentChoice>("saved_card");
  const [confirmQuote, setConfirmQuote] = useState<PublishQuote | null>(null);
  const [searchParams] = useSearchParams();
  const [restoredImageUrl, setRestoredImageUrl] = useState<string | null>(null);
  const today = new Date();
  const minimumDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const dateShortcuts = [
    { label: "מחר", value: format(addDays(today, 1), "yyyy-MM-dd") },
    { label: "בעוד שבוע", value: format(addDays(today, 7), "yyyy-MM-dd") },
    { label: "בעוד חודש", value: format(addMonths(today, 1), "yyyy-MM-dd") },
  ];
  const shortcutClass = (selected: boolean) => `h-11 min-w-0 gap-1 rounded-xl px-1.5 text-xs font-bold transition-colors ${selected ? "border-primary bg-primary/10 text-primary-ink hover:bg-primary/15" : "border-border bg-background/70 text-muted-foreground hover:text-foreground"}`;

  const updateForm = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  // What this task will cost, from the database. The same function the insert
  // trigger uses, so the preview and the charge cannot disagree.
  useEffect(() => {
    if (!user) return;
    let active = true;
    void (async () => {
      const { data, error } = await supabase.rpc("my_publish_quote", { _insurance: insurance });
      if (active && !error && data) setQuote(data as unknown as PublishQuote);
    })();
    return () => {
      active = false;
    };
  }, [user, insurance, onSummary]);

  // Coming back from Cardcom after saving a card: put the form back and let the
  // person press publish.
  useEffect(() => {
    if (searchParams.get("resume") !== "1") return;
    try {
      const raw = sessionStorage.getItem(TASK_DRAFT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        form: typeof form; lat: number | null; lng: number | null; insurance: boolean; imageUrl: string | null;
      };
      setForm(saved.form);
      setSelectedLat(saved.lat);
      setSelectedLng(saved.lng);
      setInsurance(saved.insurance);
      setRestoredImageUrl(saved.imageUrl);
      setStep(6);
      sessionStorage.removeItem(TASK_DRAFT_KEY);
      toast.success("הכרטיס נשמר. אפשר לפרסם את המטלה");
    } catch {
      /* storage unavailable: the person starts again */
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLocationBlur = async () => {
    if (!form.location.trim()) return;
    setLocationLoading(true);
    const formattedAddress = await geocodeAddress(form.location);
    if (formattedAddress) {
      updateForm("location", formattedAddress.formattedAddress);
      setSelectedLat(formattedAddress.lat);
      setSelectedLng(formattedAddress.lng);
    }
    setLocationLoading(false);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("ניתן להעלות רק תמונות (JPEG, PNG, GIF, WebP)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("גודל הקובץ חייב להיות עד 5MB");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile || !user) return null;
    setUploadingImage(true);
    const ext = imageFile.name.split(".").pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("task-images").upload(path, imageFile);
    setUploadingImage(false);
    if (error) {
      toast.error("שגיאה בהעלאת התמונה");
      return null;
    }
    const { data: signed } = await supabase.storage
      .from("task-images")
      .createSignedUrl(path, 60 * 60 * 24);
    return signed?.signedUrl ?? null;
  };

  const canProceed = () => {
    switch (step) {
      case 1: return !!form.category;
      case 2: return !!form.taskName && !!form.shortDesc && form.shortDesc.length <= SHORT_DESC_MAX;
      case 3: return !!form.payment;
      case 4: {
        const duration = Number(form.duration);
        const validDuration = !form.duration || (duration >= 1 && duration <= 30);
        return !!form.location && !!form.date && !!form.time && validDuration;
      }
      default: return true;
    }
  };

  /**
   * What the publish button does. A paid task with a card already on file asks
   * for a confirmation first, spelling out what will be charged and when;
   * everything else goes straight to publishing.
   */
  const handleSubmit = async () => {
    if (!user) {
      toast.error("יש להתחבר כדי לפרסם מטלה");
      navigate("/login");
      return;
    }
    const { data: fresh } = await supabase.rpc("my_publish_quote", { _insurance: insurance });
    const latest = (fresh as unknown as PublishQuote | null) ?? quote;
    if (latest) setQuote(latest);
    if (latest && !latest.billing_off && latest.due > 0) {
      setPaymentMode(latest.has_card ? "saved_card" : "new_card");
      setConfirmQuote(latest);
      return;
    }
    await publishTask();
  };

  const beginCardSetup = () => {
    const paymentTab = openPaymentTab();
    if (!paymentTab) { toast.error(PAYMENT_POPUP_BLOCKED); return; }
    void publishTask(paymentTab);
  };

  /** Runs inside the click, so the payment tab is opened before any await. */
  const confirmPayment = () => {
    const choice = paymentMode;
    setConfirmQuote(null);
    if (choice === "saved_card") {
      void publishTask(undefined, choice);
      return;
    }
    const paymentTab = openPaymentTab();
    if (!paymentTab) { toast.error(PAYMENT_POPUP_BLOCKED); return; }
    void publishTask(paymentTab, choice);
  };

  const publishTask = async (paymentTab?: PaymentTab, choice: TaskPaymentChoice = "saved_card") => {
    if (!user) {
      toast.error("יש להתחבר כדי לפרסם מטלה");
      navigate("/login");
      return;
    }
    setLoading(true);
    let imageUrl: string | null = restoredImageUrl;
    if (imageFile) {
      imageUrl = await uploadImage();
    }

    // The quote on screen can be stale (billing switched on, or the free task
    // used elsewhere, since the page loaded). Ask again before deciding whether
    // a card is needed; the insert trigger enforces the same answer.
    let currentQuote = quote;
    const { data: fresh } = await supabase.rpc("my_publish_quote", { _insurance: insurance });
    if (fresh) {
      currentQuote = fresh as unknown as PublishQuote;
      setQuote(currentQuote);
    }

    const paysNow = choice === "wallet" || choice === "bit";
    // A paid task is charged to a saved card once it is approved, so the card
    // has to be on file before it can be submitted. A new card is saved first,
    // and the form waits for it.
    if (!paysNow && currentQuote && !currentQuote.billing_off && currentQuote.due > 0
        && (choice === "new_card" || !currentQuote.has_card)) {
      try {
        sessionStorage.setItem(
          TASK_DRAFT_KEY,
          JSON.stringify({ form, lat: selectedLat, lng: selectedLng, insurance, imageUrl }),
        );
      } catch {
        /* the person re-enters the form if storage is blocked */
      }
      if (!paymentTab) {
        setLoading(false);
        setCardSetupOpen(true);
        return;
      }
      const setup = await startTaskCardSetup();
      setLoading(false);
      if (setup.ok) {
        const opened = paymentTab.navigate(setup.url);
        setCardSetupOpen(false);
        if (opened) toast.info(PAYMENT_TAB_OPENED);
        else toast.error("דף התשלום נסגר או לא זמין. אפשר לנסות שוב.");
        return;
      }
      paymentTab.close();
      toast.error("לא הצלחנו לפתוח את דף התשלום. לא בוצע חיוב. אפשר לנסות שוב.");
      return;
    }

    const prepay = paysNow && !!currentQuote && !currentQuote.billing_off && currentQuote.due > 0;
    if (!prepay) paymentTab?.close();
    const { data: created, error } = await supabase.from("tasks").insert({
      creator_id: user.id,
      category: form.category as "housework" | "handyman" | "tutoring" | "babysitting" | "pets" | "gardening" | "other",
      name: form.taskName,
      short_desc: form.shortDesc,
      full_desc: form.fullDesc || null,
      payment: parseFloat(form.payment) || 0,
      payment_type: form.paymentType as "task" | "hour",
      workers_needed: parseInt(form.workers) || 1,
      location: form.location,
      latitude: selectedLat,
      longitude: selectedLng,
      scheduled_date: form.date || null,
      scheduled_time: form.time || null,
      duration_hours: form.duration ? parseFloat(form.duration) * 24 : null,
      expiry_hours: (parseInt(form.expiry) || 3) * 24,
      notes: form.notes || null,
      image_url: imageUrl,
      insurance,
      payment_mode: prepay ? "one_time" : "saved_card",
    }).select("id").maybeSingle();
    if (error || !prepay) setLoading(false);
    if (error) {
      paymentTab?.close();
      toast.error(publishErrorMessage(error));
    } else {
      logUserActivity(user.id, "task_created", {
        entityType: "task",
        entityId: created?.id ?? null,
        details: { name: form.taskName, category: form.category },
      });
      if (prepay && paymentTab && created?.id) {
        const page = await payTaskOnce(created.id, choice === "bit" ? "bit" : "wallet");
        setLoading(false);
        if (page.ok && paymentTab.navigate(page.url)) {
          toast.info("המטלה נשלחה לאישור. דף התשלום נפתח בכרטיסייה נפרדת. אם המטלה לא תאושר, הכסף יוחזר.");
        } else {
          paymentTab.close();
          toast.error(`${page.ok ? "דף התשלום נסגר." : billingErrorText(page.code)} המטלה נשלחה לאישור, ואפשר לשלם עליה מ״המטלות שלי״.`);
        }
      } else if (quote && !quote.billing_off) {
        toast.success("המטלה נשלחה לאישור. תעלה לאפליקציה אחרי שנאשר אותה 🐝");
      } else {
        toast.success("המטלה פורסמה בהצלחה! 🎉🐝");
      }
      navigate("/my-tasks?tab=published");
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden" dir="rtl">
      <PageHeader title="פרסום מטלה חדשה" titleIsPageHeading />
      <div className="absolute inset-0 bg-muted" />
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-blob" />
      <div className="absolute bottom-20 right-10 w-80 h-80 bg-accent/10 rounded-full blur-3xl animate-blob animation-delay-2000" />

      <div className="relative z-10 w-full max-w-2xl mx-auto py-8 px-4 pb-[calc(9rem+env(safe-area-inset-bottom))] md:pb-8">

        {quote && !quote.billing_off && quote.free_slot && (
          <div className="mb-6 rounded-3xl gradient-honey text-primary-foreground shadow-honey px-5 py-4 text-center" data-testid="first-task-banner">
            <p className="text-xl font-extrabold">🎁 המטלה הראשונה עלינו!</p>
            <p className="text-sm mt-1 opacity-90">כיף שהגעתם! אפשר לפרסם אותה בלי כרטיס אשראי ובלי שום חיוב. רק מהמטלה הבאה נבקש פרטי תשלום.</p>
          </div>
        )}

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-8 px-1 sm:px-2 overflow-x-auto py-2" role="region" aria-label="שלבי התקדמות">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const isActive = step === s.id;
            const isDone = step > s.id;
            return (
              <div key={s.id} className="flex items-center flex-1 last:flex-initial min-w-0">
                <div className="flex flex-col items-center shrink-0">
                  <div
                    aria-label={`שלב ${s.id}: ${s.label}`}
                    className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all duration-300 ${
                      isDone ? "gradient-honey text-primary-foreground shadow-honey" :
                      isActive ? "bg-primary text-primary-foreground shadow-glow scale-110" :
                      "bg-card border-2 border-border text-muted-foreground"
                    }`}
                  >
                    {isDone ? <Check size={18} /> : <Icon size={18} />}
                  </div>
                  <span className={`text-xs mt-1.5 font-bold truncate max-w-[60px] sm:max-w-none text-center ${isActive ? "text-primary-ink" : "text-muted-foreground"}`}>
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1.5 sm:mx-3 mb-5 rounded-full transition-colors duration-300 ${
                    isDone ? "bg-primary" : "bg-border"
                  }`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="glass rounded-3xl shadow-glow p-6 sm:p-8 border border-border animate-pop-in" key={step}>
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-xl font-bold text-foreground mb-2 text-start">בחירת קטגוריה</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="קטגוריית המטלה">
                {categories.map((c) => {
                  const Icon = c.icon;
                  const isSelected = form.category === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => updateForm("category", c.value)}
                      className={`flex flex-col items-center justify-center gap-2 p-4 min-h-24 rounded-2xl text-center font-bold transition-all duration-200 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                        isSelected
                          ? "gradient-honey text-primary-foreground border-transparent shadow-honey scale-[1.02]"
                          : "bg-card text-foreground border-border hover:border-primary hover:bg-accent/50"
                      }`}
                    >
                      <Icon size={26} aria-hidden="true" />
                      <span className="text-xs sm:text-sm font-semibold">{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-5">
              <h2 className="text-xl font-extrabold text-foreground mb-2 text-right">פרטי המטלה</h2>
              <div>
                <Label htmlFor="taskName" className="text-right block mb-1 font-bold">מה צריך לעשות?</Label>
                <Input
                  id="taskName"
                  dir="rtl"
                  value={form.taskName}
                  onChange={(e) => updateForm("taskName", e.target.value)}
                  placeholder="לדוגמה: ניקוי חלונות בדירה"
                  className="rounded-2xl h-12 text-right text-base"
                />
                <p className="text-xs text-muted-foreground mt-1">כתבו בכמה מילים מה המבצע/ת יצטרך/ת לעשות.</p>
              </div>
              <div>
                <Label htmlFor="shortDesc" className="text-right block mb-1 font-bold">תיאור קצר (עד 120 תווים)</Label>
                <Input
                  id="shortDesc"
                  dir="rtl"
                  value={form.shortDesc}
                  onChange={(e) => updateForm("shortDesc", e.target.value)}
                  placeholder="לדוגמה: ניקוי 4 חלונות גדולים בסלון"
                  className="rounded-2xl h-12 text-right text-base"
                  maxLength={120}
                />
                <p className="text-xs text-muted-foreground mt-1 text-left" dir="ltr">{form.shortDesc.length}/120 · לדוגמה: ניקוי 4 חלונות גדולים בסלון</p>
              </div>
              <div>
                <Label htmlFor="fullDesc" className="text-right block mb-1 font-bold">תיאור מפורט</Label>
                <Textarea
                  id="fullDesc"
                  dir="rtl"
                  value={form.fullDesc}
                  onChange={(e) => updateForm("fullDesc", e.target.value)}
                  placeholder="מומלץ לפרט: מה כולל הביצוע, דרישות מיוחדות, ציוד נדרש וכו'..."
                  className="rounded-2xl min-h-[120px] text-right text-base"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-5">
              <h2 className="text-xl font-extrabold text-foreground mb-2 text-right">תשלום ועובדים</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="payment" className="text-right block mb-1 font-bold">תשלום מוצע</Label>
                  <div className="relative">
                    <span className="absolute inset-y-0 end-0 flex items-center pe-4 pointer-events-none text-foreground font-extrabold text-base">
                      ₪
                    </span>
                    <Input
                      id="payment"
                      type="text"
                      inputMode="numeric"
                      dir="rtl"
                      value={form.payment}
                      onChange={(e) => updateForm("payment", e.target.value)}
                      placeholder="0"
                      className="rounded-2xl h-12 ps-4 pe-9 text-right font-medium text-base"
                      min={0}
                    />
                  </div>
                </div>
                <div>
                  <Label id="payment-type-label" className="text-right block mb-1 font-bold">סוג תשלום</Label>
                  <Select value={form.paymentType} onValueChange={(v) => updateForm("paymentType", v)}>
                    <SelectTrigger aria-labelledby="payment-type-label" className="rounded-2xl h-12 text-right"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="task">למשימה (פיקס)</SelectItem>
                      <SelectItem value="hour">לשעה</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="workers" className="text-right block mb-1 font-bold">מספר עובדים נדרש</Label>
                <Input
                  id="workers"
                  type="text"
                  inputMode="numeric"
                  dir="rtl"
                  value={form.workers}
                  onChange={(e) => updateForm("workers", e.target.value)}
                  className="rounded-2xl h-12 text-right text-base"
                  min={1}
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-5">
              <h2 className="text-xl font-extrabold text-foreground mb-2 text-right">מתי ואיפה?</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="date" className="text-right block mb-1 font-bold">תאריך</Label>
                  <Input
                    id="date"
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    placeholder="dd/mm/yyyy"
                    value={form.date ? form.date.split("-").reverse().join("/") : ""}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9/]/g, "");
                      // auto-insert slashes
                      let formatted = raw;
                      if (raw.length === 2 && !raw.includes("/")) formatted = raw + "/";
                      if (raw.length === 5 && raw.split("/").length === 2) formatted = raw + "/";
                      // convert dd/mm/yyyy → yyyy-mm-dd for storage
                      const parts = formatted.split("/");
                      if (parts.length === 3 && parts[2].length === 4) {
                        updateForm("date", `${parts[2]}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}`);
                      } else {
                        // store display value temporarily (not valid ISO yet)
                        updateForm("date", formatted.length <= 10 ? formatted : form.date);
                      }
                    }}
                    aria-describedby="date-hint"
                    className="h-12 rounded-2xl px-4 text-base font-medium"
                    maxLength={10}
                  />
                  <div role="group" aria-label="בחירת תאריך מהירה" className="mt-2 grid grid-cols-3 gap-2">
                    {dateShortcuts.map(({ label, value }) => (
                      <Button key={label} type="button" variant="outline" aria-pressed={form.date === value}
                        title={value.split("-").reverse().join("/")} className={shortcutClass(form.date === value)} onClick={() => updateForm("date", value)}>
                        {label}
                      </Button>
                    ))}
                  </div>
                  <p id="date-hint" className="mt-1 text-xs text-muted-foreground">הקלד בפורמט DD/MM/YYYY.</p>
                </div>
                <div className="min-w-0">
                  <Label htmlFor="time" className="text-right block mb-1 font-bold">שעה</Label>
                  <div className="h-12 min-w-0 rounded-2xl border border-input bg-background px-4 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                    <Input
                      id="time"
                      type="time"
                      dir="ltr"
                      step={300}
                      value={form.time}
                      onChange={(event) => updateForm("time", event.target.value)}
                      aria-describedby="time-hint"
                      className="h-full min-w-0 max-w-full appearance-none rounded-none border-0 bg-transparent p-0 text-base font-medium [direction:ltr] focus-visible:ring-0 focus-visible:ring-offset-0"
                      style={{ unicodeBidi: "plaintext" }}
                    />
                  </div>
                  <div role="group" aria-label="בחירת שעה מהירה" className="mt-2 grid grid-cols-3 gap-2">
                    {["09:00", "14:00", "18:00"].map((time) => (
                      <Button key={time} type="button" variant="outline" aria-pressed={form.time === time}
                        className={shortcutClass(form.time === time)} onClick={() => updateForm("time", time)}>
                        <span dir="ltr">{time}</span>
                      </Button>
                    ))}
                  </div>
                  <p id="time-hint" className="mt-1 text-xs text-muted-foreground">אפשר להקליד שעה בפורמט HH:MM או להשתמש בבורר השעה.</p>
                </div>
              </div>
              <div>
                <Label htmlFor="duration" className="text-right block mb-1 font-bold">משך זמן מוערך (ימים)</Label>
                <Input
                  id="duration"
                  type="text"
                  inputMode="numeric"
                  dir="rtl"
                  value={form.duration}
                  onChange={(e) => updateForm("duration", e.target.value.replace(/[^0-9]/g, ""))}
                  className="rounded-2xl h-12 text-right text-base"
                  placeholder="1"
                />
              </div>
              <div>
                <Label htmlFor="location" className="text-right block mb-1 font-bold">כתובת המטלה</Label>
                <Input
                  id="location"
                  dir="rtl"
                  value={form.location}
                  onChange={(e) => updateForm("location", e.target.value)}
                  onBlur={handleLocationBlur}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleLocationBlur(); } }}
                  placeholder="עיר, רחוב ומספר בית"
                  className="rounded-2xl h-12 text-right text-base"
                />
                {locationLoading && <p className="text-xs text-muted-foreground mt-2">מאתר את הכתובת...</p>}
                <div className="mt-3">
                  <GoogleMapPicker
                    lat={selectedLat}
                    lng={selectedLng}
                    onLocationSelect={(lat, lng) => {
                      setSelectedLat(lat);
                      setSelectedLng(lng);
                    }}
                    onAddressFound={(address) => updateForm("location", address)}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="expiry" className="text-right block mb-1 font-bold">תוקף הפרסום (ימים)</Label>
                <Input
                  id="expiry"
                  type="text"
                  inputMode="numeric"
                  dir="rtl"
                  value={form.expiry}
                  onChange={(e) => updateForm("expiry", e.target.value)}
                  className="rounded-2xl h-12 text-right text-base"
                  min={1}
                />
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="flex flex-col gap-5">
              <h2 className="text-xl font-extrabold text-foreground mb-2 text-right">תמונה והערות</h2>
              <div>
                <Label htmlFor="task-image" className="text-right block mb-1 font-bold">הוסף תמונה</Label>
                {/* The file input carries the real semantics: `sr-only` instead of
                    `hidden` keeps it in the tab order and operable from the
                    keyboard. Clicking the drop zone stays a mouse convenience,
                    and focus-within shows keyboard users where they are. */}
                <label
                  htmlFor="task-image"
                  className="mt-2 block border-2 border-dashed border-border rounded-2xl p-6 sm:p-8 text-center cursor-pointer hover:border-primary transition-colors overflow-hidden focus-within:border-primary focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
                >
                  {imagePreview ? (
                    <div className="relative">
                      <img src={imagePreview} alt="תצוגה מקדימה של התמונה שנבחרה" className="max-h-48 mx-auto rounded-xl object-cover" />
                      <p className="text-xs text-muted-foreground mt-2 font-medium">לחץ להחלפת התמונה</p>
                    </div>
                  ) : (
                    <>
                      <Image aria-hidden="true" size={40} className="mx-auto mb-3 text-muted-foreground" />
                      <p className="text-sm font-bold text-muted-foreground">לחץ להעלאת תמונה</p>
                      <p id="task-image-hint" className="text-xs text-muted-foreground/80 mt-1">פורמטים נתמכים: JPG, PNG עד 5MB</p>
                    </>
                  )}
                  <input
                    id="task-image"
                    type="file"
                    accept="image/*"
                    aria-describedby="task-image-hint"
                    className="sr-only"
                    onChange={handleImageSelect}
                  />
                </label>
              </div>
              <div>
                <Label htmlFor="notes" className="text-right block mb-1 font-bold">הערות נוספות</Label>
                <Textarea
                  id="notes"
                  dir="rtl"
                  value={form.notes}
                  onChange={(e) => updateForm("notes", e.target.value)}
                  placeholder="הערות נוספות למבצע המטלה..."
                  className="rounded-2xl min-h-[100px] text-right text-base"
                />
              </div>

              {/* Insurance option */}
              <div className="bg-muted/50 rounded-2xl p-4 sm:p-5 border border-border">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xl">🛡️</span>
                  <h3 className="text-sm font-extrabold text-foreground">ביטוח מטלות</h3>
                  <span className="text-xs bg-primary/10 text-primary-ink font-bold px-2 py-0.5 rounded-full">{feeText(fees?.insurance_fee)} למשימה</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3 text-start">
                  כיסוי לנזק ישיר לרכוש עד 2,000 ₪ למשימה. התוספת היא {feeText(fees?.insurance_fee)} על המטלה הזאת בלבד.
                </p>
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="insurance"
                    className="h-5 w-5"
                    checked={insurance}
                    onCheckedChange={(value) => setInsurance(value === true)}
                  />
                  <label htmlFor="insurance" className="text-sm font-bold text-foreground cursor-pointer select-none">
                    הפעל ביטוח למטלה זו
                  </label>
                </div>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="flex flex-col gap-5">
              <h2 className="text-2xl font-extrabold text-foreground text-start">רגע לפני פרסום 🚀</h2>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. Details Card */}
                <div className="bg-card/40 backdrop-blur-md border border-border/60 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all hover:border-primary/30">
                  <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border/40">
                    <div className="p-2 bg-primary/15 rounded-xl text-primary-ink">
                      <FileText size={20} />
                    </div>
                    <h3 className="font-extrabold text-foreground text-base">פרטים כלליים</h3>
                  </div>
                  <div className="space-y-4">
                    <SummaryItem label="קטגוריה" value={categoryLabel(form.category)} onEdit={() => setStep(1)} />
                    <SummaryItem label="מה צריך לעשות?" value={form.taskName} onEdit={() => setStep(2)} />
                    <SummaryItem label="תיאור" value={form.shortDesc} onEdit={() => setStep(2)} />
                  </div>
                </div>

                {/* 2. Location & Time Card */}
                <div className="bg-card/40 backdrop-blur-md border border-border/60 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all hover:border-blue-500/30">
                  <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border/40">
                    <div className="p-2 bg-blue-500/15 rounded-xl text-blue-500">
                      <MapPin size={20} />
                    </div>
                    <h3 className="font-extrabold text-foreground text-base">מיקום וזמנים</h3>
                  </div>
                  <div className="space-y-4">
                    <SummaryItem label="כתובת" value={form.location} onEdit={() => setStep(4)} />
                    <SummaryItem label="מתי?" value={formatDateTime(form.date, form.time)} onEdit={() => setStep(4)} />
                    <SummaryItem label="זמן משוער" value={formatDurationSummary(form.duration, form.durationUnit)} onEdit={() => setStep(4)} />
                  </div>
                </div>

                {/* 3. Payment & Team Card */}
                <div className="bg-card/40 backdrop-blur-md border border-border/60 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all hover:border-green-500/30">
                  <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border/40">
                    <div className="p-2 bg-green-500/15 rounded-xl text-green-500">
                      <DollarSign size={20} />
                    </div>
                    <h3 className="font-extrabold text-foreground text-base">תשלום ועובדים</h3>
                  </div>
                  <div className="space-y-4">
                    <SummaryItem label="תשלום מוצע" value={`${formatCurrency(Number(form.payment))} / ${form.paymentType === "hour" ? "שעה" : "משימה"}`} valueClassName="text-green-600 dark:text-green-400 font-black text-lg" onEdit={() => setStep(3)} />
                    <SummaryItem label="עובדים דרושים" value={form.workers} onEdit={() => setStep(3)} />
                    <SummaryItem label="תוקף מודעה" value={`${form.expiry} ימים`} onEdit={() => setStep(3)} />
                  </div>
                </div>

                {/* 4. Notes & Extras Card */}
                {(form.notes || imagePreview) && (
                  <div className="bg-card/40 backdrop-blur-md border border-border/60 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all hover:border-orange-500/30">
                    <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border/40">
                      <div className="p-2 bg-orange-500/15 rounded-xl text-orange-500">
                        <StickyNote size={20} />
                      </div>
                      <h3 className="font-extrabold text-foreground text-base">תוספות</h3>
                    </div>
                    <div className="space-y-4">
                      {form.notes && <SummaryItem label="הערות" value={form.notes} onEdit={() => setStep(5)} />}
                      {imagePreview && (
                        <div>
                          <span className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider block mb-1">תמונה שצורפה</span>
                          <img src={imagePreview} alt="תמונה שצורפה" className="h-24 w-auto rounded-xl object-cover border border-border/50 shadow-sm" />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 6 && quote && !quote.billing_off && (
            <div
              className="mt-5 rounded-3xl border border-border/60 bg-card/40 p-5 text-start"
              data-testid="publish-quote"
            >
              <h3 className="font-extrabold text-foreground text-base mb-3">עלות הפרסום</h3>
              {quote.free_slot && (
                <p className="text-sm font-bold text-primary-ink">המטלה הראשונה שלכם חינם 🎁</p>
              )}
              {quote.subscriber && quote.insurance_fee === 0 && (
                <p className="text-sm font-bold text-primary-ink">המנוי שלכם כולל פרסום ללא עלות</p>
              )}
              {!quote.free_slot && !quote.subscriber && (
                <p className="text-sm text-foreground">עמלת פרסום: {formatCurrency(quote.task_fee)}</p>
              )}
              {quote.insurance_fee > 0 && (
                <p className="text-sm text-foreground">ביטוח מטלות: {formatCurrency(quote.insurance_fee)}</p>
              )}
              <p className="mt-2 text-base font-extrabold text-foreground">
                סה״כ: {quote.due > 0 ? formatCurrency(quote.due) : "חינם"}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {quote.free_slot
                  ? "המטלה נשלחת לאישור ותעלה לאפליקציה אחרי שנאשר אותה. אין חיוב."
                  : "המטלה נשלחת לאישור. הכרטיס יחויב רק אחרי שאישרנו אותה, והיא תעלה לאפליקציה אחרי שהחיוב עבר."}
                {!quote.free_slot && !quote.subscriber && " אפשר גם לעבור למנוי ולפרסם בלי עמלה."}
              </p>
              {quote.due > 0 && !quote.has_card && (
                <p className="mt-2 text-xs font-bold text-foreground">
                  לפני הפרסום יוצג סיכום. שמירת הכרטיס תיפתח בכרטיסייה נפרדת, בלי חיוב בשלב הזה.
                </p>
              )}
            </div>
          )}

          <PaymentSummaryDialog open={cardSetupOpen} title="שמירת כרטיס לפני פרסום" amount={0}
            description={`הכרטיס יישמר כעת. החיוב בסך ${formatCurrency(quote?.due ?? 0)} יתבצע רק לאחר אישור המטלה.`}
            savesCard busy={loading} onOpenChange={setCardSetupOpen} onConfirm={beginCardSetup} />

          <AlertDialog open={!!confirmQuote} onOpenChange={(open) => !open && setConfirmQuote(null)}>
            <AlertDialogContent dir="rtl" data-testid="charge-confirm">
              <AlertDialogHeader>
                <AlertDialogTitle>לפני שמפרסמים</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2 text-start text-sm text-muted-foreground">
                    {paymentMode === "saved_card" ? <p>
                      המטלה תישלח לאישור. ברגע שנאשר אותה, נחייב את הכרטיס
                      {confirmQuote?.card_last4 ? ` שמסתיים ב־${confirmQuote.card_last4}` : " ששמרתם"} ב־
                      <strong className="text-foreground">{confirmQuote ? formatCurrency(confirmQuote.due) : ""}</strong>
                      {confirmQuote && confirmQuote.task_fee > 0 && confirmQuote.insurance_fee > 0
                        ? ` (עמלת פרסום ${formatCurrency(confirmQuote.task_fee)} + ביטוח ${formatCurrency(confirmQuote.insurance_fee)})`
                        : confirmQuote && confirmQuote.insurance_fee > 0
                          ? " (ביטוח מטלות)"
                          : " (עמלת פרסום)"}
                      , והמטלה תעלה לאפליקציה אחרי שהחיוב עבר.
                    </p>
                    : paymentMode === "new_card" ? <p>ייפתח דף מאובטח של Cardcom לשמירת הכרטיס החדש, בלי חיוב עכשיו. אחרי השמירה תחזרו לטופס ותפרסמו. הכרטיס יחויב ב־{confirmQuote ? formatCurrency(confirmQuote.due) : ""} רק אחרי שנאשר את המטלה.</p>
                    : <p>ייפתח דף התשלום של Cardcom ותשלמו עכשיו {confirmQuote ? formatCurrency(confirmQuote.due) : ""}{paymentMode === "bit" ? " ב-Bit" : " ב-Apple Pay או Google Pay"}. המטלה תעלה לאפליקציה אחרי שנאשר אותה. אם לא תאושר, הכסף יוחזר במלואו.</p>}
                    {(paymentMode === "saved_card" || paymentMode === "new_card") && <p>אם המטלה לא תאושר, לא תחויבו בכלום.</p>}
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <fieldset className="space-y-2 text-sm">
                <legend className="mb-2 font-bold">איך לשלם על המטלה?</legend>
                {confirmQuote?.has_card && <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-3">
                  <input type="radio" name="task-payment-mode" value="saved_card" checked={paymentMode === "saved_card"} onChange={() => setPaymentMode("saved_card")} />
                  <span>הכרטיס השמור{confirmQuote?.card_last4 ? ` שמסתיים ב-${confirmQuote.card_last4}` : ""}</span>
                </label>}
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-3">
                  <input type="radio" name="task-payment-mode" value="new_card" checked={paymentMode === "new_card"} onChange={() => setPaymentMode("new_card")} />
                  <span>כרטיס אשראי חדש</span>
                </label>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-3">
                  <input type="radio" name="task-payment-mode" value="wallet" checked={paymentMode === "wallet"} onChange={() => setPaymentMode("wallet")} />
                  <span>Apple Pay או Google Pay - תשלום עכשיו</span>
                </label>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-3">
                  <input type="radio" name="task-payment-mode" value="bit" checked={paymentMode === "bit"} onChange={() => setPaymentMode("bit")} />
                  <span>Bit - תשלום עכשיו</span>
                </label>
              </fieldset>
              <AlertDialogFooter>
                <AlertDialogCancel>חזרה</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmPayment}
                >
                  {paymentMode === "saved_card" ? "מאשרים ומפרסמים" : paymentMode === "new_card" ? "לשמירת הכרטיס" : "שליחה לאישור ומעבר לתשלום"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 gap-4">
            <Button
              variant="outline"
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 1}
              className="rounded-full px-6 h-12 font-bold min-w-[110px]"
            >
              <ChevronRight size={18} />
              הקודם
            </Button>

            {step < 6 ? (
              <Button
                onClick={async () => {
                  if (step === 4 && form.location.trim() && selectedLat === null) {
                    setLocationLoading(true);
                    const result = await geocodeAddress(form.location);
                    if (result) {
                      updateForm("location", result.formattedAddress);
                      setSelectedLat(result.lat);
                      setSelectedLng(result.lng);
                    }
                    setLocationLoading(false);
                  }
                  setStep((s) => s + 1);
                }}
                disabled={!canProceed() || locationLoading}
                className="gradient-honey text-primary-foreground rounded-full px-7 h-12 border-none font-extrabold min-w-[110px] hover:scale-105 transition-transform"
              >
                הבא
                <ChevronLeft size={18} />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={loading}
                className="gradient-honey text-primary-foreground rounded-full px-7 h-12 border-none font-extrabold min-w-[110px] hover:scale-105 transition-transform"
              >
                {loading ? "מפרסם..." : "פרסם מטלה 🐝"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Postgres speaks in constraint names. Say what the person can actually do
 * about it instead, and keep the raw message only for the cases we have not
 * met yet.
 */
const publishErrorMessage = (error: { message: string; code?: string }) => {
  if (error.code === "23514" || error.message.includes("short_desc")) {
    return `התיאור הקצר ארוך מדי — עד ${SHORT_DESC_MAX} תווים.`;
  }
  if (error.code === "42501") {
    return "רק משתמש מסוג מציע מטלות יכול לפרסם מטלה.";
  }
  if (error.message === "card_required") return "צריך לשמור כרטיס אשראי לפני פרסום מטלה בתשלום.";
  if (error.message === "too_many_submissions") return "שלחתם הרבה מטלות בשעה האחרונה. אפשר לנסות שוב בעוד כמה דקות.";
  if (error.message === "too_many_pending_payment") return "יש כבר 3 מטלות שממתינות לתשלום. כדאי להסדיר אותן קודם.";
  return "שגיאה בפרסום המטלה: " + error.message;
};

const formatDurationSummary = (value: string, _unit: string) => {
  if (!value) return "לא צוין";
  const amount = Number(value);
  return amount === 1 ? "יום אחד" : `${amount} ימים`;
};

const SummaryItem = ({ label, value, valueClassName = "", onEdit }: { label: string; value: string; valueClassName?: string; onEdit?: () => void }) => (
  <div className="flex flex-col gap-0.5 text-start">
    <div className="flex items-center justify-between gap-2"><span className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider">{label}</span>{onEdit && <button type="button" onClick={onEdit} className="inline-flex min-h-11 items-center rounded px-2 text-xs font-bold text-primary-ink underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">עריכה</button>}</div>
    <span className={`text-sm font-semibold text-foreground ${valueClassName}`}>{value || "—"}</span>
  </div>
);

export default CreateTask;
