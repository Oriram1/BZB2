import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Cookie, X } from "lucide-react";
import { CONSENT_CHANGED, CONSENT_KEY, getStoredConsent, type ConsentLevel } from "@/lib/performanceConsent";
import { ROUTES } from "@/lib/routes";
import { writeStorage } from "@/lib/storage";

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
    // Without storage the choice still applies for this page view.
    if (writeStorage(CONSENT_KEY, level!)) window.dispatchEvent(new Event(CONSENT_CHANGED));
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
      {/* Same look as the redesigned screens: white card, Rubik, orange primary, pill buttons. */}
      <div className="figma mx-auto max-w-md rounded-[20px] bg-card p-5 shadow-[0_8px_32px_rgb(0_0_0/0.12)] animate-pop-in">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Cookie className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p id="cookie-consent-title" className="mb-1 text-base font-bold text-foreground">האתר משתמש בעוגיות</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              עוגיות הכרחיות לתפקוד האתר, ואופציונליות לשיפור החוויה.{" "}
              <Link to={ROUTES.privacy} className="rounded font-medium text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                מדיניות פרטיות
              </Link>
            </p>
          </div>
          {/* -m-2 keeps the visual size while the hit area grows to 44x44 (WCAG 2.5.8). */}
          <button
            onClick={() => accept("essential")}
            className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="סגירה"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => accept("all")} className="h-11 flex-1 rounded-full text-sm font-medium">
            אישור הכל
          </Button>
          <Button
            variant="ghost"
            onClick={() => accept("essential")}
            className="h-11 flex-1 rounded-full bg-secondary text-sm font-medium text-foreground hover:bg-secondary/80"
          >
            הכרחיות בלבד
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CookieConsent;

