import { useState, useRef, useEffect } from "react";
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
import { Link, useNavigate } from "react-router-dom";
import BzbLogo from "@/components/BzbLogo";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ChevronLeft, ChevronRight, Check, Tag, FileText, DollarSign, MapPin, Image, StickyNote, ArrowRight, Calendar as CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { categories, categoryLabel } from "@/lib/categories";
import { geocodeAddress } from "@/lib/geocodeAddress";
import GoogleMapPicker from "@/components/tasks/GoogleMapPicker";

const displayFormattedDate = (dateStr: string) => {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  if (y && m && d) return `${d}/${m}/${y}`;
  return dateStr;
};

const steps = [
  { id: 1, label: "קטגוריה", icon: Tag },
  { id: 2, label: "פרטים", icon: FileText },
  { id: 3, label: "תשלום", icon: DollarSign },
  { id: 4, label: "מיקום וזמן", icon: MapPin },
  { id: 5, label: "תוספות", icon: Image },
  { id: 6, label: "סיכום", icon: Check },
];

const CreateTask = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [pendingExit, setPendingExit] = useState<(() => void) | null>(null);
  const allowNavigationRef = useRef(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    category: "", taskName: "", shortDesc: "", fullDesc: "",
    payment: "", paymentType: "task", workers: "1",
    location: "", date: "", time: "", duration: "", durationUnit: "hours", expiry: "24",
    notes: "",
  });
  const [selectedLat, setSelectedLat] = useState<number | null>(null);
  const [selectedLng, setSelectedLng] = useState<number | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateForm = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const hasDraftContent = Object.values(form).some(Boolean) || Boolean(imageFile);
  const saveDraft = async () => {
    if (!user || !hasDraftContent) return;
    const payload = { form, step, selectedLat, selectedLng };
    const query = draftId
      ? supabase.from("task_drafts").update({ form_data: payload, current_step: step, updated_at: new Date().toISOString() }).eq("id", draftId)
      : supabase.from("task_drafts").insert({ user_id: user.id, form_data: payload, current_step: step }).select("id").single();
    const { data } = await query;
    if (!draftId && data?.id) setDraftId(data.id);
  };
  const requestExit = (exit: () => void) => {
    if (!hasDraftContent) { exit(); return; }
    setPendingExit(() => exit);
    setShowExitDialog(true);
  };
  useEffect(() => {
    const originalPushState = window.history.pushState.bind(window.history);
    window.history.pushState = ((state: unknown, title: string, url?: string | URL | null) => {
      const target = url?.toString() ?? "";
      if (hasDraftContent && !allowNavigationRef.current && target && target !== window.location.pathname) {
        setPendingExit(() => () => {
          allowNavigationRef.current = true;
          originalPushState(state, title, url);
          window.dispatchEvent(new PopStateEvent("popstate"));
        });
        setShowExitDialog(true);
        return;
      }
      originalPushState(state, title, url);
    }) as typeof window.history.pushState;
    return () => { window.history.pushState = originalPushState; };
  }, [hasDraftContent]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (hasDraftContent) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [hasDraftContent]);

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
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    return signed?.signedUrl ?? null;
  };

  const canProceed = () => {
    switch (step) {
      case 1: return !!form.category;
      case 2: return !!form.taskName && !!form.shortDesc;
      case 3: return !!form.payment;
      case 4: {
        const duration = Number(form.duration);
        const validDuration = !form.duration || (form.durationUnit === "minutes" ? duration >= 5 && duration <= 1440 : duration >= 0.5 && duration <= 24);
        return !!form.location && !!form.date && !!form.time && validDuration;
      }
      default: return true;
    }
  };

  const handleSubmit = async () => {
    if (!user) {
      toast.error("יש להתחבר כדי לפרסם מטלה");
      navigate("/login");
      return;
    }
    setLoading(true);
    let imageUrl: string | null = null;
    if (imageFile) {
      imageUrl = await uploadImage();
    }
    const { error } = await supabase.from("tasks").insert({
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
      duration_hours: form.duration ? (form.durationUnit === "minutes" ? parseFloat(form.duration) / 60 : parseFloat(form.duration)) : null,
      expiry_hours: parseInt(form.expiry) || 24,
      notes: form.notes || null,
      image_url: imageUrl,
    });
    setLoading(false);
    if (error) {
      toast.error("שגיאה בפרסום המטלה: " + error.message);
    } else {
      toast.success("המטלה פורסמה בהצלחה! 🎉🐝");
      navigate("/my-tasks");
    }
  };

  return (
    <div className="min-h-screen py-8 px-4 pb-[calc(9rem+env(safe-area-inset-bottom))] md:pb-8 relative overflow-hidden" dir="rtl">
      <div className="absolute inset-0 bg-muted" />
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-blob" />
      <div className="absolute bottom-20 right-10 w-80 h-80 bg-accent/10 rounded-full blur-3xl animate-blob animation-delay-2000" />

      <div className="relative z-10 w-full max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
            <Link to="/" onClick={(event) => { if (hasDraftContent) { event.preventDefault(); requestExit(() => navigate("/")); } }}>
            <BzbLogo className="w-12 h-12" animate />
          </Link>
          <h1 className="text-2xl font-bold text-foreground">פרסום מטלה חדשה</h1>
          <Button variant="ghost" size="icon" onClick={() => step > 1 ? setStep((current) => current - 1) : navigate(-1)} className="rounded-full h-11 w-11" aria-label={step > 1 ? "חזרה לשלב הקודם" : "חזרה למסך הקודם"}>
            <ArrowRight size={22} />
          </Button>
        </div>

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
                  <Label className="text-right block mb-1 font-bold">סוג תשלום</Label>
                  <Select value={form.paymentType} onValueChange={(v) => updateForm("paymentType", v)}>
                    <SelectTrigger className="rounded-2xl h-12 text-right"><SelectValue /></SelectTrigger>
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
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full h-12 rounded-2xl justify-between text-right font-medium text-base px-4 border-input bg-background hover:bg-accent/50 focus:ring-2 focus:ring-ring"
                      >
                        <span className={form.date ? "text-foreground font-semibold" : "text-muted-foreground"}>
                          {form.date ? displayFormattedDate(form.date) : "בחירת תאריך (DD/MM/YYYY)"}
                        </span>
                        <CalendarIcon size={20} className="text-muted-foreground shrink-0 ms-2" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 rounded-2xl shadow-glow border-border" align="start" dir="rtl">
                      <Calendar
                        mode="single"
                        selected={form.date ? new Date(form.date) : undefined}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        onSelect={(d) => {
                          if (d) {
                            const year = d.getFullYear();
                            const month = String(d.getMonth() + 1).padStart(2, "0");
                            const day = String(d.getDate()).padStart(2, "0");
                            updateForm("date", `${year}-${month}-${day}`);
                          } else {
                            updateForm("date", "");
                          }
                        }}
                        dir="rtl"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label htmlFor="time" className="text-right block mb-1 font-bold">שעה</Label>
                  <Select value={form.time} onValueChange={(v) => updateForm("time", v)}>
                    <SelectTrigger className="rounded-2xl h-12 text-right text-base px-4 justify-between">
                      <SelectValue placeholder="בחירת שעה (HH:MM)" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60" dir="rtl">
                      {Array.from({ length: 32 }).map((_, i) => {
                        const totalMinutes = 7 * 60 + i * 30; // 07:00 to 22:30
                        const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
                        const mins = String(totalMinutes % 60).padStart(2, "0");
                        const timeVal = `${hours}:${mins}`;
                        return (
                          <SelectItem key={timeVal} value={timeVal}>
                            {timeVal}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="duration" className="text-right block mb-1 font-bold">משך זמן מוערך</Label>
                <div className="flex gap-2">
                  <Input
                    id="duration"
                    type="text"
                    inputMode="numeric"
                    dir="rtl"
                    value={form.duration}
                    onChange={(e) => updateForm("duration", e.target.value.replace(/[^0-9.]/g, ""))}
                    className="rounded-2xl h-12 flex-1 text-right text-base"
                    placeholder="1"
                    min={form.durationUnit === "minutes" ? 5 : 0.5}
                    max={form.durationUnit === "minutes" ? 1440 : 24}
                    step={form.durationUnit === "minutes" ? 1 : 0.5}
                  />
                  <Select value={form.durationUnit} onValueChange={(v) => updateForm("durationUnit", v)}>
                    <SelectTrigger className="rounded-2xl h-12 w-32 text-right"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hours">שעות</SelectItem>
                      <SelectItem value="minutes">דקות</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
                <Label htmlFor="expiry" className="text-right block mb-1 font-bold">תוקף הפרסום (שעות)</Label>
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
                <Label className="text-right block mb-1 font-bold">הוסף תמונה</Label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 border-2 border-dashed border-border rounded-2xl p-6 sm:p-8 text-center cursor-pointer hover:border-primary transition-colors overflow-hidden"
                >
                  {imagePreview ? (
                    <div className="relative">
                      <img src={imagePreview} alt="תצוגה מקדימה" className="max-h-48 mx-auto rounded-xl object-cover" />
                      <p className="text-xs text-muted-foreground mt-2 font-medium">לחץ להחלפת התמונה</p>
                    </div>
                  ) : (
                    <>
                      <Image size={40} className="mx-auto mb-3 text-muted-foreground" />
                      <p className="text-sm font-bold text-muted-foreground">לחץ להעלאת תמונה</p>
                      <p className="text-xs text-muted-foreground/80 mt-1">פורמטים נתמכים: JPG, PNG עד 5MB</p>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageSelect}
                  />
                </div>
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
                  <span className="text-xs bg-primary/10 text-primary-ink font-bold px-2 py-0.5 rounded-full">למנויים בתשלום</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3 text-start">
                  כיסוי לנזק ישיר לרכוש עד 2,000 ₪ למשימה (5 ₪/חודש)
                </p>
                <div className="flex items-center gap-3">
                  <Checkbox id="insurance" className="h-5 w-5" />
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
                    <SummaryItem label="מתי?" value={`${formatDate(form.date)}${form.time ? `, ${formatTime(form.time)}` : ""}`} onEdit={() => setStep(4)} />
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
                    <SummaryItem label="תוקף מודעה" value={`${form.expiry} שעות`} onEdit={() => setStep(3)} />
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
                onClick={() => setStep((s) => s + 1)}
                disabled={!canProceed()}
                className="gradient-honey text-primary-foreground rounded-full px-7 h-12 border-none font-extrabold min-w-[110px] hover:scale-105 transition-transform"
              >
                הבא
                <ChevronLeft size={18} />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={loading}
                className="gradient-honey text-primary-foreground rounded-full px-8 h-12 border-none font-extrabold hover:scale-105 transition-transform text-lg"
              >
                {loading ? "מפרסם..." : "פרסם מטלה 🐝"}
              </Button>
            )}
          </div>
        </div>
      </div>
      <Dialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <DialogContent dir="rtl" lang="he" className="text-start rounded-3xl" style={{ direction: "rtl" }}>
          <DialogHeader>
            <DialogTitle>לצאת מפרסום המטלה?</DialogTitle>
            <DialogDescription>כתבת פרטים. אפשר לשמור אותם כטיוטה ולהמשיך מאוחר יותר.</DialogDescription>
          </DialogHeader>
          <DialogFooter dir="rtl" className="flex-col gap-2 sm:flex-row sm:justify-start">
            <Button variant="outline" onClick={() => setShowExitDialog(false)}>להמשיך לערוך</Button>
            <Button variant="outline" onClick={async () => { await saveDraft(); allowNavigationRef.current = true; setShowExitDialog(false); pendingExit?.(); }}>שמירה כטיוטה ויציאה</Button>
            <Button variant="destructive" onClick={() => { allowNavigationRef.current = true; setShowExitDialog(false); pendingExit?.(); }}>יציאה בלי לשמור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const formatDurationSummary = (value: string, unit: string) => {
  if (!value) return "לא צוין";
  const amount = Number(value);
  if (unit === "minutes") return amount >= 60 && amount % 60 === 0 ? `${amount / 60} שעות (${amount} דקות)` : `${amount} דקות`;
  return amount === 1 ? "שעה (60 דקות)" : `${amount} שעות (${Math.round(amount * 60)} דקות)`;
};

const SummaryItem = ({ label, value, valueClassName = "", onEdit }: { label: string; value: string; valueClassName?: string; onEdit?: () => void }) => (
  <div className="flex flex-col gap-0.5 text-start">
    <div className="flex items-center justify-between gap-2"><span className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider">{label}</span>{onEdit && <button type="button" onClick={onEdit} className="text-xs font-bold text-primary-ink underline">עריכה</button>}</div>
    <span className={`text-sm font-semibold text-foreground ${valueClassName}`}>{value || "—"}</span>
  </div>
);

export default CreateTask;
