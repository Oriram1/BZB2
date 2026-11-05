import { assertEquals } from "jsr:@std/assert@1";
import { judge } from "./handler.ts";

const gemini = (verdict: string, reason = "") => () =>
  Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ verdict, reason }) }] } }] }), { status: 200 }));

Deno.env.set("GEMINI_API_KEY", "test");

Deno.test("clean text is published, including honest criticism", async () => {
  assertEquals(await judge("הגיע באיחור ולא סיים את העבודה, לא מרוצה", gemini("ok")), { verdict: "clean", reason: null });
});
Deno.test("model flags abusive text with a reason for the admin", async () => {
  assertEquals((await judge("טקסט פוגעני", gemini("flag", "עלבון אישי"))).verdict, "flagged");
});
Deno.test("phone numbers, emails and links are flagged without calling the model", async () => {
  let calls = 0;
  const counting = () => { calls++; return gemini("ok")(); };
  for (const text of ["תתקשרו 052-123-4567", "כתבו לי a@b.co", "ראו www.example.com"]) assertEquals((await judge(text, counting)).verdict, "flagged");
  assertEquals(calls, 0);
});
Deno.test("provider failure or garbage never becomes a verdict", async () => {
  for (const f of [() => Promise.resolve(new Response("x", { status: 500 })), () => Promise.resolve(new Response(JSON.stringify({ candidates: [] }), { status: 200 }))]) {
    let failed = false;
    try { await judge("טקסט רגיל", f as typeof fetch); } catch { failed = true; }
    assertEquals(failed, true);
  }
});
