import { useEffect, useState } from "react";
import { Share, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { isIos, isStandalone } from "@/lib/push";

const DISMISS_KEY = "bzb.install-prompt.dismissed";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };

/**
 * Nudges signed-in users to install the app.
 *
 * On iOS this is the only path to push notifications at all — Safari exposes
 * PushManager to home-screen installs only — so the banner explains the manual
 * Share → "Add to Home Screen" steps rather than offering a button that iOS
 * would never honour.
 */
const InstallPrompt = () => {
  const { user } = useAuth();
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user || isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    if (isIos()) {
      setVisible(true);
      return;
    }

    const onPrompt = (event: Event) => {
      // Holding the event lets us show our own banner instead of Chrome's,
      // which we can place where it does not cover the bottom nav.
      event.preventDefault();
      setDeferred(event as InstallEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [user]);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    dismiss();
  };

  if (!visible) return null;

  return (
    <div
      dir="rtl"
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4 inset-x-4 z-40 max-w-md mx-auto bg-card border border-border shadow-xl rounded-2xl p-4 animate-slide-up"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none shrink-0" aria-hidden="true">🐝</span>
        <div className="flex-1 min-w-0">
          <p className="font-extrabold text-foreground text-sm">התקינו את BZB</p>
          {isIos() ? (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              לחצו על <Share size={12} className="inline mx-0.5" aria-label="כפתור השיתוף" /> בסרגל
              של ספארי ובחרו "הוספה למסך הבית". רק כך אפשר לקבל התראות באייפון.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              גישה מהירה מהמסך הראשי, והתראות על מטלות ומועמדויות.
            </p>
          )}

          {!isIos() && (
            <Button
              size="sm"
              onClick={install}
              className="mt-3 gradient-honey text-primary-foreground rounded-full border-none font-bold gap-1.5"
            >
              <Download size={14} />
              התקנה
            </Button>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="סגירת ההצעה"
          className="shrink-0 w-8 h-8 rounded-full hover:bg-accent/40 flex items-center justify-center text-muted-foreground"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default InstallPrompt;
