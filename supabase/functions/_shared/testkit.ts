/** Helpers for handler tests that run against a fake Supabase and fake providers. Test-only. */

export const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";

const SUPABASE_ENV = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"];

/**
 * Runs `run` with Supabase env vars set and `fetch` replaced. Auth answers with
 * a signed-in user; `route` answers every other URL (return `undefined` for a
 * URL the test does not expect, which fails the test). Env and `fetch` are restored afterwards.
 */
export async function withFakeSupabase(
  options: { env?: Record<string, string>; route: (url: string, init?: RequestInit) => Response | undefined },
  run: () => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  const env = { SUPABASE_URL: "https://supabase.test", ...Object.fromEntries(SUPABASE_ENV.slice(1).map((key) => [key, "test-key"])), ...options.env };
  const previous = Object.keys(env).map((key) => [key, Deno.env.get(key)] as const);
  for (const [key, value] of Object.entries(env)) Deno.env.set(key, value);

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const response = url.includes("/auth/v1/user")
      ? Response.json({ id: TEST_USER_ID, aud: "authenticated", role: "authenticated" })
      : options.route(url, init);
    if (!response) throw new Error(`unexpected network call: ${url}`);
    return Promise.resolve(response);
  }) as typeof fetch;

  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

/** A POST from the production origin; pass `signedIn: false` to leave out the bearer token. */
export function postRequest(body: string, signedIn = true) {
  return new Request("https://edge.test", {
    method: "POST",
    body,
    headers: { ...(signedIn ? { Authorization: "Bearer user-token" } : {}), Origin: "https://bzb-web.com" },
  });
}
