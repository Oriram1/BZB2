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
  } catch {
    // Private browsing can throw on localStorage; treat it as no consent yet.
  }
  return null;
}

const CookieConsent = () => {
  const [consent, setConsent] = useState<ConsentLevel>(getStoredConsent);

  useEffect(() => {
    setConsent(getStoredConsent());
  }, []);

  /**
   * WCAG 2.4.11: the banner is pinned to the bottom, so anything the keyboard
   * scrolls to near the end of a page lands underneath it. Reserving the
   * banner's height as scroll padding keeps the focused element in view.
   */
  useEffect(() => {
    if (consent !== null) return;
    document.documentElement.style.scrollPaddingBottom = "16rem";
    return () => {
      document.documentElement.style.scrollPaddingBottom = "";
    };
  }, [consent]);

  if (consent !== null) return null;

  const accept = (level: ConsentLevel) => {
    setConsent(level);
    try {
      localStorage.setItem(CONSENT_KEY, level!);
    } catch {
      // Storage unavailable: the choice still applies for this page view.
    }
  };

  return (
    <div
      dir="rtl"
      // Not role="dialog": nothing here is modal and focus is never moved into
      // it, so a dialog role would promise a trap that does not exist.
      role="region"
      aria-labelledby="cookie-consent-title"
      className="fixed bottom-0 inset-x-0 z-[9999] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
    >
      <div className="max-w-lg mx-auto bg-card border border-border rounded-2xl shadow-xl p-5 animate-pop-in">
        <div className="flex items-start gap-3">
          <Cookie aria-hidden="true" className="w-6 h-6 text-primary-ink shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p id="cookie-consent-title" className="text-sm font-bold text-foreground mb-1">האתר משתמש בעוגיות</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              אנחנו משתמשים בעוגיות הכרחיות לתפקוד האתר, ובעוגיות אופציונליות לניתוח סטטיסטי ושיפור חוויית המשתמש.{" "}
              <Link to="/privacy" className="text-primary-ink underline font-semibold rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
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
          {/* -m-2 keeps the visual size while the hit area grows to 44x44 (WCAG 2.5.8). */}
          <button
            onClick={() => accept("essential")}
            className="flex h-11 w-11 -m-2 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="סגירה"
          >
            <X aria-hidden="true" className="w-4 h-4" />
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
