import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

const GoogleMapsContext = createContext<{ isLoaded: boolean; error: string | null }>({
  isLoaded: false,
  error: null,
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
    loaderPromise = importLibrary("maps").then(() => {});
  }
  return loaderPromise;
}

export const GoogleMapsProvider = ({ children }: { children: ReactNode }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      setError("מפת Google Maps זמינה רק במסכים שמוגדר להם מפתח ציבורי.");
      return;
    }
    loadMaps()
      .then(() => setIsLoaded(true))
      .catch((err: unknown) => {
        console.error("Failed to load Google Maps", err);
        setError(
          !GOOGLE_MAPS_API_KEY
            ? "חסר מפתח Google Maps. יש להגדיר VITE_GOOGLE_MAPS_API_KEY בקובץ .env ולהפעיל מחדש את האפליקציה."
            : "Google Maps לא נטען. כדאי לבדוק שהמפתח תקין, שה-Maps JavaScript API פעיל ושיש חיוב/הרשאות מתאימות."
        );
      });
  }, []);

  return (
    <GoogleMapsContext.Provider value={{ isLoaded, error }}>
      {children}
    </GoogleMapsContext.Provider>
  );
};
