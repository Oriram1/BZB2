import { supabase } from "@/integrations/supabase/client";

export const geocodeAddress = async (address: string): Promise<string | null> => {
  const { data, error } = await supabase.functions.invoke("geocode-address", {
    body: { address },
  });
  if (error || !data?.formattedAddress) return null;
  return data.formattedAddress;
};
