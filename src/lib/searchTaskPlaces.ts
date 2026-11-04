import { geocodeAddress } from "./geocodeAddress";

export interface TaskPlace {
  formattedAddress: string;
  name: string;
  lat: number;
  lng: number;
  precise: boolean;
}

const broadTypes = new Set(["locality", "administrative_area_level_1", "administrative_area_level_2", "country", "postal_code", "neighborhood", "sublocality", "route", "sublocality_level_1", "sublocality_level_2"]);

export async function searchTaskPlaces(query: string): Promise<TaskPlace[]> {
  if (!window.google?.maps) throw new Error("המפה עדיין לא זמינה. נסו שוב בעוד רגע.");
  const { Place } = await google.maps.importLibrary("places") as google.maps.PlacesLibrary;
  const { places } = await Place.searchByText({
    textQuery: query.replace(/(^|\s)(?:ליד|בסמוך ל|בקרבת)\s+/g, "$1").trim(),
    fields: ["displayName", "formattedAddress", "location", "types"],
    language: "he",
    region: "il",
    maxResultCount: 5,
  });
  const candidates = places.flatMap((place): TaskPlace[] => {
    if (!place.location || !place.formattedAddress) return [];
    return [{
      name: place.displayName || place.formattedAddress,
      formattedAddress: place.formattedAddress,
      lat: place.location.lat(),
      lng: place.location.lng(),
      precise: !!place.types?.length && !place.types.some((type) => broadTypes.has(type)),
    }];
  });
  if (candidates.length) return candidates;
  const address = await geocodeAddress(query);
  // A geocode fallback may be a city center. Require a manual pin selection.
  return address ? [{ ...address, name: address.formattedAddress, precise: false }] : [];
}
