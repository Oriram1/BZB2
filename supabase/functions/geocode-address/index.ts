import { corsHeadersFor, withCors, readJsonObject } from "../_shared/auth.ts";

Deno.serve(withCors(async (request) => {
  const cors = corsHeadersFor(request);

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Parsed outside the try below: that catch turns everything into a generic
  // 500, which would swallow the boundary errors as "Geocoding failed".
  let address: unknown;
  try {
    ({ address } = await readJsonObject(request, 8_192));
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_json";
    return new Response(JSON.stringify({ error: message }), {
      status: message === "payload_too_large" ? 413 : 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    if (typeof address !== "string" || !address.trim() || address.trim().length > 500) {
      return new Response(JSON.stringify({ error: "Address is required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY is not configured");

    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address.trim());
    url.searchParams.set("region", "il");
    url.searchParams.set("language", "he");
    url.searchParams.set("key", apiKey);

    const googleResponse = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    const googleData = await googleResponse.json();
    const result = googleData.results?.[0];
    if (!result || googleData.status !== "OK") {
      return new Response(JSON.stringify({ formattedAddress: null, lat: null, lng: null }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      formattedAddress: result.formatted_address,
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("geocode-address failed", error);
    return new Response(JSON.stringify({ error: "Geocoding failed" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}));
