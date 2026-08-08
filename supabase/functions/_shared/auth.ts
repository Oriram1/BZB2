import { AsyncLocalStorage } from "node:async_hooks";
import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const ALLOWED_ORIGINS = [
  "https://bzb-web.com",
  "https://www.bzb-web.com",
  "http://localhost:5173",
  "http://localhost:8080",
];

export function corsOrigin(req: Request): string {
  const origin = req.headers.get("Origin") ?? "";
  if (ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".vercel.app")) return origin;
  return ALLOWED_ORIGINS[0];
}

/**
 * The site answers on both the apex and the `www.` host, and previews answer on
 * `*.vercel.app`, so a single hard-coded origin fails the preflight for every
 * caller but one. Responses are built deep inside each handler, far from the
 * `Request` — rather than thread it through every call site, `withCors` stashes
 * it here so `json` can echo the caller's own origin.
 */
const requestContext = new AsyncLocalStorage<Request>();

export function corsHeadersFor(req?: Request) {
  return {
    // `Vary` keeps a proxy from serving one origin's headers to another.
    "Vary": "Origin",
    "Access-Control-Allow-Origin": req ? corsOrigin(req) : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

/** Kept for callers that build their own header bag; prefer `corsHeadersFor`. */
export const corsHeaders = corsHeadersFor();

/**
 * Wraps a handler so the preflight answers with the caller's origin and every
 * `json` response inside it does the same.
 */
export function withCors(handler: (req: Request) => Response | Promise<Response>) {
  return (req: Request) =>
    requestContext.run(req, async () => {
      if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeadersFor(req) });
      }
      return await handler(req);
    });
}

export function json(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersFor(req ?? requestContext.getStore()),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export async function authenticatedClients(req: Request): Promise<{
  user: User;
  admin: SupabaseClient;
}> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";

  if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("server_not_configured");
  if (!authHeader.startsWith("Bearer ")) throw new Error("unauthorized");

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new Error("unauthorized");

  return {
    user: data.user,
    admin: createClient(supabaseUrl, serviceKey),
  };
}

export async function hasRole(admin: SupabaseClient, userId: string, role: string) {
  const { data } = await admin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", role)
    .maybeSingle();
  return Boolean(data);
}

export function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "unknown_error";
  if (message === "unauthorized") return json({ error: message }, 401);
  if (message === "forbidden") return json({ error: message }, 403);
  if (message === "invalid_json" || message === "invalid_json_object") return json({ error: message }, 400);
  if (message === "payload_too_large") return json({ error: message }, 413);
  if (message === "server_not_configured") return json({ error: message }, 500);
  // Never expose database/provider errors, SQL text or stack details to callers.
  // Keep diagnosis in server logs only.
  console.error("edge_function_failure", error);
  return json({ error: "internal_error" }, 500);
}

export type JsonObject = Record<string, unknown>;

/** Parse bounded JSON object input. Never silently converts malformed JSON to {}. */
export async function readJsonObject(req: Request, maxBytes = 32_768): Promise<JsonObject> {
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error("payload_too_large");
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw new Error("payload_too_large");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("invalid_json"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_json_object");
  return parsed as JsonObject;
}

export function requireSecret(req: Request, envName: string): void {
  const expected = Deno.env.get(envName);
  if (!expected || req.headers.get("x-notify-secret") !== expected) throw new Error("unauthorized");
}
