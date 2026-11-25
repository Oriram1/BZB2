import { assertEquals } from "jsr:@std/assert@1";
import { judgeMessage, judgeTask } from "./handler.ts";

const gemini = (verdict: string, reason = "") => () =>
  Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ verdict, reason }) }] } }] }), { status: 200 }));

Deno.env.set("GEMINI_API_KEY", "test");

Deno.test("ordinary task is clean", async () => {
  assertEquals(await judgeTask({ name: "הליכה עם כלב", short_desc: "פעמיים ביום" }, gemini("ok")), { verdict: "clean", reason: null });
});
Deno.test("model block and flag are kept with a reason", async () => {
  assertEquals((await judgeTask({ name: "x" }, gemini("block", "תוכן מיני"))).verdict, "blocked");
  assertEquals((await judgeTask({ name: "x" }, gemini("flag", "לא ברור"))).verdict, "flagged");
});
Deno.test("word bank overrides an ok from the model", async () => {
  for (const name of ["החלפת שקע חשמל", "ניקוי גג", "תתקשר 052-123-4567", "וייפ למכירה"]) {
    assertEquals((await judgeTask({ name }, gemini("ok"))).verdict, "flagged");
  }
});
Deno.test("provider failure never becomes a verdict", async () => {
  let failed = false;
  try { await judgeTask({ name: "רגיל" }, (() => Promise.resolve(new Response("x", { status: 500 }))) as typeof fetch); } catch { failed = true; }
  assertEquals(failed, true);
});

Deno.test("ordinary chat message is clean, risky one flagged", async () => {
  assertEquals((await judgeMessage("אגיע ב-5, להביא כפפות?", gemini("ok"))).verdict, "clean");
  assertEquals((await judgeMessage("תעבור לוואטסאפ", gemini("flag", "מעבר לערוץ פרטי"))).verdict, "flagged");
});
Deno.test("keeping secrets from parents is flagged without the model", async () => {
  let calls = 0;
  assertEquals((await judgeMessage("אל תספר להורים שלך", () => { calls++; return gemini("ok")(); })).verdict, "flagged");
  assertEquals(calls, 0);
});
