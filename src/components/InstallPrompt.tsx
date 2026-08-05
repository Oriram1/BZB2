import { useEffect, useState } from "react";
import { Share, X, Download } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { isIos, isStandalone } from "@/lib/push";
import { supabase } from "@/integrations/supabase/client";

const FIRST_REMINDER_DAYS = 7;
const SECOND_REMINDER_DAYS = 30;

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type PromptPreference = {
  dismiss_count: number;
  next_prompt_at: string | null;
  permanently_dismissed: boolean;
  installed_at: string | null;
};

const fallbackKey = (userId: string) => `bzb.install-prompt:${userId}`;

const getFallbackPreference = (userId: string): PromptPreference | null => {
  try {
    const value = localStorage.getItem(fallbackKey(userId));
    return value ? JSON.parse(value) as PromptPreference : null;
  } catch {
    return null;
  }
};

const canShowPrompt = (preference: PromptPreference | null) => {
  if (!preference) return true;
  if (preference.installed_at || preference.permanently_dismissed) return false;
  return !preference.next_prompt_at || new Date(preference.next_prompt_at).getTime() <= Date.now();
};

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
  const location = useLocation();
  const isMobile = useIsMobile();
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [preference, setPreference] = useState<PromptPreference | null>(null);
  const [eligible, setEligible] = useState(false);
  const [visible, setVisible] = useState(false);
  const isEligibleScreen = location.pathname !== "/";

  useEffect(() => {
    if (!isMobile || !user || !isEligibleScreen || isStandalone()) return;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallEvent);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [isEligibleScreen, isMobile, user]);

  useEffect(() => {
    if (!isMobile || !user || !isEligibleScreen || isStandalone()) {
      setEligible(false);
      setVisible(false);
      return;
    }

    let cancelled = false;
    void supabase
      .from("pwa_install_prompt_preferences")
      .select("dismiss_count, next_prompt_at, permanently_dismissed, installed_at")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        const resolved = error ? getFallbackPreference(user.id) : data;
        setPreference(resolved);
        setEligible(canShowPrompt(resolved));
      });

    return () => { cancelled = true; };
  }, [isEligibleScreen, isMobile, user]);

  useEffect(() => {
    setVisible(eligible && (isIos() || Boolean(deferred)));
  }, [deferred, eligible]);

  const dismiss = async () => {
    if (!user) return;
    const dismissCount = Math.min((preference?.dismiss_count ?? 0) + 1, 3);
    const permanentlyDismissed = dismissCount >= 3;
    const reminderDays = dismissCount === 1 ? FIRST_REMINDER_DAYS : SECOND_REMINDER_DAYS;
    const nextPromptAt = permanentlyDismissed
      ? null
      : new Date(Date.now() + reminderDays * 24 * 60 * 60 * 1000).toISOString();
    const nextPreference: PromptPreference = {
      dismiss_count: dismissCount,
      next_prompt_at: nextPromptAt,
      permanently_dismissed: permanentlyDismissed,
      installed_at: preference?.installed_at ?? null,
    };

    localStorage.setItem(fallbackKey(user.id), JSON.stringify(nextPreference));
    setPreference(nextPreference);
    setEligible(false);
    setVisible(false);
    await supabase.from("pwa_install_prompt_preferences").upsert({
      user_id: user.id,
      ...nextPreference,
    });
  };

  const install = async () => {
    if (!deferred || !user) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
    if (choice.outcome !== "accepted") return;

    const installedAt = new Date().toISOString();
    await supabase.from("pwa_install_prompt_preferences").upsert({
      user_id: user.id,
      dismiss_count: preference?.dismiss_count ?? 0,
      next_prompt_at: null,
      permanently_dismissed: false,
      installed_at: installedAt,
    });
  };

  if (!isMobile || !user || !isEligibleScreen || !visible) return null;

  return (
    <div
      dir="rtl"
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] inset-x-4 z-50 max-w-md mx-auto bg-background border-2 border-primary/25 shadow-2xl rounded-2xl p-4 animate-slide-up"
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
              className="mt-3 min-h-11 gradient-honey text-primary-foreground rounded-full border-none font-bold gap-1.5 shadow-md"
            >
              <Download size={14} />
              התקנה
            </Button>
          )}
        </div>

        <button
          type="button"
          onClick={() => { void dismiss(); }}
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
