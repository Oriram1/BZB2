import { authenticatedClients, consumeQuota, json, postHandler, readJsonObject } from "../_shared/auth.ts";

export const handleGeocode = postHandler(async (request) => {
  // Authenticate before consuming quota or contacting the paid provider.
  const { user, admin } = await authenticatedClients(request);
  const { address } = await readJsonObject(request, 8_192);
  if (typeof address !== "string" || !address.trim() || address.trim().length > 500) {
    return json({ error: "Address is required" }, 400);
  }

  const apiKey = Deno.env.get("GOOGLE_MAPS_SERVER_API_KEY");
  if (!apiKey) throw new Error("server_not_configured");

  const limited = await consumeQuota(admin, "consume_geocode_quota", user.id);
  if (limited) return limited;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address.trim());
  url.searchParams.set("region", "il");
  url.searchParams.set("language", "he");
  url.searchParams.set("key", apiKey);

  const googleResponse = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!googleResponse.ok) throw new Error("geocode_provider_unavailable");
  const googleData = await googleResponse.json();
  const result = googleData.results?.[0];
  if (!result || googleData.status !== "OK") {
    if (googleData.status !== "ZERO_RESULTS") throw new Error("geocode_provider_rejected");
    return json({ formattedAddress: null, lat: null, lng: null });
  }

  return json({
    formattedAddress: result.formatted_address,
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
  });
});
