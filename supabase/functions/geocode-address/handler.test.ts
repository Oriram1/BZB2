import { assertEquals } from "jsr:@std/assert@1";
import { postRequest, withFakeSupabase } from "../_shared/testkit.ts";
import { handleGeocode } from "./handler.ts";

const ADDRESS = '{"address":"Tel Aviv"}';
const TEL_AVIV = { results: [{ formatted_address: "Tel Aviv", geometry: { location: { lat: 32.08, lng: 34.78 } } }], status: "OK" };

/** Fake quota RPC and Google; `provider.calls` counts paid lookups. */
function fakeBackend(state: { quota: Response; google: unknown }) {
  const provider = { calls: 0 };
  const route = (url: string) => {
    if (url.includes("/rpc/consume_geocode_quota")) return state.quota.clone();
    if (url.startsWith("https://maps.googleapis.com/")) {
      provider.calls++;
      return Response.json(state.google);
    }
  };
  return { provider, route };
}

const allowed = () => Response.json({ allowed: true, retry_after: 0 });
const run = (state: Parameters<typeof fakeBackend>[0], test: (backend: ReturnType<typeof fakeBackend>) => Promise<void>) => {
  const backend = fakeBackend(state);
  return withFakeSupabase({ env: { GOOGLE_MAPS_SERVER_API_KEY: "test-key" }, route: backend.route }, () => test(backend));
};

Deno.test("geocode rejects unauthenticated and invalid requests before touching the provider", () =>
  run({ quota: allowed(), google: TEL_AVIV }, async ({ provider }) => {
    assertEquals((await handleGeocode(postRequest(ADDRESS, false))).status, 401);
    assertEquals((await handleGeocode(postRequest("{"))).status, 400);
    assertEquals((await handleGeocode(postRequest('{"address":""}'))).status, 400);
    assertEquals((await handleGeocode(postRequest(JSON.stringify({ address: "x".repeat(501) })))).status, 400);
    assertEquals(provider.calls, 0);
  }));

Deno.test("geocode returns the provider's first match", () =>
  run({ quota: allowed(), google: TEL_AVIV }, async ({ provider }) => {
    const response = await handleGeocode(postRequest(ADDRESS));
    assertEquals(response.status, 200);
    assertEquals(await response.json(), { formattedAddress: "Tel Aviv", lat: 32.08, lng: 34.78 });
    assertEquals(provider.calls, 1);
  }));

Deno.test("geocode answers 429 with Retry-After and skips the provider when over quota", () =>
  run({ quota: Response.json({ allowed: false, retry_after: 30 }), google: TEL_AVIV }, async ({ provider }) => {
    const response = await handleGeocode(postRequest(ADDRESS));
    assertEquals(response.status, 429);
    assertEquals(response.headers.get("Retry-After"), "30");
    assertEquals(response.headers.get("Access-Control-Allow-Origin"), "https://bzb-web.com");
    assertEquals(provider.calls, 0);
  }));

Deno.test("geocode fails closed when the quota check itself fails", () =>
  run({ quota: Response.json({ message: "database unavailable" }, { status: 500 }), google: TEL_AVIV }, async ({ provider }) => {
    assertEquals((await handleGeocode(postRequest(ADDRESS))).status, 500);
    assertEquals(provider.calls, 0);
  }));

Deno.test("geocode reports an unknown address as nulls, not an error", () =>
  run({ quota: allowed(), google: { status: "ZERO_RESULTS", results: [] } }, async () => {
    const response = await handleGeocode(postRequest('{"address":"Unknown"}'));
    assertEquals(response.status, 200);
    assertEquals(await response.json(), { formattedAddress: null, lat: null, lng: null });
  }));

Deno.test("geocode hides a provider rejection behind internal_error", () =>
  run({ quota: allowed(), google: { status: "REQUEST_DENIED", results: [] } }, async () => {
    const response = await handleGeocode(postRequest(ADDRESS));
    assertEquals(response.status, 500);
    assertEquals(await response.json(), { error: "internal_error" });
  }));
