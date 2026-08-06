import { corsHeaders, corsOrigin } from "../_shared/auth.ts";

Deno.serve(async (request) => {
  const cors = { ...corsHeaders, "Access-Control-Allow-Origin": corsOrigin(request) };

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const { address } = await request.json();
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
});
