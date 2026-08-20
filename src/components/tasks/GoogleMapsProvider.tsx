/* eslint-disable react-refresh/only-export-components -- provider and consumer are one integration boundary. */
import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

type GoogleMapsContextValue = {
  isLoaded: boolean;
  error: string | null;
  retry: () => void;
};

const GoogleMapsContext = createContext<GoogleMapsContextValue>({
  isLoaded: false,
  error: null,
  retry: () => {},
});

export const useGoogleMaps = () => useContext(GoogleMapsContext);

let loaderPromise: Promise<void> | null = null;

function loadMaps(): Promise<void> {
  if (!GOOGLE_MAPS_API_KEY) {
    return Promise.reject(new Error("missing-api-key"));
  }

  if (!loaderPromise) {
    setOptions({
      key: GOOGLE_MAPS_API_KEY,
      language: "he",
      region: "IL",
    });
    loaderPromise = importLibrary("maps")
      .then(() => {})
      .catch((error: unknown) => {
        // A PWA can resume before its network is ready. Never keep a rejected
        // promise forever: the next retry must be allowed to load Maps again.
        loaderPromise = null;
        throw error;
      });
  }
  return loaderPromise;
}

export const GoogleMapsProvider = ({ children }: { children: ReactNode }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    if (!GOOGLE_MAPS_API_KEY) return;
    setError(null);
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      setError("מפת Google Maps זמינה רק במסכים שמוגדר להם מפתח ציבורי.");
      return;
    }
    let cancelled = false;
    loadMaps()
      .then(() => {
        if (!cancelled) {
          setError(null);
          setIsLoaded(true);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("Failed to load Google Maps", err);
        setError(
          !GOOGLE_MAPS_API_KEY
            ? "חסר מפתח Google Maps. יש להגדיר VITE_GOOGLE_MAPS_API_KEY בקובץ .env ולהפעיל מחדש את האפליקציה."
            : "Google Maps לא נטען. כדאי לבדוק שהמפתח תקין, שה-Maps JavaScript API פעיל ושיש חיוב/הרשאות מתאימות."
        );
      });
    return () => { cancelled = true; };
  }, [attempt]);

  useEffect(() => {
    if (!error) return;

    const retryWhenReady = () => {
      if (document.visibilityState === "visible" && navigator.onLine) retry();
    };

    window.addEventListener("online", retryWhenReady);
    document.addEventListener("visibilitychange", retryWhenReady);
    const timer = attempt === 0 ? window.setTimeout(retryWhenReady, 2_000) : undefined;

    return () => {
      window.removeEventListener("online", retryWhenReady);
      document.removeEventListener("visibilitychange", retryWhenReady);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [attempt, error, retry]);

  return (
    <GoogleMapsContext.Provider value={{ isLoaded, error, retry }}>
      {children}
    </GoogleMapsContext.Provider>
  );
};
