import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const plans = [
  {
    id: "free", name: "חינם", price: "0 ₪", period: "", description: "עמלה של 3 ₪ לכל משימה",
    features: ["הרשמה חינם", "גישה לכל המטלות", "3 ₪ עמלה למשימה"], popular: false,
  },
  {
    id: "quarterly", name: "רבעוני", price: "30 ₪", period: "ל-3 חודשים", description: "ללא עמלה על משימות",
    features: ["ללא עמלות", "גישה לכל המטלות", "תמיכה בדוא״ל", "עדיפות בתוצאות"], popular: true,
  },
  {
    id: "annual", name: "שנתי", price: "100 ₪", period: "לשנה", description: "החיסכון הגדול ביותר",
    features: ["ללא עמלות", "גישה לכל המטלות", "תמיכה מועדפת", "עדיפות בתוצאות", "סטטיסטיקות מתקדמות"], popular: false,
  },
];

const Pricing = () => {
  const { user } = useAuth();
  
  const navigate = useNavigate();
  const goBack = () => { if (window.history.length > 2) { navigate(-1); } else { navigate("/"); } };

  const handlePlanClick = (planId: string) => {
    if (!user) {
      navigate(`/register/proposer?plan=${planId}`);
    } else if (planId === "free") {
      toast.info("אתה כבר רשום בתוכנית החינמית");
    } else {
      navigate(`/register/proposer?plan=${planId}`);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden" dir="rtl">
      <div className="absolute inset-0 bg-muted" />
      <div className="absolute top-20 left-10 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-blob" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-blob animation-delay-2000" />

      <PageHeader title="תוכניות מנוי" />

      <div className="max-w-5xl mx-auto py-12 px-4 relative z-10">
        <div className="text-center mb-14">
          <h1 className="text-5xl font-extrabold text-foreground mb-3">תוכניות מנוי 🐝</h1>
          <p className="text-muted-foreground text-lg font-medium">בחרו את התוכנית שמתאימה לכם</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-10">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`glass rounded-3xl p-8 border-2 card-hover relative ${
                plan.popular
                  ? "border-primary shadow-glow scale-105"
                  : "border-border"
              }`}
            >
              {plan.popular && (
                <Badge className="absolute -top-3 right-6 gradient-honey text-primary-foreground border-none px-4 py-1 text-sm font-extrabold rounded-xl">
                  הכי פופולרי ⭐
                </Badge>
              )}
              <h3 className="text-2xl font-extrabold text-foreground mb-1">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-black text-gradient-honey">{plan.price}</span>
                {plan.period && (
                  <span className="text-muted-foreground text-sm font-medium">{plan.period}</span>
                )}
              </div>
              <p className="text-muted-foreground text-sm mb-6">{plan.description}</p>
              <ul className="flex flex-col gap-2.5 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-foreground text-sm font-medium">
                    <span className="text-primary-ink font-bold">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => handlePlanClick(plan.id)}
                className={`w-full py-5 rounded-2xl font-extrabold text-lg border-none hover:scale-[1.02] transition-transform duration-300 ${
                  plan.popular
                    ? "gradient-honey text-primary-foreground"
                    : "bg-muted text-foreground hover:bg-muted/80"
                }`}
              >
                {plan.id === "free" ? "התחל בחינם" : "הירשם עכשיו"}
              </Button>
            </div>
          ))}
        </div>

        {/* Insurance info note */}
        <p className="text-center text-muted-foreground text-sm max-w-lg mx-auto">
          🛡️ למנויים בתשלום — אפשרות להוסיף ביטוח מטלות (5 ₪/חודש) זמינה בעת ההרשמה ובמסך יצירת מטלה.
        </p>
      </div>
    </div>
  );
};

export default Pricing;
