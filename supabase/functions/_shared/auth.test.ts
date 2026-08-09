import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { readJsonObject, requireSecret } from "./auth.ts";

const post = (body?: string, headers?: HeadersInit) =>
  new Request("https://example.test", { method: "POST", body, headers });

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

Deno.test("requireSecret accepts a matching header", () => {
  Deno.env.set("TEST_SECRET", "s3cret");
  requireSecret(post(undefined, { "x-notify-secret": "s3cret" }), "TEST_SECRET");
});

Deno.test("requireSecret rejects a wrong, missing or unconfigured secret", () => {
  Deno.env.set("TEST_SECRET", "s3cret");
  assertThrows(() => requireSecret(post(undefined, { "x-notify-secret": "wrong" }), "TEST_SECRET"), Error, "unauthorized");
  assertThrows(() => requireSecret(post(), "TEST_SECRET"), Error, "unauthorized");
  Deno.env.delete("TEST_SECRET");
  assertThrows(() => requireSecret(post(undefined, { "x-notify-secret": "s3cret" }), "TEST_SECRET"), Error, "unauthorized");
});

Deno.test("requireSecret reads the header name it is given", () => {
  Deno.env.set("TEST_SECRET", "s3cret");
  requireSecret(post(undefined, { "x-cron-key": "s3cret" }), "TEST_SECRET", "x-cron-key");
  assertThrows(() => requireSecret(post(undefined, { "x-notify-secret": "s3cret" }), "TEST_SECRET", "x-cron-key"), Error, "unauthorized");
  Deno.env.delete("TEST_SECRET");
});
