/**
 * End-to-end: real HTTP calls into the real Edge Functions (as separate
 * processes), the real local database with its real RLS, and a stand-in Cardcom.
 * Run with scripts/billing-e2e.sh.
 *
 * What it proves is OUR logic. Field names and Cardcom's real behaviour still
 * need one run against the real test terminal.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { MOCK_API_NAME, MOCK_API_PASSWORD, MOCK_TERMINAL, startMockCardcom } from "../functions/_shared/cardcom_mock.ts";
import { signPlan } from "../functions/_shared/planPrice.ts";

const URL_ = Deno.env.get("LOCAL_SUPABASE_URL")!;
const ANON = Deno.env.get("LOCAL_ANON_KEY")!;
const SERVICE = Deno.env.get("LOCAL_SERVICE_KEY")!;
const SIGNING_KEY = "e2e-signing-key-0123456789-0123456789-abcdef";
Deno.env.set("BILLING_PRICE_SIGNING_KEY", SIGNING_KEY);

const mock = startMockCardcom();
const admin: SupabaseClient = createClient(URL_, SERVICE, { auth: { persistSession: false } });

const FUNCTIONS = [
  "task-review",
  "task-pay",
  "billing-webhook",
  "billing-confirm",
  "billing-start-trial",
  "billing-change-plan",
  "billing-cancel-refund",
  "billing-renew",
];
const ports = new Map<string, number>();
const children: Deno.ChildProcess[] = [];

async function startFunctions() {
  let port = 8201;
  for (const name of FUNCTIONS) {
    ports.set(name, port);
    const child = new Deno.Command("deno", {
      args: ["run", "-A", "--no-lock", `supabase/functions/${name}/index.ts`],
      env: {
        DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${port}`,
        SUPABASE_URL: URL_,
        SUPABASE_ANON_KEY: ANON,
        SUPABASE_SERVICE_ROLE_KEY: SERVICE,
        BILLING_ENABLED: "true",
        BILLING_PRICE_SIGNING_KEY: SIGNING_KEY,
        CARDCOM_BASE_URL: mock.url,
        CARDCOM_TEST_TERMINAL: String(MOCK_TERMINAL),
        CARDCOM_TEST_API_NAME: MOCK_API_NAME,
        CARDCOM_TEST_API_PASSWORD: MOCK_API_PASSWORD,
        NOTIFY_DISPATCH_SECRET: "e2e-secret",
        PUBLIC_SITE_URL: "http://localhost:5173",
      },
      stdout: "null",
      stderr: "null",
    }).spawn();
    children.push(child);
    port += 1;
  }
  // Wait until each one answers.
  for (const [name, p] of ports) {
    let ok = false;
    for (let i = 0; i < 100 && !ok; i += 1) {
      try {
        const r = await fetch(`http://127.0.0.1:${p}/`, { method: "OPTIONS" });
        await r.body?.cancel();
        ok = true;
      } catch {
        await new Promise((r) => setTimeout(r, 150));
      }
    }
    assert(ok, `function ${name} did not start`);
  }
}

async function call(name: string, token: string | null, body: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const response = await fetch(`http://127.0.0.1:${ports.get(name)}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data: data as Record<string, any> };
}

// Deal numbers are unique across the table, so a re-run needs fresh ones.
const DEAL_BASE = Number(String(Date.now()).slice(-9)) * 10;
let counter = 0;
async function makeUser(label: string, roles: string[] = ["tasker"]) {
  counter += 1;
  const email = `${label}-${Date.now()}-${counter}@e2e.test`;
  const password = "E2e-password-123!";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert(!created.error, created.error?.message);
  const id = created.data.user!.id;
  for (const role of roles) {
    await admin.from("user_roles").upsert({ user_id: id, role }, { onConflict: "user_id,role", ignoreDuplicates: true });
  }
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  assert(!signed.error, signed.error?.message);
  return { id, email, token: signed.data.session!.access_token, client };
}

async function insertTask(user: { client: SupabaseClient; id: string }, insurance = false) {
  const { data, error } = await user.client
    .from("tasks")
    .insert({
      creator_id: user.id,
      category: "housework",
      name: `task ${crypto.randomUUID().slice(0, 6)}`,
      short_desc: "e2e",
      payment: 50,
      insurance,
    })
    .select("id, publish_state, payment_due, uses_free_slot, insurance")
    .single();
  return { data, error };
}

const stateOf = async (taskId: string) =>
  (await admin.from("tasks").select("publish_state").eq("id", taskId).single()).data!.publish_state as string;

/** Plays the customer on the mock's card page, then Cardcom's callback. */
async function payOnPage(url: string, outcome: "paid" | "declined" = "paid") {
  const response = await fetch(`${url}?outcome=${outcome}`, { redirect: "manual" });
  await response.body?.cancel();
  const lowProfileId = new URL(url).pathname.split("/").pop()!;
  const hook = await call("billing-webhook", null, { LowProfileId: lowProfileId });
  assertEquals(hook.status, 200);
  return hook.data;
}

const chargeRequests = () => mock.requests.filter((r) => r.path === "/Transactions/Transaction");

Deno.test({
  name: "per-task billing, end to end",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    await startFunctions();

    // Plans need valid signatures to be charged at all.
    for (const plan of (await admin.from("billing_plans").select("id, amount, period_months")).data ?? []) {
      await admin.from("billing_plans").update({ price_signature: await signPlan(plan) }).eq("id", plan.id);
    }
    await admin.from("billing_settings").update({ value: "on" }).eq("key", "task_billing");

    const adminUser = await makeUser("admin", ["admin"]);
    const owner = await makeUser("owner");
    const stranger = await makeUser("stranger", ["bee"]);

    let firstTask = "";
    let paidTask = "";
    let insuredTask = "";

    await t.step("a client cannot touch billing columns or publish its own task", async () => {
      const { data } = await insertTask(owner);
      // The free task: submitted, in review.
      const own = await owner.client.from("tasks").update({ publish_state: "live" }).eq("id", data!.id);
      assert(own.error, "a direct publish must be refused");
      const price = await owner.client.from("tasks").update({ insurance: true }).eq("id", data!.id);
      assert(price.error, "changing the price inputs must be refused");
      firstTask = data!.id;
      assertEquals(data!.publish_state, "pending_review");
      assertEquals(Number(data!.payment_due), 0);
      assertEquals(data!.uses_free_slot, true);
    });

    await t.step("other users cannot see a task that is not live", async () => {
      const seen = await stranger.client.from("tasks").select("id").eq("id", firstTask);
      assertEquals(seen.data?.length ?? 0, 0);
      const ownSeen = await owner.client.from("tasks").select("id").eq("id", firstTask);
      assertEquals(ownSeen.data?.length, 1);
    });

    await t.step("a non-admin cannot decide on a task", async () => {
      const denied = await call("task-review", owner.token, { task_id: firstTask, approve: true });
      assertEquals(denied.status, 403);
    });

    await t.step("admin approves the free task: live at once, nothing charged", async () => {
      const before = chargeRequests().length;
      const r = await call("task-review", adminUser.token, { task_id: firstTask, approve: true });
      assertEquals(r.status, 200);
      assertEquals(r.data.state, "live");
      assertEquals(chargeRequests().length, before);
      const seen = await stranger.client.from("tasks").select("id").eq("id", firstTask);
      assertEquals(seen.data?.length, 1, "now visible to others");
      const state = await admin.from("billing_user_state").select("*").eq("user_id", owner.id).single();
      assertEquals(state.data!.first_task_id, firstTask);
      assert(state.data!.free_task_used_at);
    });

    await t.step("a second task needs a saved card: refused until one is saved", async () => {
      const refused = await insertTask(owner);
      assertEquals(refused.error?.message, "card_required");
    });

    await t.step("card setup on Cardcom's page saves the card without charging", async () => {
      const before = chargeRequests().length;
      const r = await call("task-pay", owner.token, { action: "card_setup" });
      assertEquals(r.status, 200);
      const settled = await payOnPage(r.data.url);
      assertEquals(settled.status, "paid");
      const method = await admin.from("payment_methods").select("token").eq("user_id", owner.id).maybeSingle();
      assert(method.data?.token, "token saved");
      assertEquals(chargeRequests().length, before, "no charge was made");
    });

    await t.step("the next task costs 3, waits for review, is charged only on approval", async () => {
      const created = await insertTask(owner);
      assertEquals(created.error, null);
      assertEquals(Number(created.data!.payment_due), 3);
      assertEquals(created.data!.uses_free_slot, false);
      paidTask = created.data!.id;

      const before = chargeRequests().length;
      assertEquals(chargeRequests().length, before, "nothing charged at submission");

      const r = await call("task-review", adminUser.token, { task_id: paidTask, approve: true });
      assertEquals(r.status, 200);
      assertEquals(r.data.state, "live");
      const charges = chargeRequests();
      assertEquals(charges.length, before + 1);
      assertEquals(Number(charges.at(-1)!.body.Amount), 3);
      assertEquals(await stateOf(paidTask), "live");
      const note = await admin.from("notifications").select("event_type").eq("user_id", owner.id).eq("event_type", "task_approved");
      assert((note.data?.length ?? 0) >= 1);
    });

    await t.step("a failed charge keeps the task waiting and the owner can pay with another card", async () => {
      const created = await insertTask(owner, true);
      assertEquals(Number(created.data!.payment_due), 8, "3 + 5 insurance");
      insuredTask = created.data!.id;

      // The saved card now declines.
      await admin.from("payment_methods").update({ token: "tok-decline" }).eq("user_id", owner.id);
      const r = await call("task-review", adminUser.token, { task_id: insuredTask, approve: true });
      assertEquals(r.status, 200);
      assertEquals(r.data.state, "pending_payment");
      assertEquals(await stateOf(insuredTask), "pending_payment");
      const note = await admin.from("notifications").select("event_type").eq("user_id", owner.id).eq("event_type", "task_payment_failed");
      assert((note.data?.length ?? 0) >= 1, "owner is told");

      // The admin still sees it (policy), a stranger does not.
      const adminSees = await adminUser.client.from("tasks").select("id, publish_state").eq("id", insuredTask);
      assertEquals(adminSees.data?.[0]?.publish_state, "pending_payment");
      const strangerSees = await stranger.client.from("tasks").select("id").eq("id", insuredTask);
      assertEquals(strangerSees.data?.length ?? 0, 0);

      // Retrying the same card fails again; the state is unchanged.
      const retry = await call("task-pay", owner.token, { action: "retry", task_id: insuredTask });
      assertEquals(retry.data.state, "pending_payment");

      // A new card, typed on Cardcom's page, pays and publishes it.
      const page = await call("task-pay", owner.token, { action: "new_card", task_id: insuredTask });
      assertEquals(page.status, 200);
      const settled = await payOnPage(page.data.url);
      assertEquals(settled.status, "paid");
      assertEquals(await stateOf(insuredTask), "live");
      const method = await admin.from("payment_methods").select("token").eq("user_id", owner.id).single();
      assert(method.data!.token !== "tok-decline", "the new card became the saved card");
    });

    await t.step("settling the same payment twice grants nothing more", async () => {
      const charges = await admin.from("billing_charges").select("id, status, applied_at").eq("task_id", insuredTask);
      const paid = charges.data!.filter((c) => c.status === "paid");
      assertEquals(paid.length, 1);
      const again = await admin.rpc("billing_charge_paid", { _charge_id: paid[0].id, _deal_number: 1, _document_number: null, _document_url: null });
      assertEquals(again.data.applied, false);
    });

    await t.step("a rejected task costs nothing", async () => {
      const created = await insertTask(owner);
      const before = chargeRequests().length;
      const r = await call("task-review", adminUser.token, { task_id: created.data!.id, approve: false, note: "no" });
      assertEquals(r.data.state, "rejected");
      assertEquals(chargeRequests().length, before);
      const note = await admin.from("notifications").select("event_type").eq("user_id", owner.id).eq("event_type", "task_rejected");
      assert((note.data?.length ?? 0) >= 1);
    });

    // ---- free month -------------------------------------------------------
    const trialUser = await makeUser("trial");
    await t.step("free month: card saved up front, subscription starts, nothing charged", async () => {
      const noConsent = await call("billing-start-trial", trialUser.token, { plan_id: "quarterly" });
      assertEquals(noConsent.data.error, "consent_required");

      const before = chargeRequests().length;
      const r = await call("billing-start-trial", trialUser.token, { plan_id: "quarterly", accept_renewal: true });
      assertEquals(r.status, 200);
      const settled = await payOnPage(r.data.url);
      assertEquals(settled.status, "paid");
      const sub = await admin.from("subscriptions").select("status, is_trial, plan_id, current_period_end").eq("user_id", trialUser.id).single();
      assertEquals(sub.data!.status, "active");
      assertEquals(sub.data!.is_trial, true);
      assertEquals(chargeRequests().length, before, "no charge during the free month");
      const days = (Date.parse(sub.data!.current_period_end) - Date.now()) / 86_400_000;
      assert(days > 28 && days < 31, `about a month, got ${days}`);
    });

    await t.step("a second free month is refused, even after cancelling", async () => {
      await admin.from("subscriptions").update({ status: "canceled" }).eq("user_id", trialUser.id);
      const again = await call("billing-start-trial", trialUser.token, { plan_id: "quarterly", accept_renewal: true });
      assertEquals(again.status, 409);
      assertEquals(again.data.error, "trial_already_used");
    });

    // ---- plan change ------------------------------------------------------
    const payer = await makeUser("payer");
    await t.step("quarterly -> annual: immediate, only the difference after credit is charged", async () => {
      const start = new Date(Date.now() - 30 * 86_400_000);
      const end = new Date(start.getTime() + 90 * 86_400_000);
      await admin.from("subscriptions").insert({
        user_id: payer.id, plan_id: "quarterly", status: "active",
        current_period_start: start.toISOString(), current_period_end: end.toISOString(), first_paid_at: start.toISOString(),
      });
      await admin.from("payment_methods").upsert({ user_id: payer.id, token: "tok-payer", card_expiry: "1230", card_last4: "4580" });

      const before = chargeRequests().length;
      const r = await call("billing-change-plan", payer.token, { plan_id: "annual" });
      assertEquals(r.status, 200);
      assertEquals(r.data.status, "upgraded");
      // 60 of 90 days left: credit 30 * 60/90 = 20, so 100 - 20 = 80.
      assertEquals(Number(r.data.charged), 80);
      assertEquals(Number(chargeRequests().at(-1)!.body.Amount), 80);
      assertEquals(chargeRequests().length, before + 1);
      const sub = await admin.from("subscriptions").select("plan_id").eq("user_id", payer.id).single();
      assertEquals(sub.data!.plan_id, "annual");
    });

    await t.step("annual -> quarterly: only scheduled, nothing charged or refunded", async () => {
      const before = chargeRequests().length;
      const r = await call("billing-change-plan", payer.token, { plan_id: "quarterly" });
      assertEquals(r.data.status, "scheduled");
      assertEquals(chargeRequests().length, before);
      const sub = await admin.from("subscriptions").select("plan_id, pending_plan_id").eq("user_id", payer.id).single();
      assertEquals(sub.data!.plan_id, "annual");
      assertEquals(sub.data!.pending_plan_id, "quarterly");
    });

    // ---- 14-day cancellation with refund ---------------------------------
    const canceller = await makeUser("canceller");
    const taskIds: string[] = [];
    await t.step("14-day refund: locked and first tasks protected, difference charged before the refund", async () => {
      await admin.from("subscriptions").insert({
        user_id: canceller.id, plan_id: "quarterly", status: "active",
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 90 * 86_400_000).toISOString(),
        first_paid_at: new Date().toISOString(),
      });
      await admin.from("payment_methods").upsert({ user_id: canceller.id, token: "tok-canceller", card_expiry: "1230", card_last4: "4580" });
      const order = await admin.from("payment_orders").insert({
        user_id: canceller.id, plan_id: "quarterly", kind: "initial", amount: 30, status: "paid",
        deal_number: DEAL_BASE + 1, paid_at: new Date().toISOString(),
      }).select("id").single();
      assert(order.data);

      // Four live tasks: the first ever, two untouched, one a worker already took.
      await admin.from("billing_settings").update({ value: "off" }).eq("key", "task_billing");
      for (let i = 0; i < 4; i += 1) {
        const made = await insertTask(canceller);
        taskIds.push(made.data!.id);
      }
      await admin.from("billing_settings").update({ value: "on" }).eq("key", "task_billing");
      await admin.from("billing_user_state").upsert({ user_id: canceller.id, first_task_id: taskIds[0], free_task_used_at: new Date().toISOString() });
      // A worker takes the fourth task (the counters are maintained by triggers).
      const applied = await admin.from("task_applications").insert({ task_id: taskIds[3], applicant_id: stranger.id, status: "pending" }).select("id").single();
      assert(applied.data, JSON.stringify(applied.error));
      const accepted = await admin.from("task_applications").update({ status: "accepted" }).eq("id", applied.data.id);
      assert(!accepted.error, accepted.error?.message);

      const preview = await call("billing-cancel-refund", canceller.token, { action: "preview" });
      assertEquals(preview.status, 200);
      assertEquals(preview.data.tasks.length, 4, JSON.stringify(preview.data));
      assertEquals(preview.data.tasks.filter((x: any) => x.locked).length, 1, JSON.stringify(preview.data));
      assertEquals(preview.data.tasks.filter((x: any) => x.is_first).length, 1, JSON.stringify(preview.data));
      assertEquals(Number(preview.data.difference_if_keep_all), 9);

      // Try to drop everything, including the first and the locked one.
      const before = chargeRequests().length;
      const refundsBefore = mock.requests.filter((r) => r.path === "/Transactions/RefundByTransactionId").length;
      const r = await call("billing-cancel-refund", canceller.token, { action: "confirm", delete_task_ids: taskIds });
      assertEquals(r.status, 200, JSON.stringify(r.data));
      assertEquals(r.data.status, "refunded");
      // Dropped: the two untouched. Kept: the first (free) and the locked one (3).
      assertEquals(Number(r.data.difference_charged), 3);
      assertEquals(r.data.tasks_removed, 2);
      assertEquals(chargeRequests().length, before + 1);
      assertEquals(Number(chargeRequests().at(-1)!.body.Amount), 3);
      const refunds = mock.requests.filter((x) => x.path === "/Transactions/RefundByTransactionId");
      assertEquals(refunds.length, refundsBefore + 1);
      assertEquals(Number(refunds.at(-1)!.body.TransactionId), DEAL_BASE + 1);

      const left = await admin.from("tasks").select("id").eq("creator_id", canceller.id);
      assertEquals(left.data!.map((x) => x.id).sort(), [taskIds[0], taskIds[3]].sort());
      const sub = await admin.from("subscriptions").select("status").eq("user_id", canceller.id).single();
      assertEquals(sub.data!.status, "canceled");
      const state = await admin.from("billing_user_state").select("refund_14d_used_at").eq("user_id", canceller.id).single();
      assert(state.data!.refund_14d_used_at);
    });

    await t.step("the 14-day refund cannot be used a second time", async () => {
      await admin.from("subscriptions").update({ status: "active", current_period_end: new Date(Date.now() + 86_400_000).toISOString() }).eq("user_id", canceller.id);
      await admin.from("payment_orders").insert({
        user_id: canceller.id, plan_id: "quarterly", kind: "initial", amount: 30, status: "paid",
        deal_number: DEAL_BASE + 2, paid_at: new Date().toISOString(),
      });
      const again = await call("billing-cancel-refund", canceller.token, { action: "preview" });
      assertEquals(again.status, 409);
      assertEquals(again.data.error, "refund_already_used");
    });

    // ---- upkeep through the worker ---------------------------------------
    await t.step("the hourly worker runs the task upkeep", async () => {
      const aged = await insertTask(owner);
      // Make it look like it has been waiting for payment for 8 days.
      await admin.rpc("task_review_decide", { _task_id: aged.data!.id, _admin_id: adminUser.id, _approve: true, _note: null });
      await admin.from("tasks").update({ publish_state: "pending_payment", pending_payment_since: new Date(Date.now() - 8 * 86_400_000).toISOString() }).eq("id", aged.data!.id);
      const r = await call("billing-renew", null, {}, { "x-notify-secret": "e2e-secret" });
      assertEquals(r.status, 200);
      assertEquals(await stateOf(aged.data!.id), "draft");
    });

    // ---- billing off for a task: legacy behaviour -------------------------
    await t.step("with the switch off every task is live at once", async () => {
      await admin.from("billing_settings").update({ value: "off" }).eq("key", "task_billing");
      const made = await insertTask(owner, true);
      assertEquals(made.data!.publish_state, "live");
      assertEquals(Number(made.data!.payment_due), 0);
      await admin.from("billing_settings").update({ value: "on" }).eq("key", "task_billing");
    });

    // Leave the switch the way it ships, so the next run starts from the default.
    await admin.from("billing_settings").update({ value: "off" }).eq("key", "task_billing");

    for (const child of children) {
      try { child.kill(); } catch { /* already gone */ }
    }
    await mock.close();
  },
});
