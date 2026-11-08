import { AsyncLocalStorage } from "node:async_hooks";
import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { timingSafeEqual } from "./timingSafeEqual.ts";
import { isUuid } from "./validate.ts";

export { isUuid };

const ALLOWED_ORIGINS = [
  "https://bzb-web.com",
  "https://www.bzb-web.com",
  "https://bzb-2.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8080",
];

export function corsOrigin(req: Request): string {
  const origin = req.headers.get("Origin") ?? "";
  // Deployment hashes and branch aliases must belong to this project AND team.
  if (ALLOWED_ORIGINS.includes(origin) || /^https:\/\/bzb-2-[a-z0-9-]+-bzb1\.vercel\.app$/.test(origin)) return origin;
  return ALLOWED_ORIGINS[0];
}

/**
 * The site answers on both the apex and the `www.` host, and previews answer on
 * the project's Vercel previews, so a single hard-coded origin fails the preflight for every
 * caller but one. Responses are built deep inside each handler, far from the
 * `Request` — rather than thread it through every call site, `withCors` stashes
 * it here so `json` can echo the caller's own origin.
 */
const requestContext = new AsyncLocalStorage<Request>();

const DEFAULT_ALLOW_HEADERS = "authorization, x-client-info, apikey, content-type";

export function corsHeadersFor(req?: Request, allowHeaders = DEFAULT_ALLOW_HEADERS) {
  return {
    // `Vary` keeps a proxy from serving one origin's headers to another.
    "Vary": "Origin",
    "Access-Control-Allow-Origin": req ? corsOrigin(req) : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": allowHeaders,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

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

/** Service-role client for handlers that authenticate by other means (shared secret, token, provider webhook). */
export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("server_not_configured");
  return createClient(url, key);
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

/** Caller must be a signed-in admin; returns the caller and a service-role client. */
export async function adminClients(req: Request) {
  const clients = await authenticatedClients(req);
  if (!(await hasRole(clients.admin, clients.user.id, "admin"))) throw new Error("forbidden");
  return clients;
}

const USERS_PER_PAGE = 200;

async function* authUserPages(admin: SupabaseClient) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: USERS_PER_PAGE });
    if (error) throw error;
    yield data.users;
    if (data.users.length < USERS_PER_PAGE) return;
  }
}

/** Every auth user, across all pages. */
export async function listAllUsers(admin: SupabaseClient) {
  const users: User[] = [];
  for await (const page of authUserPages(admin)) users.push(...page);
  return users;
}

/** The auth user with this email (case-insensitive), searching every page. */
export async function findUserByEmail(admin: SupabaseClient, email: string) {
  const wanted = email.toLowerCase();
  for await (const page of authUserPages(admin)) {
    const match = page.find((user) => (user.email ?? "").toLowerCase() === wanted);
    if (match) return match;
  }
  return null;
}

/**
 * Runs an admin operation and records its outcome in `admin_audit_log`.
 * `run` returns the failure (or `null` on success); `details` are logged
 * either way and the failure message is added to them. Returns whether it succeeded.
 */
export async function auditedAdminAction(
  admin: SupabaseClient,
  entry: {
    adminUserId: string;
    action: string;
    targetUserId?: string;
    targetIdentifier?: string;
    details?: JsonObject;
  },
  run: () => Promise<{ message: string } | null>,
): Promise<boolean> {
  const failure = await run();
  await admin.from("admin_audit_log").insert({
    admin_user_id: entry.adminUserId,
    action: entry.action,
    target_user_id: entry.targetUserId,
    target_identifier: entry.targetIdentifier,
    success: !failure,
    details: failure ? { ...entry.details, error: failure.message } : entry.details ?? null,
  });
  return !failure;
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

/** POST-only JSON handler: CORS preflight, method check, and any thrown error mapped by `errorResponse`. */
export function postHandler(handler: (req: Request) => Response | Promise<Response>) {
  return withCors(async (req) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    try {
      return await handler(req);
    } catch (error) {
      return errorResponse(error);
    }
  });
}

export function servePost(handler: (req: Request) => Response | Promise<Response>) {
  Deno.serve(postHandler(handler));
}

/**
 * Entry point for pg_cron / pg_net callers: POST with the shared secret and a
 * JSON object body. The handler gets a service-role client.
 */
export type CronContext = { admin: SupabaseClient; body: JsonObject };

export function serveCron(
  handler: (context: CronContext) => Response | Promise<Response>,
  { maxBodyBytes }: { maxBodyBytes?: number } = {},
) {
  servePost(async (req) => {
    const denied = rejectWithoutSecret(req);
    if (denied) return denied;
    const admin = serviceClient();
    return await handler({ admin, body: await readJsonObject(req, maxBodyBytes) });
  });
}

/** 429 with `Retry-After` when the user is over the named per-user quota, otherwise `null`. */
export async function consumeQuota(admin: SupabaseClient, rpc: string, userId: string): Promise<Response | null> {
  const { data: quota, error } = await admin.rpc(rpc, { _user_id: userId });
  if (error) throw error;
  if (!quota || typeof quota.allowed !== "boolean") throw new Error("invalid_quota_response");
  if (quota.allowed) return null;
  const response = json({ error: "rate_limit_exceeded" }, 429);
  response.headers.set("Retry-After", String(quota.retry_after));
  return response;
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

/** 401 response when the scheduler's shared secret is missing or wrong, otherwise `null`. */
export function rejectWithoutSecret(req: Request): Response | null {
  const expected = Deno.env.get("NOTIFY_DISPATCH_SECRET");
  const supplied = req.headers.get("x-notify-secret");
  if (expected && supplied && timingSafeEqual(supplied, expected)) return null;
  return json({ error: "unauthorized" }, 401);
}
