import { supabase } from "@/integrations/supabase/client";

export interface GeocodedAddress { formattedAddress: string; lat: number; lng: number; }

export const geocodeAddress = async (address: string): Promise<GeocodedAddress | null> => {
  const { data, error } = await supabase.functions.invoke("geocode-address", {
    body: { address },
  });
  if (error || !data?.formattedAddress || typeof data.lat !== "number" || typeof data.lng !== "number") return null;
  return data;
};
