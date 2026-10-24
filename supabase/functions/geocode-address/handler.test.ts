import { assertEquals } from "jsr:@std/assert@1";
import { handleGeocode } from "./handler.ts";

Deno.test("geocode handler authenticates, validates and gates provider access on quota", async () => {
  const originalFetch = globalThis.fetch;
  const keys = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_MAPS_SERVER_API_KEY"];
  const previous = keys.map(key => Deno.env.get(key));
  Deno.env.set(keys[0], "https://supabase.test");
  for (const key of keys.slice(1)) Deno.env.set(key, "test-key");
  let providerCalls = 0;
  let allow = true;
  let quotaFailure = false;
  let providerStatus = "OK";
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) return Promise.resolve(Response.json({
      id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated",
    }));
    if (url.includes("/rpc/consume_geocode_quota")) {
      return Promise.resolve(quotaFailure
        ? Response.json({ message: "database unavailable" }, { status: 500 })
        : Response.json({ allowed: allow, retry_after: allow ? 0 : 30 }));
    }
    if (url.startsWith("https://maps.googleapis.com/")) {
      providerCalls++;
      return Promise.resolve(Response.json({ status: providerStatus, results: providerStatus === "OK" ? [{
        formatted_address: "Tel Aviv", geometry: { location: { lat: 32.08, lng: 34.78 } },
      }] : [] }));
    }
    throw new Error("unexpected network call");
  }) as typeof fetch;
  const request = (body: string, token = true) => new Request("https://edge.test", {
    method: "POST", body,
    headers: { ...(token ? { Authorization: "Bearer user-token" } : {}), Origin: "https://bzb-web.com" },
  });
  try {
    assertEquals((await handleGeocode(request('{"address":"Tel Aviv"}', false))).status, 401);
    assertEquals((await handleGeocode(request('{'))).status, 400);
    assertEquals((await handleGeocode(request('{"address":""}'))).status, 400);
    assertEquals(providerCalls, 0);
    let result = await handleGeocode(request('{"address":"Tel Aviv"}'));
    assertEquals(result.status, 200);
    assertEquals(await result.json(), { formattedAddress: "Tel Aviv", lat: 32.08, lng: 34.78 });
    assertEquals(providerCalls, 1);
    allow = false;
    result = await handleGeocode(request('{"address":"Tel Aviv"}'));
    assertEquals(result.status, 429);
    assertEquals(result.headers.get("Retry-After"), "30");
    assertEquals(result.headers.get("Access-Control-Allow-Origin"), "https://bzb-web.com");
    assertEquals(providerCalls, 1);
    allow = true;
    quotaFailure = true;
    assertEquals((await handleGeocode(request('{"address":"Tel Aviv"}'))).status, 500);
    assertEquals(providerCalls, 1);
    quotaFailure = false;
    providerStatus = "ZERO_RESULTS";
    assertEquals(await (await handleGeocode(request('{"address":"Unknown"}'))).json(), {
      formattedAddress: null, lat: null, lng: null,
    });
    providerStatus = "REQUEST_DENIED";
    result = await handleGeocode(request('{"address":"Tel Aviv"}'));
    assertEquals(result.status, 500);
    assertEquals(await result.json(), { error: "internal_error" });
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, index) => {
      if (previous[index] === undefined) Deno.env.delete(key);
      else Deno.env.set(key, previous[index]!);
    });
  }
});
