import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Cookie, X } from "lucide-react";

const CONSENT_KEY = "bzb_cookie_consent";

type ConsentLevel = "all" | "essential" | null;

function getStoredConsent(): ConsentLevel {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    if (value === "all" || value === "essential") return value;
  } catch {}
  return null;
}

const CookieConsent = () => {
  const [consent, setConsent] = useState<ConsentLevel>(getStoredConsent);

  useEffect(() => {
    setConsent(getStoredConsent());
  }, []);

  if (consent !== null) return null;

  const accept = (level: ConsentLevel) => {
    setConsent(level);
    try {
      localStorage.setItem(CONSENT_KEY, level!);
    } catch {}
  };

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-label="הסכמה לעוגיות"
      className="fixed bottom-0 inset-x-0 z-[9999] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
    >
      <div className="max-w-lg mx-auto bg-card border border-border rounded-2xl shadow-xl p-5 animate-pop-in">
        <div className="flex items-start gap-3">
          <Cookie className="w-6 h-6 text-primary-ink shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground mb-1">האתר משתמש בעוגיות</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              אנחנו משתמשים בעוגיות הכרחיות לתפקוד האתר, ובעוגיות אופציונליות לניתוח סטטיסטי ושיפור חוויית המשתמש.{" "}
              <Link to="/privacy" className="text-primary-ink underline font-semibold">
                מדיניות פרטיות
              </Link>
            </p>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                onClick={() => accept("all")}
                className="rounded-xl font-bold gradient-honey text-primary-foreground"
              >
                אישור הכל
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => accept("essential")}
                className="rounded-xl font-bold"
              >
                הכרחיות בלבד
              </Button>
            </div>
          </div>
          <button
            onClick={() => accept("essential")}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="סגירה"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookieConsent;

export function hasCookieConsent(level: "all" | "essential" = "all"): boolean {
  const stored = getStoredConsent();
  if (level === "essential") return stored !== null;
  return stored === "all";
}
