import { supabase } from "@/integrations/supabase/client";

export interface GeocodedAddress { formattedAddress: string; lat: number; lng: number; }

export const geocodeAddress = async (address: string): Promise<GeocodedAddress | null> => {
  if (typeof window !== "undefined" && window.google?.maps) {
    return new Promise((resolve) => {
      new google.maps.Geocoder().geocode({ address, region: "IL" }, (results, status) => {
        const result = results?.[0];
        if (status !== "OK" || !result) return resolve(null);
        resolve({
          formattedAddress: result.formatted_address,
          lat: result.geometry.location.lat(),
          lng: result.geometry.location.lng(),
        });
      });
    });
  }

  const { data, error } = await supabase.functions.invoke("geocode-address", {
    body: { address },
  });
  if (error || !data?.formattedAddress || typeof data.lat !== "number" || typeof data.lng !== "number") return null;
  return data;
};
