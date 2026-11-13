import { assertEquals } from "jsr:@std/assert@1";
import { postRequest, withFakeSupabase } from "../_shared/testkit.ts";
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

Deno.test("sanitizeFields keeps valid values and treats today as bookable", () => {
  const fields = sanitizeFields({
    category: "housework", taskName: "ניקוי חלונות", shortDesc: "ניקוי חלונות בדירה", payment: 49.6,
    paymentType: "hour", workers: 2, location: "רמת גן", date: "2026-11-03", time: "18:30", duration: 1,
  }, "2026-11-03");
  assertEquals([fields.category, fields.payment, fields.paymentType, fields.workers, fields.date, fields.time], ["housework", 50, "hour", 2, "2026-11-03", "18:30"]);
  assertEquals(missingFields(fields), []);
});

Deno.test("israelToday reports the Israeli calendar day", () => {
  // 23:30 UTC on 3 Nov is already 4 Nov in Israel.
  assertEquals(israelToday(new Date("2026-11-03T23:30:00Z")).date, "2026-11-04");
});

const ASK = JSON.stringify({ messages: [{ role: "user", text: "ניקוי חלונות ברמת גן, 50 שקל" }] });
const EXTRACTED = {
  category: "housework", taskName: "ניקוי חלונות", shortDesc: "ניקוי חלונות בדירה", fullDesc: null,
  payment: 50, paymentType: "task", workers: 1, location: "רמת גן", date: null, time: null, duration: null,
};

/** Fake quota RPC and Gemini; `model.calls` counts paid calls. */
function run(
  state: { allow?: boolean; model: () => Response },
  test: (model: { calls: number }) => Promise<void>,
) {
  const model = { calls: 0 };
  return withFakeSupabase({
    env: { GEMINI_API_KEY: "test-key" },
    route: (url) => {
      if (url.includes("/rpc/consume_task_assistant_quota")) {
        const allowed = state.allow ?? true;
        return Response.json({ allowed, retry_after: allowed ? 0 : 30 });
      }
      if (url.startsWith("https://generativelanguage.googleapis.com/")) {
        model.calls++;
        return state.model();
      }
    },
  }, () => test(model));
}

const modelReplies = (text: string) => () => Response.json({ candidates: [{ content: { parts: [{ text }] } }] });

Deno.test("task assistant rejects unauthenticated and malformed requests before the model", () =>
  run({ model: modelReplies("{}") }, async (model) => {
    assertEquals((await handleTaskAssistant(postRequest(ASK, false))).status, 401);
    assertEquals((await handleTaskAssistant(postRequest('{"messages":[]}'))).status, 400);
    assertEquals((await handleTaskAssistant(postRequest('{"messages":[{"role":"system","text":"x"}]}'))).status, 400);
    assertEquals((await handleTaskAssistant(postRequest('{"messages":[{"role":"assistant","text":"x"}]}'))).status, 400);
    assertEquals(model.calls, 0);
  }));

Deno.test("task assistant returns sanitized fields and what is still missing", () =>
  run({ model: modelReplies(JSON.stringify(EXTRACTED)) }, async (model) => {
    const response = await handleTaskAssistant(postRequest(ASK));
    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(body.fields.taskName, "ניקוי חלונות");
    assertEquals(body.missing, ["date", "time"]);
    assertEquals(model.calls, 1);
  }));

Deno.test("task assistant answers 429 with Retry-After and skips the model when over quota", () =>
  run({ allow: false, model: modelReplies(JSON.stringify(EXTRACTED)) }, async (model) => {
    const response = await handleTaskAssistant(postRequest(ASK));
    assertEquals(response.status, 429);
    assertEquals(response.headers.get("Retry-After"), "30");
    assertEquals(model.calls, 0);
  }));

Deno.test("task assistant hides unparseable model output behind internal_error", () =>
  run({ model: modelReplies("not json") }, async () => {
    const response = await handleTaskAssistant(postRequest(ASK));
    assertEquals(response.status, 500);
    assertEquals(await response.json(), { error: "internal_error" });
  }));

Deno.test("task assistant passes the provider's HTTP status through as a 502", () =>
  run({ model: () => Response.json({ error: { status: "PERMISSION_DENIED" } }, { status: 403 }) }, async () => {
    const response = await handleTaskAssistant(postRequest(ASK));
    assertEquals(response.status, 502);
    assertEquals(await response.json(), { error: "assistant_provider_unavailable", provider_status: 403 });
  }));

Deno.test("task assistant transcribes a voice note and skips field extraction", () =>
  run({ model: modelReplies("ניקוי חלונות מחר\n") }, async (model) => {
    const response = await handleTaskAssistant(postRequest(JSON.stringify({
      audio: { mimeType: "audio/webm;codecs=opus", data: "AAAA" },
    })));
    assertEquals(response.status, 200);
    assertEquals(await response.json(), { transcript: "ניקוי חלונות מחר" });
    assertEquals(model.calls, 1);
  }));

Deno.test("task assistant rejects voice notes that are not audio, not base64 or too large", () =>
  run({ model: modelReplies("x") }, async (model) => {
    const send = (audio: unknown) => handleTaskAssistant(postRequest(JSON.stringify({ audio })));
    assertEquals((await send({ mimeType: "text/plain", data: "AAAA" })).status, 400);
    assertEquals((await send({ mimeType: "audio/webm", data: "not base64!" })).status, 400);
    assertEquals((await send({ mimeType: "audio/webm", data: "A".repeat(2_700_001) })).status, 400);
    assertEquals(model.calls, 0);
  }));
