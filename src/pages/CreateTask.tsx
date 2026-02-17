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
import { Link } from "react-router-dom";
import bzbLogo from "@/assets/bzb-logo.png";
import { toast } from "sonner";

const categories = [
  { value: "housework", label: "🏠 עבודות בית" },
  { value: "gardening", label: "🌿 גינון" },
  { value: "babysitting", label: "👶 בייביסיטר" },
  { value: "pets", label: "🐾 חיות מחמד" },
  { value: "handyman", label: "🔧 הנדימן" },
  { value: "delivery", label: "🚚 משלוחים" },
  { value: "school", label: "📚 מטלות בית ספר" },
  { value: "tutoring", label: "👨‍🏫 שיעורים פרטיים" },
  { value: "other", label: "📦 אחר" },
];

const CreateTask = () => {
  const [paymentType, setPaymentType] = useState("task");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("המטלה פורסמה בהצלחה! 🎉");
  };

  return (
    <div className="min-h-screen bg-muted honeycomb-pattern py-8 px-4" dir="rtl">
      <div className="w-full max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link to="/">
            <img src={bzbLogo} alt="BZB" className="w-12 h-12" />
          </Link>
          <h1 className="text-2xl font-bold text-foreground">פרסום מטלה חדשה 📋</h1>
          <div className="w-12" />
        </div>

        <form onSubmit={handleSubmit} className="bg-card rounded-3xl shadow-honey p-8 border border-border flex flex-col gap-5">
          <div>
            <Label>קטגוריה</Label>
            <Select required>
              <SelectTrigger className="mt-1 rounded-xl">
                <SelectValue placeholder="בחר קטגוריה" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="taskName">שם המשימה</Label>
            <Input id="taskName" placeholder="שם המשימה" className="mt-1 rounded-xl" required />
          </div>

          <div>
            <Label htmlFor="shortDesc">תיאור קצר (עד 40 תווים)</Label>
            <Input id="shortDesc" placeholder="תיאור קצר" className="mt-1 rounded-xl" maxLength={40} required />
          </div>

          <div>
            <Label htmlFor="fullDesc">תיאור מפורט</Label>
            <Textarea id="fullDesc" placeholder="תאר את המשימה בפירוט..." className="mt-1 rounded-xl min-h-[100px]" required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="payment">תשלום מוצע (₪)</Label>
              <Input id="payment" type="number" placeholder="0" className="mt-1 rounded-xl" min={0} required />
            </div>
            <div>
              <Label>סוג תשלום</Label>
              <Select value={paymentType} onValueChange={setPaymentType}>
                <SelectTrigger className="mt-1 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="task">למשימה</SelectItem>
                  <SelectItem value="hour">לשעה</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="workers">מספר עובדים נדרש</Label>
            <Input id="workers" type="number" placeholder="1" className="mt-1 rounded-xl" min={1} defaultValue={1} required />
          </div>

          <div>
            <Label htmlFor="location">מיקום המטלה</Label>
            <Input id="location" placeholder="כתובת מלאה" className="mt-1 rounded-xl" required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date">תאריך</Label>
              <Input id="date" type="date" className="mt-1 rounded-xl" required />
            </div>
            <div>
              <Label htmlFor="time">שעה</Label>
              <Input id="time" type="time" className="mt-1 rounded-xl" required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="duration">אורך המטלה (שעות)</Label>
              <Input id="duration" type="number" placeholder="1" className="mt-1 rounded-xl" min={0.5} step={0.5} required />
            </div>
            <div>
              <Label htmlFor="expiry">תוקף (שעות)</Label>
              <Input id="expiry" type="number" placeholder="24" defaultValue={24} className="mt-1 rounded-xl" min={1} />
            </div>
          </div>

          <div>
            <Label htmlFor="image">הוסף תמונה</Label>
            <Input id="image" type="file" accept="image/*" className="mt-1 rounded-xl" />
          </div>

          <div>
            <Label htmlFor="notes">הערות</Label>
            <Textarea id="notes" placeholder="הערות נוספות..." className="mt-1 rounded-xl" />
          </div>

          <Button type="submit" className="w-full py-6 text-lg font-bold gradient-honey text-primary-foreground rounded-xl border-none hover:opacity-90 transition-opacity mt-2">
            פרסם מטלה 🐝
          </Button>
        </form>
      </div>
    </div>
  );
};

export default CreateTask;
