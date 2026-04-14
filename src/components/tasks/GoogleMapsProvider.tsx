import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Loader } from "@googlemaps/js-api-loader";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

const GoogleMapsContext = createContext<{ isLoaded: boolean }>({ isLoaded: false });

export const useGoogleMaps = () => useContext(GoogleMapsContext);

let loaderPromise: Promise<void> | null = null;

export const GoogleMapsProvider = ({ children }: { children: ReactNode }) => {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!loaderPromise) {
      const loader = new Loader({
        apiKey: GOOGLE_MAPS_API_KEY,
        language: "he",
        region: "IL",
      });
      loaderPromise = loader.importLibrary("maps").then(() => {});
    }
    loaderPromise.then(() => setIsLoaded(true)).catch(console.error);
  }, []);

  return (
    <GoogleMapsContext.Provider value={{ isLoaded }}>
      {children}
    </GoogleMapsContext.Provider>
  );
};
