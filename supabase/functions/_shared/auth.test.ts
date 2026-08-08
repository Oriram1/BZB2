import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { readJsonObject } from "./auth.ts";

Deno.test("readJsonObject accepts bounded JSON objects", async () => {
  assertEquals(await readJsonObject(new Request("https://example.test", { method: "POST", body: JSON.stringify({ ok: true }) })), { ok: true });
});

Deno.test("readJsonObject rejects malformed JSON", async () => {
  await assertRejects(() => readJsonObject(new Request("https://example.test", { method: "POST", body: "{" })), Error, "invalid_json");
});

Deno.test("readJsonObject rejects arrays and oversized payloads", async () => {
  await assertRejects(() => readJsonObject(new Request("https://example.test", { method: "POST", body: "[]" })), Error, "invalid_json_object");
  await assertRejects(() => readJsonObject(new Request("https://example.test", { method: "POST", body: "12345" }), 2), Error, "payload_too_large");
});
