import { assert, assertEquals } from "jsr:@std/assert@1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { MOCK_API_NAME, MOCK_API_PASSWORD, MOCK_TERMINAL, startMockCardcom } from "../functions/_shared/cardcom_mock.ts";

Deno.test({ name: "one-time wallet checkout through real Edge handlers and local database", sanitizeOps: false, sanitizeResources: false, async fn() {
  const url = Deno.env.get("LOCAL_SUPABASE_URL")!;
  assert(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const admin = createClient(url, Deno.env.get("LOCAL_SERVICE_KEY")!, { auth: { persistSession: false } });
  const mock = startMockCardcom();
  const children: Deno.ChildProcess[] = [];
  let userId: string | undefined;
  let taskId: string | undefined;
  try {
    for (const [name, port] of [["task-pay", 8291], ["billing-webhook", 8292]] as const) {
      children.push(new Deno.Command(Deno.execPath(), { args: ["run", "-A", "--no-lock", `supabase/functions/${name}/index.ts`],
        env: { DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${port}`, SUPABASE_URL: url,
          SUPABASE_ANON_KEY: Deno.env.get("LOCAL_ANON_KEY")!, SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("LOCAL_SERVICE_KEY")!,
          BILLING_ENABLED: "true", CARDCOM_BASE_URL: mock.url, CARDCOM_MODE: "test",
          CARDCOM_TEST_TERMINAL: String(MOCK_TERMINAL), CARDCOM_TEST_API_NAME: MOCK_API_NAME,
          CARDCOM_TEST_API_PASSWORD: MOCK_API_PASSWORD, PUBLIC_SITE_URL: "http://localhost:5187" }, stdout: "null", stderr: "piped" }).spawn());
      let ready = false;
      for (let i = 0; i < 80; i++) {
        try { const r = await fetch(`http://127.0.0.1:${port}`, { method: "OPTIONS" }); await r.body?.cancel(); ready = true; break; }
        catch { await new Promise(resolve => setTimeout(resolve, 150)); }
      }
      assert(ready, `${name} startup`);
    }
    const email = `wallet-${crypto.randomUUID()}@example.test`;
    const password = `Wallet-${crypto.randomUUID()}!`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assertEquals(created.error, null);
    userId = created.data.user!.id;
    assertEquals((await admin.from("user_roles").insert({ user_id: userId, role: "tasker" })).error, null);
    assertEquals((await admin.rpc("save_payment_method", { _user_id: userId, _token: "original-recurring-token", _card_last4: "1234", _card_expiry: "1230" })).error, null);
    const client = createClient(url, Deno.env.get("LOCAL_ANON_KEY")!, { auth: { persistSession: false } });
    const signed = await client.auth.signInWithPassword({ email, password });
    assertEquals(signed.error, null);
    const task = await admin.from("tasks").insert({ creator_id: userId, name: "Wallet E2E", short_desc: "local", category: "housework", payment: 50 }).select("id").single();
    assertEquals(task.error, null);
    taskId = task.data!.id;
    assertEquals((await admin.from("tasks").update({ publish_state: "pending_payment", payment_due: 8 }).eq("id", taskId)).error, null);
    const opened = await fetch("http://127.0.0.1:8291", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${signed.data.session!.access_token}` }, body: JSON.stringify({ action: "wallet", task_id: taskId, amount: 0.01 }) });
    assertEquals(opened.status, 200);
    const page = await opened.json();
    const request = mock.requests.find(r => r.path === "/LowProfile/Create")!;
    assertEquals(request.body.Operation, "ChargeOnly");
    assertEquals(request.body.Amount, 8, "client cannot override amount");
    const charge = await admin.from("billing_charges").select("low_profile_id,meta").eq("id", page.charge_id).single();
    assertEquals(charge.error, null);
    assertEquals(charge.data!.meta.payment_mode, "one_time");
    mock.pages.get(charge.data!.low_profile_id)!.outcome = "paid";
    for (let i = 0; i < 2; i++) {
      const settled = await fetch("http://127.0.0.1:8292", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ LowProfileId: charge.data!.low_profile_id }) });
      assertEquals(settled.status, 200);
      assertEquals((await settled.json()).status, "paid");
    }
    assertEquals((await admin.from("tasks").select("publish_state").eq("id", taskId).single()).data?.publish_state, "live");
    assertEquals((await admin.from("payment_methods").select("token").eq("user_id", userId).single()).data?.token, "original-recurring-token");
    assertEquals((await admin.from("billing_charges").select("status").eq("id", page.charge_id).single()).data?.status, "paid");
  } finally {
    for (const child of children) { child.kill("SIGTERM"); await child.status; }
    await mock.close();
    if (taskId) assertEquals((await admin.from("tasks").delete().eq("id", taskId)).error, null);
    if (userId) assertEquals((await admin.auth.admin.deleteUser(userId)).error, null);
  }
} });
