import { assertEquals } from "jsr:@std/assert@1";
import { handleTaskAssistant, israelToday, missingFields, sanitizeFields } from "./handler.ts";

Deno.test("sanitizeFields keeps only values the form accepts", () => {
  const fields = sanitizeFields({
    category: "spaceship", taskName: "  ניקוי חלונות  ", shortDesc: "א".repeat(200),
    payment: -5, paymentType: "week", workers: 0, location: "רמת גן",
    date: "2020-01-01", time: "25:00", duration: 3,
  }, "2026-11-03");
  assertEquals(fields.category, null);
  assertEquals(fields.taskName, "ניקוי חלונות");
  assertEquals(fields.shortDesc?.length, 120);
  assertEquals([fields.payment, fields.paymentType, fields.workers, fields.date, fields.time], [null, null, null, null, null]);
  assertEquals(fields.duration, 3);
  assertEquals(missingFields(fields), ["category", "payment", "date", "time"]);
});

Deno.test("israelToday reports the Israeli calendar day", () => {
  // 23:30 UTC on 3 Nov is already 4 Nov in Israel.
  assertEquals(israelToday(new Date("2026-11-03T23:30:00Z")).date, "2026-11-04");
});

Deno.test("task assistant authenticates, validates and gates the model on quota", async () => {
  const originalFetch = globalThis.fetch;
  const keys = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY"];
  const previous = keys.map(key => Deno.env.get(key));
  Deno.env.set(keys[0], "https://supabase.test");
  for (const key of keys.slice(1)) Deno.env.set(key, "test-key");
  let modelCalls = 0;
  let allow = true;
  let modelOutput = JSON.stringify({
    category: "housework", taskName: "ניקוי חלונות", shortDesc: "ניקוי חלונות בדירה", fullDesc: null,
    payment: 50, paymentType: "task", workers: 1, location: "רמת גן", date: null, time: null, duration: null,
  });
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) return Promise.resolve(Response.json({
      id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated",
    }));
    if (url.includes("/rpc/consume_task_assistant_quota")) {
      return Promise.resolve(Response.json({ allowed: allow, retry_after: allow ? 0 : 30 }));
    }
    if (url.startsWith("https://generativelanguage.googleapis.com/")) {
      modelCalls++;
      return Promise.resolve(Response.json({ candidates: [{ content: { parts: [{ text: modelOutput }] } }] }));
    }
    throw new Error("unexpected network call");
  }) as typeof fetch;
  const request = (body: string, token = true) => new Request("https://edge.test", {
    method: "POST", body,
    headers: { ...(token ? { Authorization: "Bearer user-token" } : {}), Origin: "https://bzb-web.com" },
  });
  const ask = JSON.stringify({ messages: [{ role: "user", text: "ניקוי חלונות ברמת גן, 50 שקל" }] });
  try {
    assertEquals((await handleTaskAssistant(request(ask, false))).status, 401);
    assertEquals((await handleTaskAssistant(request('{"messages":[]}'))).status, 400);
    assertEquals((await handleTaskAssistant(request('{"messages":[{"role":"system","text":"x"}]}'))).status, 400);
    assertEquals(modelCalls, 0);

    let result = await handleTaskAssistant(request(ask));
    assertEquals(result.status, 200);
    const body = await result.json();
    assertEquals(body.fields.taskName, "ניקוי חלונות");
    assertEquals(body.missing, ["date", "time"]);
    assertEquals(modelCalls, 1);

    allow = false;
    result = await handleTaskAssistant(request(ask));
    assertEquals(result.status, 429);
    assertEquals(result.headers.get("Retry-After"), "30");
    assertEquals(modelCalls, 1);

    allow = true;
    modelOutput = "not json";
    assertEquals((await handleTaskAssistant(request(ask))).status, 500);
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, index) => previous[index] === undefined ? Deno.env.delete(key) : Deno.env.set(key, previous[index]!));
  }
});
