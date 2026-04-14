import { useJsApiLoader } from "@react-google-maps/api";
import { createContext, useContext, ReactNode } from "react";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

const GoogleMapsContext = createContext<{ isLoaded: boolean }>({ isLoaded: false });

export const useGoogleMaps = () => useContext(GoogleMapsContext);

export const GoogleMapsProvider = ({ children }: { children: ReactNode }) => {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    language: "he",
    region: "IL",
  });

  return (
    <GoogleMapsContext.Provider value={{ isLoaded }}>
      {children}
    </GoogleMapsContext.Provider>
  );
};
