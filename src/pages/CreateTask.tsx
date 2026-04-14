import { useState } from "react";
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
import bzbLogo from "@/assets/bzb-logo.png";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Check, Tag, FileText, DollarSign, MapPin, Image, StickyNote, ArrowLeft } from "lucide-react";
import GoogleMapPicker from "@/components/tasks/GoogleMapPicker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const categories = [
  { value: "housework", label: "🏠 עבודות בית" },
  { value: "handyman", label: "🔧 הנדימן" },
  { value: "tutoring", label: "📚 לימודים" },
  { value: "babysitting", label: "👶 בייביסיטר" },
  { value: "pets", label: "🐾 חיות מחמד" },
  { value: "gardening", label: "🌿 גינון" },
  { value: "other", label: "📦 אחר" },
];

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
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    category: "", taskName: "", shortDesc: "", fullDesc: "",
    payment: "", paymentType: "task", workers: "1",
    location: "", date: "", time: "", duration: "", durationUnit: "hours", expiry: "24",
    notes: "",
  });
  const [selectedLat, setSelectedLat] = useState<number | null>(null);
  const [selectedLng, setSelectedLng] = useState<number | null>(null);

  const updateForm = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const canProceed = () => {
    switch (step) {
      case 1: return !!form.category;
      case 2: return !!form.taskName && !!form.shortDesc;
      case 3: return !!form.payment;
      case 4: return !!form.location && !!form.date && !!form.time;
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
    <div className="min-h-screen py-8 px-4 relative overflow-hidden" dir="rtl">
      <div className="absolute inset-0 bg-muted" />
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-blob" />
      <div className="absolute bottom-20 right-10 w-80 h-80 bg-accent/10 rounded-full blur-3xl animate-blob animation-delay-2000" />

      <div className="relative z-10 w-full max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link to="/">
            <img src={bzbLogo} alt="BZB" className="w-12 h-12 hover:animate-buzz" />
          </Link>
          <h1 className="text-2xl font-extrabold text-foreground">פרסום מטלה חדשה 📋</h1>
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
            <ArrowLeft size={22} />
          </Button>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-8 px-2">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const isActive = step === s.id;
            const isDone = step > s.id;
            return (
              <div key={s.id} className="flex items-center flex-1 last:flex-initial">
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                    isDone ? "gradient-honey text-primary-foreground shadow-honey" :
                    isActive ? "bg-primary text-primary-foreground shadow-glow scale-110" :
                    "bg-card border-2 border-border text-muted-foreground"
                  }`}>
                    {isDone ? <Check size={18} /> : <Icon size={18} />}
                  </div>
                  <span className={`text-[10px] mt-1.5 font-bold ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 mt-[-12px] rounded-full transition-colors duration-300 ${
                    isDone ? "bg-primary" : "bg-border"
                  }`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="glass rounded-3xl shadow-glow p-8 border border-border animate-pop-in" key={step}>
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-xl font-extrabold text-foreground mb-2">בחר קטגוריה</h2>
              <div className="grid grid-cols-3 gap-3">
                {categories.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => updateForm("category", c.value)}
                    className={`p-4 rounded-2xl text-center font-bold transition-all duration-300 border ${
                      form.category === c.value
                        ? "gradient-honey text-primary-foreground border-transparent shadow-honey scale-105"
                        : "bg-card text-foreground border-border hover:border-primary hover:scale-105"
                    }`}
                  >
                    <div className="text-2xl mb-1">{c.label.split(" ")[0]}</div>
                    <div className="text-xs">{c.label.split(" ").slice(1).join(" ")}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-5">
              <h2 className="text-xl font-extrabold text-foreground mb-2">פרטי המטלה</h2>
              <div>
                <Label htmlFor="taskName">שם המשימה</Label>
                <Input id="taskName" value={form.taskName} onChange={(e) => updateForm("taskName", e.target.value)} placeholder="שם המשימה" className="mt-1 rounded-2xl h-12" />
              </div>
              <div>
                <Label htmlFor="shortDesc">תיאור קצר (עד 40 תווים)</Label>
                <Input id="shortDesc" value={form.shortDesc} onChange={(e) => updateForm("shortDesc", e.target.value)} placeholder="תיאור קצר" className="mt-1 rounded-2xl h-12" maxLength={40} />
                <p className="text-xs text-muted-foreground mt-1">{form.shortDesc.length}/40</p>
              </div>
              <div>
                <Label htmlFor="fullDesc">תיאור מפורט</Label>
                <Textarea id="fullDesc" value={form.fullDesc} onChange={(e) => updateForm("fullDesc", e.target.value)} placeholder="תאר את המשימה בפירוט..." className="mt-1 rounded-2xl min-h-[120px]" />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-5">
              <h2 className="text-xl font-extrabold text-foreground mb-2">תשלום ועובדים</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="payment">תשלום מוצע (₪)</Label>
                  <Input id="payment" type="number" value={form.payment} onChange={(e) => updateForm("payment", e.target.value)} placeholder="0" className="mt-1 rounded-2xl h-12" min={0} />
                </div>
                <div>
                  <Label>סוג תשלום</Label>
                  <Select value={form.paymentType} onValueChange={(v) => updateForm("paymentType", v)}>
                    <SelectTrigger className="mt-1 rounded-2xl h-12"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="task">למשימה</SelectItem>
                      <SelectItem value="hour">לשעה</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="workers">מספר עובדים נדרש</Label>
                <Input id="workers" type="number" value={form.workers} onChange={(e) => updateForm("workers", e.target.value)} className="mt-1 rounded-2xl h-12" min={1} />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-5">
              <h2 className="text-xl font-extrabold text-foreground mb-2">מיקום וזמן</h2>
              <div>
                <Label htmlFor="location">מיקום המטלה</Label>
                <Input id="location" value={form.location} onChange={(e) => updateForm("location", e.target.value)} placeholder="כתובת מלאה" className="mt-1 rounded-2xl h-12" />
                <div className="mt-3">
                  <GoogleMapPicker
                    lat={selectedLat}
                    lng={selectedLng}
                    onLocationSelect={(lat, lng) => {
                      setSelectedLat(lat);
                      setSelectedLng(lng);
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="date">תאריך</Label>
                  <Input id="date" type="date" value={form.date} onChange={(e) => updateForm("date", e.target.value)} className="mt-1 rounded-2xl h-12" />
                </div>
                <div>
                  <Label htmlFor="time">שעה</Label>
                  <Input id="time" type="time" value={form.time} onChange={(e) => updateForm("time", e.target.value)} className="mt-1 rounded-2xl h-12" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="duration">משך זמן</Label>
                  <div className="flex gap-2 mt-1">
                    <Input id="duration" type="number" value={form.duration} onChange={(e) => updateForm("duration", e.target.value)} className="rounded-2xl h-12 flex-1" min={1} step={1} />
                    <Select value={form.durationUnit} onValueChange={(v) => updateForm("durationUnit", v)}>
                      <SelectTrigger className="rounded-2xl h-12 w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hours">שעות</SelectItem>
                        <SelectItem value="minutes">דקות</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                </div>
                <div>
                  <Label htmlFor="expiry">תוקף (שעות)</Label>
                  <Input id="expiry" type="number" value={form.expiry} onChange={(e) => updateForm("expiry", e.target.value)} className="mt-1 rounded-2xl h-12" min={1} />
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="flex flex-col gap-5">
              <h2 className="text-xl font-extrabold text-foreground mb-2">תמונה והערות</h2>
              <div>
                <Label htmlFor="image">הוסף תמונה</Label>
                <div className="mt-2 border-2 border-dashed border-border rounded-2xl p-8 text-center cursor-pointer hover:border-primary transition-colors">
                  <Image size={40} className="mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm font-semibold text-muted-foreground">לחץ להעלאת תמונה</p>
                  <input type="file" accept="image/*" className="hidden" id="image" />
                </div>
              </div>
              <div>
                <Label htmlFor="notes">הערות נוספות</Label>
                <Textarea id="notes" value={form.notes} onChange={(e) => updateForm("notes", e.target.value)} placeholder="הערות נוספות..." className="mt-1 rounded-2xl min-h-[100px]" />
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-xl font-extrabold text-foreground mb-2">סיכום המטלה ✅</h2>
              <div className="bg-muted rounded-2xl p-5 space-y-3 text-sm">
                <SummaryRow label="קטגוריה" value={categories.find(c => c.value === form.category)?.label || ""} />
                <SummaryRow label="שם" value={form.taskName} />
                <SummaryRow label="תיאור" value={form.shortDesc} />
                <SummaryRow label="תשלום" value={`₪${form.payment} / ${form.paymentType === "hour" ? "שעה" : "משימה"}`} />
                <SummaryRow label="עובדים" value={form.workers} />
                <SummaryRow label="מיקום" value={form.location} />
                <SummaryRow label="תאריך" value={`${form.date} ${form.time}`} />
                <SummaryRow label="אורך" value={`${form.duration} ${form.durationUnit === "minutes" ? "דקות" : "שעות"}`} />
                <SummaryRow label="תוקף" value={`${form.expiry} שעות`} />
                {form.notes && <SummaryRow label="הערות" value={form.notes} />}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            <Button
              variant="outline"
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 1}
              className="rounded-full px-6 font-bold"
            >
              <ChevronRight size={18} />
              הקודם
            </Button>

            {step < 6 ? (
              <Button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canProceed()}
                className="gradient-honey text-primary-foreground rounded-full px-6 border-none font-bold hover:scale-105 transition-transform"
              >
                הבא
                <ChevronLeft size={18} />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={loading}
                className="gradient-honey text-primary-foreground rounded-full px-8 border-none font-extrabold hover:scale-105 transition-transform text-lg"
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

const SummaryRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between items-start">
    <span className="font-bold text-foreground">{label}:</span>
    <span className="text-muted-foreground text-left max-w-[60%]">{value}</span>
  </div>
);

export default CreateTask;
