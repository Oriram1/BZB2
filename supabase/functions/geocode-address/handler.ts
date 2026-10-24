import { authenticatedClients, errorResponse, json, withCors, readJsonObject } from "../_shared/auth.ts";

export const handleGeocode = withCors(async (request: Request) => {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  // Authenticate before consuming quota or contacting the paid provider.
  try {
    const { user, admin } = await authenticatedClients(request);
    const { address } = await readJsonObject(request, 8_192);
    if (typeof address !== "string" || !address.trim() || address.trim().length > 500) {
      return json({ error: "Address is required" }, 400);
    }

    const apiKey = Deno.env.get("GOOGLE_MAPS_SERVER_API_KEY");
    if (!apiKey) throw new Error("server_not_configured");

    const { data: quota, error: quotaError } = await admin.rpc("consume_geocode_quota", { _user_id: user.id });
    if (quotaError) throw quotaError;
    if (!quota || typeof quota.allowed !== "boolean") throw new Error("invalid_quota_response");
    if (!quota.allowed) {
      const response = json({ error: "rate_limit_exceeded" }, 429);
      response.headers.set("Retry-After", String(quota.retry_after));
      return response;
    }

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
  } catch (error) {
    return errorResponse(error);
  }
});
