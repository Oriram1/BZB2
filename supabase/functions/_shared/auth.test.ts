import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import {
  auditedAdminAction,
  consumeQuota,
  corsHeadersFor,
  corsOrigin,
  findUserByEmail,
  listAllUsers,
  readJsonObject,
  rejectWithoutSecret,
} from "./auth.ts";

const post = (body?: string, headers?: HeadersInit) =>
  new Request("https://example.test", { method: "POST", body, headers });

Deno.test("corsOrigin allows the local Vite address", () => {
  assertEquals(corsOrigin(post(undefined, { Origin: "http://127.0.0.1:5173" })), "http://127.0.0.1:5173");
});

Deno.test("CORS only permits this project's production and preview origins", () => {
  for (const origin of ["https://bzb-web.com", "https://www.bzb-web.com", "https://bzb-2.vercel.app", "https://bzb-2-acpf98ir0-bzb1.vercel.app", "https://bzb-2-git-main-bzb1.vercel.app"]) {
    assertEquals(corsOrigin(post(undefined, { Origin: origin })), origin);
  }
  for (const origin of ["https://evil.vercel.app", "https://bzb-2-abc-attacker.vercel.app", "https://bzb-2-abc-bzb1.vercel.app.evil.test", "http://bzb-2-abc-bzb1.vercel.app", "https://bzb-web.com.evil.test", "null"]) {
    assertEquals(corsOrigin(post(undefined, { Origin: origin })), "https://bzb-web.com");
  }
});

Deno.test("readJsonObject accepts bounded JSON objects", async () => {
  assertEquals(await readJsonObject(post(JSON.stringify({ ok: true }))), { ok: true });
});

Deno.test("readJsonObject rejects malformed JSON", async () => {
  await assertRejects(() => readJsonObject(post("{")), Error, "invalid_json");
});

Deno.test("readJsonObject rejects arrays and oversized payloads", async () => {
  await assertRejects(() => readJsonObject(post("[]")), Error, "invalid_json_object");
  await assertRejects(() => readJsonObject(post("12345"), 2), Error, "payload_too_large");
});

// A bodyless call is what `supabase.functions.invoke(name)` sends when it is
// given no `body`. Functions that read input must reject it; functions that
// read none must not call this at all — see notify-parent-signin.
Deno.test("readJsonObject rejects a request with no body at all", async () => {
  await assertRejects(() => readJsonObject(post()), Error, "invalid_json");
});

Deno.test("rejectWithoutSecret lets a matching header through", () => {
  Deno.env.set("NOTIFY_DISPATCH_SECRET", "s3cret");
  assertEquals(rejectWithoutSecret(post(undefined, { "x-notify-secret": "s3cret" })), null);
});

Deno.test("rejectWithoutSecret answers 401 to a wrong, missing or unconfigured secret", () => {
  Deno.env.set("NOTIFY_DISPATCH_SECRET", "s3cret");
  assertEquals(rejectWithoutSecret(post(undefined, { "x-notify-secret": "wrong" }))?.status, 401);
  assertEquals(rejectWithoutSecret(post())?.status, 401);
  Deno.env.delete("NOTIFY_DISPATCH_SECRET");
  assertEquals(rejectWithoutSecret(post(undefined, { "x-notify-secret": "s3cret" }))?.status, 401);
});

Deno.test("corsHeadersFor lets a caller widen the allowed request headers", () => {
  const req = post(undefined, { Origin: "https://bzb-web.com" });
  assertEquals(corsHeadersFor(req)["Access-Control-Allow-Headers"], "authorization, x-client-info, apikey, content-type");
  assertEquals(corsHeadersFor(req, "webhook-id")["Access-Control-Allow-Headers"], "webhook-id");
});

const fakeQuota = (result: { data: unknown; error?: Error | null }) =>
  ({ rpc: () => Promise.resolve({ data: result.data, error: result.error ?? null }) }) as unknown as SupabaseClient;

Deno.test("consumeQuota returns null when allowed and a 429 with Retry-After when not", async () => {
  assertEquals(await consumeQuota(fakeQuota({ data: { allowed: true } }), "q", "u"), null);
  const denied = await consumeQuota(fakeQuota({ data: { allowed: false, retry_after: 42 } }), "q", "u");
  assertEquals(denied?.status, 429);
  assertEquals(denied?.headers.get("Retry-After"), "42");
});

Deno.test("consumeQuota fails closed on a database error or a malformed answer", async () => {
  await assertRejects(() => consumeQuota(fakeQuota({ data: null, error: new Error("db down") }), "q", "u"), Error, "db down");
  await assertRejects(() => consumeQuota(fakeQuota({ data: { allowed: "yes" } }), "q", "u"), Error, "invalid_quota_response");
  await assertRejects(() => consumeQuota(fakeQuota({ data: null }), "q", "u"), Error, "invalid_quota_response");
});

/** An auth admin API whose users are spread over pages of 200, like the real one. */
function fakeUsers(total: number, failAtPage?: number) {
  const users = Array.from({ length: total }, (_, index) => ({ id: `id-${index}`, email: `User${index}@Example.com` }));
  const requestedPages: number[] = [];
  const admin = {
    auth: {
      admin: {
        listUsers: ({ page, perPage }: { page: number; perPage: number }) => {
          requestedPages.push(page);
          if (page === failAtPage) return Promise.resolve({ data: null, error: new Error("auth down") });
          return Promise.resolve({ data: { users: users.slice((page - 1) * perPage, page * perPage) }, error: null });
        },
      },
    },
  } as unknown as SupabaseClient;
  return { admin, requestedPages };
}

Deno.test("listAllUsers reads every page, not just the first 200 users", async () => {
  const { admin, requestedPages } = fakeUsers(450);
  assertEquals((await listAllUsers(admin)).length, 450);
  assertEquals(requestedPages, [1, 2, 3]);
});

Deno.test("findUserByEmail finds a user past the first page, ignoring case, and stops searching once found", async () => {
  const { admin, requestedPages } = fakeUsers(450);
  assertEquals((await findUserByEmail(admin, "user250@example.COM"))?.id, "id-250");
  assertEquals(requestedPages, [1, 2]);
  assertEquals(await findUserByEmail(fakeUsers(450).admin, "nobody@example.com"), null);
});

Deno.test("findUserByEmail surfaces a listing failure instead of reporting not found", async () => {
  await assertRejects(() => findUserByEmail(fakeUsers(450, 2).admin, "user300@example.com"), Error, "auth down");
});

Deno.test("auditedAdminAction logs the outcome and reports success", async () => {
  const rows: Record<string, unknown>[] = [];
  const admin = { from: () => ({ insert: (row: Record<string, unknown>) => { rows.push(row); return Promise.resolve({}); } }) } as unknown as SupabaseClient;
  const entry = { adminUserId: "admin", action: "block_user", targetUserId: "target", details: { source: "test" } };

  assertEquals(await auditedAdminAction(admin, entry, () => Promise.resolve(null)), true);
  assertEquals(await auditedAdminAction(admin, entry, () => Promise.resolve({ message: "boom" })), false);
  assertEquals(await auditedAdminAction(admin, { ...entry, details: undefined }, () => Promise.resolve(null)), true);

  assertEquals(rows.map((row) => [row.success, row.details]), [
    [true, { source: "test" }],
    [false, { source: "test", error: "boom" }],
    [true, null],
  ]);
  assertEquals(rows[0].admin_user_id, "admin");
  assertEquals(rows[0].target_user_id, "target");
});
