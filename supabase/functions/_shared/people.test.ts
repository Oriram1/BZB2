import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { mailParentContact, tryEmail } from "./people.ts";

/** Runs `run` with Resend replaced; returns the JSON bodies it was sent. */
async function withFakeResend(status: number, run: () => Promise<void>) {
  const originalFetch = globalThis.fetch;
  const previousKey = Deno.env.get("RESEND_API_KEY");
  Deno.env.set("RESEND_API_KEY", "re_test");
  const sent: { to: string[]; subject: string; html: string }[] = [];
  globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return Promise.resolve(Response.json({ id: "email-id" }, { status }));
  }) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) Deno.env.delete("RESEND_API_KEY");
    else Deno.env.set("RESEND_API_KEY", previousKey);
  }
  return sent;
}

const CONTENT = { subject: "נושא", preheader: "תצוגה", heading: "כותרת" };

Deno.test("tryEmail reports success and failure instead of throwing", async () => {
  await withFakeResend(200, async () => assertEquals(await tryEmail({ to: "a@b.co", content: CONTENT }), true));
  await withFakeResend(500, async () => assertEquals(await tryEmail({ to: "a@b.co", content: CONTENT }), false));
});

Deno.test("mailParentContact links the parent to their own view page", async () => {
  const sent = await withFakeResend(200, async () => {
    const ok = await mailParentContact(
      { id: "c1", email: "parent@example.com", view_token: "tok123" },
      "child_signed_in",
      { child_name: "דני", signed_in_at: "01/01/2026", child_gender: "male" },
    );
    assertEquals(ok, true);
  });
  assertEquals(sent.length, 1);
  assertEquals(sent[0].to, ["parent@example.com"]);
  assertStringIncludes(sent[0].html, "/parent/view/tok123");
});
