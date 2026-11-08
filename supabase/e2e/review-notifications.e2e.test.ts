// Delivery test for the review notification events, against the LOCAL stack.
// The real notify-dispatch handler runs; only the two external providers are
// replaced: Resend (fetch stub) and a local HTTPS push service. Nothing is sent
// to a real person or device.
//   zsh scripts/review-notifications-e2e.sh
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import webpush from "npm:web-push@3.6.7";

const url = Deno.env.get("LOCAL_SUPABASE_URL")!;
const service = Deno.env.get("LOCAL_SERVICE_KEY")!;
if (!url || !service || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Local Supabase required");

const vapid = webpush.generateVAPIDKeys();
Deno.env.set("SUPABASE_URL", url);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", service);
Deno.env.set("NOTIFY_DISPATCH_SECRET", "local-test-secret");
Deno.env.set("RESEND_API_KEY", "re_local_stub");
Deno.env.set("VAPID_PUBLIC_KEY", vapid.publicKey);
Deno.env.set("VAPID_PRIVATE_KEY", vapid.privateKey);

const emails: { to: string[]; subject: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
  const target = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (target.startsWith("https://api.resend.com/")) {
    emails.push(JSON.parse(String(init?.body)));
    return Promise.resolve(new Response(JSON.stringify({ id: "stub-email" }), { status: 200 }));
  }
  return realFetch(input as string, init);
}) as typeof fetch;

const pushHits: number[] = [];
const pushServer = Deno.serve({ port: 8791, hostname: "127.0.0.1", cert: Deno.readTextFileSync("/tmp/bzb-push-cert.pem"), key: Deno.readTextFileSync("/tmp/bzb-push-key.pem"), onListen() {} },
  (req) => { pushHits.push(Number(req.headers.get("content-length") ?? 0)); return new Response(null, { status: 201 }); });

await import("../functions/notify-dispatch/index.ts");
for (let attempt = 0; ; attempt++) {
  try {
    await (await realFetch("http://127.0.0.1:8000/", { method: "OPTIONS" })).body?.cancel();
    break;
  } catch (error) {
    if (attempt >= 50) throw error;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const admin = createClient(url, service, { auth: { persistSession: false } });

Deno.test("review events reach email and push through the real dispatcher", async () => {
  const email = `deliver-${crypto.randomUUID()}@example.test`;
  const created = await admin.auth.admin.createUser({ email, password: `T-${crypto.randomUUID()}!`, email_confirm: true });
  assert(!created.error);
  const userId = created.data.user!.id;
  try {
    const key = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key.publicKey));
    await admin.from("push_subscriptions").insert({ user_id: userId, endpoint: "https://127.0.0.1:8791/push/device", p256dh: b64(raw), auth: b64(crypto.getRandomValues(new Uint8Array(16))) });

    const events = ["review_approved", "review_reminder", "review_rejected", "review_response_approved", "review_report_resolved", "review_appeal_resolved"];
    for (const event of events) {
      const inserted = await admin.from("notifications").insert({ user_id: userId, event_type: event, data: { task_name: "ניקיון דירה", review_id: crypto.randomUUID(), task_id: crypto.randomUUID(), report_id: crypto.randomUUID(), kind: "first" }, link: "/profile" }).select("id").single();
      assert(!inserted.error, inserted.error?.message);
      const res = await realFetch("http://127.0.0.1:8000/", { method: "POST", headers: { "x-notify-secret": "local-test-secret", "content-type": "application/json" }, body: JSON.stringify({ notification_id: inserted.data!.id }) });
      assertEquals(res.status, 200, `${event}: dispatcher status`);
      await res.text();
      const deliveries = await admin.from("notification_deliveries").select("channel,status,error").eq("notification_id", inserted.data!.id);
      const byChannel = Object.fromEntries((deliveries.data ?? []).map((d) => [d.channel, d]));
      assertEquals(byChannel.push?.status, "sent", `${event}: push ${JSON.stringify(byChannel.push)}`);
      if (event === "review_reminder") assertEquals(byChannel.email?.status, "skipped"); // push-only by default
      else assertEquals(byChannel.email?.status, "sent", `${event}: email ${JSON.stringify(byChannel.email)}`);
    }
    assertEquals(emails.length, events.length - 1);
    for (const mail of emails) { assertEquals(mail.to, [email]); assert(mail.subject.length > 3); }
    assertStringIncludes(emails.map((m) => m.subject).join("|"), "דירוג");
    assertEquals(pushHits.length, events.length);
    assert(pushHits.every((size) => size > 0), "push bodies must be encrypted payloads");
  } finally {
    await admin.auth.admin.deleteUser(userId);
    await pushServer.shutdown();
  }
});
