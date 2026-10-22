import { assert, assertEquals } from "jsr:@std/assert@1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { MOCK_API_NAME, MOCK_API_PASSWORD, MOCK_TERMINAL, startMockCardcom } from "../functions/_shared/cardcom_mock.ts";

Deno.test({ name: "one-time wallet checkout through real Edge handlers and local database", sanitizeOps: false, sanitizeResources: false, async fn() {
  const url = Deno.env.get("LOCAL_SUPABASE_URL")!;
  assert(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const admin = createClient(url, Deno.env.get("LOCAL_SERVICE_KEY")!, { auth: { persistSession: false } });
  const bitOptions = { bitEnabled: false };
  const mock = startMockCardcom(0, undefined, bitOptions);
  const children: Deno.ChildProcess[] = [];
  let userId: string | undefined;
  let taskId: string | undefined;
  try {
    for (const [name, port] of [["task-pay", 8291], ["billing-webhook", 8292], ["billing-confirm", 8293]] as const) {
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
    // Bit uses the same settlement and never overwrites the recurring card.
    assertEquals((await admin.from("tasks").update({ publish_state: "pending_payment", payment_due: 8 }).eq("id", taskId)).error, null);
    const unavailable = await fetch("http://127.0.0.1:8291", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${signed.data.session!.access_token}` }, body: JSON.stringify({ action: "bit", task_id: taskId }) });
    assertEquals(unavailable.status, 409);
    assertEquals((await unavailable.json()).error, "bit_unavailable");
    assertEquals((await admin.from("tasks").select("publish_state").eq("id", taskId).single()).data?.publish_state, "pending_payment");
    bitOptions.bitEnabled = true;
    const bitResponse = await fetch("http://127.0.0.1:8291", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${signed.data.session!.access_token}` }, body: JSON.stringify({ action: "bit", task_id: taskId }) });
    assertEquals(bitResponse.status, 200);
    const bitPage = await bitResponse.json();
    assert(new URL(bitPage.url).searchParams.get("method") === "bit");
    const bitCharge = await admin.from("billing_charges").select("low_profile_id,meta").eq("id", bitPage.charge_id).single();
    assertEquals(bitCharge.error, null);
    assertEquals(bitCharge.data!.meta.payment_mode, "one_time");
    mock.pages.get(bitCharge.data!.low_profile_id)!.outcome = "paid";
    const bitSettled = await fetch("http://127.0.0.1:8292", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ LowProfileId: bitCharge.data!.low_profile_id }) });
    assertEquals(bitSettled.status, 200);
    assertEquals((await bitSettled.json()).status, "paid");
    assertEquals((await admin.from("tasks").select("publish_state").eq("id", taskId).single()).data?.publish_state, "live");
    assertEquals((await admin.from("payment_methods").select("token").eq("user_id", userId).single()).data?.token, "original-recurring-token");
    // Card replacement must preserve cancellation, trial and renewal dates.
    const periodEnd = "2027-01-01T00:00:00+00:00";
    assertEquals((await admin.from("subscriptions").insert({ user_id: userId, plan_id: "quarterly", status: "active",
      current_period_start: "2026-10-01T00:00:00Z", current_period_end: periodEnd,
      cancel_at_period_end: true, is_trial: true, card_last4: "1234", card_expiry: "1230" })).error, null);
    const beforeSub = (await admin.from("subscriptions").select("plan_id,status,current_period_start,current_period_end,cancel_at_period_end,is_trial").eq("user_id", userId).single()).data;
    const update = await fetch("http://127.0.0.1:8291", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${signed.data.session!.access_token}` }, body: JSON.stringify({ action: "update_card" }) });
    assertEquals(update.status, 200);
    const updatePage = await update.json();
    const updateRequest = mock.requests.filter(r => r.path === "/LowProfile/Create").at(-1)!;
    assertEquals(updateRequest.body.Operation, "CreateTokenOnly");
    assertEquals(updateRequest.body.Amount, 0);
    assert(String(updateRequest.body.SuccessRedirectUrl).includes("flow=card-update"));
    const updateCharge = await admin.from("billing_charges").select("low_profile_id").eq("id", updatePage.charge_id).single();
    assertEquals(updateCharge.error, null);
    assert((await client.rpc("complete_subscription_card_update", { _charge_id: updatePage.charge_id, _token: "forged", _card_last4: "9999", _card_expiry: "1230" })).error);
    mock.pages.get(updateCharge.data!.low_profile_id)!.outcome = "paid";
    for (let i = 0; i < 2; i++) {
      const response = await fetch("http://127.0.0.1:8292", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ LowProfileId: updateCharge.data!.low_profile_id }) });
      assertEquals(response.status, 200);
      assertEquals((await response.json()).status, "paid");
      const confirmed = await fetch("http://127.0.0.1:8293", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${signed.data.session!.access_token}` }, body: JSON.stringify({ charge_id: updatePage.charge_id }) });
      assertEquals(confirmed.status, 200);
      assertEquals((await confirmed.json()).cardUpdated, true);
    }
    const cardNotes = await admin.from("notifications").select("data").eq("user_id", userId).eq("event_type", "billing_plan_changed").eq("data->>kind", "card_updated");
    assertEquals(cardNotes.error, null);
    assertEquals(cardNotes.data?.length, 1, "one email event despite repeated webhook and confirmation calls");
    assertEquals(cardNotes.data?.[0].data.kind, "card_updated");
    const updatedMethod = await admin.from("payment_methods").select("token,card_expiry").eq("user_id", userId).single();
    assert(updatedMethod.data?.token !== "original-recurring-token");
    assertEquals(updatedMethod.data?.card_expiry, "0429");
    assertEquals((await admin.from("subscriptions").select("plan_id,status,current_period_start,current_period_end,cancel_at_period_end,is_trial").eq("user_id", userId).single()).data, beforeSub);
    assertEquals((await admin.from("subscriptions").select("card_last4,card_expiry").eq("user_id", userId).single()).data, { card_last4: null, card_expiry: "0429" });
  } finally {
    for (const child of children) { child.kill("SIGTERM"); await child.status; }
    await mock.close();
    if (taskId) assertEquals((await admin.from("tasks").delete().eq("id", taskId)).error, null);
    if (userId) assertEquals((await admin.auth.admin.deleteUser(userId)).error, null);
  }
} });
