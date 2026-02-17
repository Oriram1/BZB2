import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import bzbLogo from "@/assets/bzb-logo.png";

const plans = [
  {
    id: "free",
    name: "חינם",
    price: "0 ₪",
    period: "",
    description: "עמלה של 3 ₪ לכל משימה",
    features: ["הרשמה חינם", "גישה לכל המטלות", "3 ₪ עמלה למשימה"],
    popular: false,
  },
  {
    id: "quarterly",
    name: "רבעוני",
    price: "30 ₪",
    period: "ל-3 חודשים",
    description: "ללא עמלה על משימות",
    features: ["ללא עמלות", "גישה לכל המטלות", "תמיכה בדוא״ל", "עדיפות בתוצאות"],
    popular: true,
  },
  {
    id: "annual",
    name: "שנתי",
    price: "100 ₪",
    period: "לשנה",
    description: "החיסכון הגדול ביותר",
    features: [
      "ללא עמלות",
      "גישה לכל המטלות",
      "תמיכה מועדפת",
      "עדיפות בתוצאות",
      "סטטיסטיקות מתקדמות",
    ],
    popular: false,
  },
];

const Pricing = () => {
  const [wantInsurance, setWantInsurance] = useState(false);

  return (
    <div className="min-h-screen bg-muted honeycomb-pattern" dir="rtl">
      <header className="gradient-honey py-4 px-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={bzbLogo} alt="BZB" className="w-10 h-10" />
            <span className="font-bold text-primary-foreground text-lg">BZB</span>
          </Link>
          <Link to="/tasks">
            <Button size="sm" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10 rounded-full">
              חזרה למטלות
            </Button>
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto py-12 px-4">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-3">תוכניות מנוי 🐝</h1>
          <p className="text-muted-foreground text-lg">בחרו את התוכנית שמתאימה לכם</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-10">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`bg-card rounded-3xl p-8 border-2 transition-shadow relative ${
                plan.popular
                  ? "border-primary shadow-honey scale-105"
                  : "border-border hover:shadow-honey"
              }`}
            >
              {plan.popular && (
                <Badge className="absolute -top-3 right-6 gradient-honey text-primary-foreground border-none px-4 py-1 text-sm font-bold">
                  הכי פופולרי ⭐
                </Badge>
              )}
              <h3 className="text-2xl font-bold text-foreground mb-1">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-black text-gradient-honey">{plan.price}</span>
                {plan.period && (
                  <span className="text-muted-foreground text-sm">{plan.period}</span>
                )}
              </div>
              <p className="text-muted-foreground text-sm mb-6">{plan.description}</p>
              <ul className="flex flex-col gap-2 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-foreground text-sm">
                    <span className="text-primary">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Button
                className={`w-full py-5 rounded-xl font-bold text-lg border-none transition-opacity ${
                  plan.popular
                    ? "gradient-honey text-primary-foreground hover:opacity-90"
                    : "bg-muted text-foreground hover:bg-muted/80"
                }`}
              >
                {plan.id === "free" ? "התחל בחינם" : "הירשם עכשיו"}
              </Button>
            </div>
          ))}
        </div>

        {/* Insurance Option */}
        <div className="bg-card rounded-2xl p-6 border border-border max-w-lg mx-auto text-center">
          <h3 className="text-lg font-bold text-foreground mb-2">🛡️ ביטוח מטלות</h3>
          <p className="text-muted-foreground text-sm mb-4">
            למנויים בלבד - הוסיפו ביטוח בעלות של 5 ₪ לחודש
          </p>
          <div className="flex items-center justify-center gap-2">
            <Checkbox
              id="insurance"
              checked={wantInsurance}
              onCheckedChange={(v) => setWantInsurance(v === true)}
            />
            <label htmlFor="insurance" className="text-sm font-medium text-foreground cursor-pointer">
              אני מעוניין/ת בביטוח (+5 ₪/חודש)
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Pricing;
